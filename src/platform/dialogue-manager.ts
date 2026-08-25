export interface SessionIdentity {
  ownerId: string;
  sessionId: string;
}

export interface DialogueContext {
  contextId: string;
  ownerId: string;
  sessionId: string;
  intent: string;
  slots: Record<string, any>;
  missingSlots: string[];
  status: 'WAITING_FOR_SLOT' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED' | 'DISPATCHING';
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  actionType: string;
  scenarioId?: string;
  clarificationPrompts?: Record<string, string>;
  clarificationPrompt?: string;
}

export type ExecutionStatus = 'PENDING' | 'DISPATCHING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';

export interface ActionExecution {
  executionId: string;
  idempotencyKey: string;
  ownerId: string;
  sessionId: string;
  contextId: string;
  scenarioId: string;
  intent: string;
  actionType: string;
  payload: Record<string, any>;
  status: ExecutionStatus;
  attempt: number;
  createdAt: number;
  updatedAt: number;
  errorCode?: string;
}

export type DispatchResult =
  | { status: 'SUCCEEDED'; executionId: string; attempt: number }
  | { status: 'FAILED'; executionId: string; errorCode: string; attempt: number }
  | { status: 'UNKNOWN'; executionId: string; errorCode: string; attempt: number };

export interface RetryPolicy {
  maxAttempts: number;
  retryableErrors: string[];
}

export type ActionDispatcher = (
  event: { type: string; payload: Record<string, any> },
  context: DialogueContext,
  execution: ActionExecution
) => Promise<DispatchResult>;

export interface DialogueManagerConfig {
  maxActiveContexts?: number;
  defaultTtlMs?: number;
  actionDispatcher?: ActionDispatcher;
  retryPolicy?: RetryPolicy;
  enableAutoExpiryScheduler?: boolean;
}

export type RoutingResult =
  | { status: 'RESOLVED'; contextId: string }
  | { status: 'AMBIGUOUS_CONTEXT'; candidateContextIds: string[] }
  | { status: 'NO_MATCH' }
  | { status: 'CONTEXT_ACCESS_DENIED' };

export class DialogueStateManager {
  private contexts: Map<string, DialogueContext> = new Map();
  private activeContextId: string | null = null;
  private executions: Map<string, ActionExecution> = new Map();
  private maxActiveContexts: number;
  private defaultTtlMs: number;
  private actionDispatcher?: ActionDispatcher;
  private retryPolicy: RetryPolicy;
  private timerMap: Map<string, any> = new Map();
  private enableAutoExpiryScheduler: boolean;

  constructor(configOrTimeout: DialogueManagerConfig | number = {}) {
    if (typeof configOrTimeout === 'number') {
      this.defaultTtlMs = configOrTimeout;
      this.maxActiveContexts = 50;
      this.enableAutoExpiryScheduler = true;
      this.retryPolicy = { maxAttempts: 3, retryableErrors: ['TIMEOUT', 'NETWORK_ERROR', 'TEMPORARY_UNAVAILABLE'] };
    } else {
      this.maxActiveContexts = configOrTimeout.maxActiveContexts ?? 50;
      this.defaultTtlMs = configOrTimeout.defaultTtlMs ?? 300000;
      this.actionDispatcher = configOrTimeout.actionDispatcher;
      this.retryPolicy = configOrTimeout.retryPolicy ?? { maxAttempts: 3, retryableErrors: ['TIMEOUT', 'NETWORK_ERROR', 'TEMPORARY_UNAVAILABLE'] };
      this.enableAutoExpiryScheduler = configOrTimeout.enableAutoExpiryScheduler ?? true;
    }
    this.reset();
  }

  public setActionDispatcher(dispatcher: ActionDispatcher): void {
    this.actionDispatcher = dispatcher;
  }

  public reset(): void {
    for (const timer of this.timerMap.values()) {
      clearTimeout(timer);
    }
    this.timerMap.clear();
    this.contexts.clear();
    this.activeContextId = null;
    this.executions.clear();
  }

  private validateIdentity(identity: SessionIdentity): void {
    if (!identity || typeof identity.ownerId !== 'string' || typeof identity.sessionId !== 'string' || !identity.ownerId || !identity.sessionId) {
      throw new Error('CONTRACT_VIOLATION: SessionIdentity with non-empty ownerId and sessionId is strictly required');
    }
  }

  public getActiveContextId(): string | null {
    return this.activeContextId;
  }

  public getActiveState(identity: SessionIdentity): DialogueContext | null {
    this.validateIdentity(identity);
    if (!this.activeContextId) return null;
    const ctx = this.contexts.get(this.activeContextId);
    if (!ctx || ctx.ownerId !== identity.ownerId || ctx.sessionId !== identity.sessionId) {
      return null;
    }
    return ctx;
  }

  public getContext(contextId: string, identity: SessionIdentity): DialogueContext | undefined {
    this.validateIdentity(identity);
    const ctx = this.contexts.get(contextId);
    if (!ctx) return undefined;
    if (ctx.ownerId !== identity.ownerId || ctx.sessionId !== identity.sessionId) {
      return undefined;
    }
    return ctx;
  }

  public listContexts(identity: SessionIdentity): DialogueContext[] {
    this.validateIdentity(identity);
    return Array.from(this.contexts.values()).filter(
      c => c.ownerId === identity.ownerId && c.sessionId === identity.sessionId
    );
  }

  public activateContext(contextId: string, identity: SessionIdentity): boolean {
    this.validateIdentity(identity);
    const ctx = this.contexts.get(contextId);
    if (!ctx || ctx.ownerId !== identity.ownerId || ctx.sessionId !== identity.sessionId) {
      return false;
    }
    this.activeContextId = contextId;
    return true;
  }

  private scheduleTtlTimer(contextId: string, ttlMs: number): void {
    if (!this.enableAutoExpiryScheduler) return;

    if (this.timerMap.has(contextId)) {
      clearTimeout(this.timerMap.get(contextId));
    }

    const timer = setTimeout(() => {
      this.expireContext(contextId);
      this.timerMap.delete(contextId);
    }, ttlMs);

    this.timerMap.set(contextId, timer);
  }

  public createContext(
    intent: string,
    initialSlots: Record<string, any>,
    requiredSlots: string[],
    actionType: string,
    clarificationPrompts: Record<string, string>,
    identity: SessionIdentity,
    scenarioId?: string
  ): DialogueContext {
    this.validateIdentity(identity);
    if (!actionType) {
      throw new Error('CONTRACT_VIOLATION: actionType is strictly required for createContext');
    }

    for (const [key, value] of Object.entries(initialSlots)) {
      if (value !== undefined) {
        const existing = Array.from(this.contexts.values()).find(
          c =>
            c.ownerId === identity.ownerId &&
            c.sessionId === identity.sessionId &&
            c.intent === intent &&
            c.slots[key] === value &&
            c.status === 'WAITING_FOR_SLOT'
        );
        if (existing) {
          this.activeContextId = existing.contextId;
          return existing;
        }
      }
    }

    const activeCount = Array.from(this.contexts.values()).filter(
      c => c.ownerId === identity.ownerId && c.sessionId === identity.sessionId && c.status === 'WAITING_FOR_SLOT'
    ).length;

    if (activeCount >= this.maxActiveContexts) {
      throw new Error(`REJECT_NEW_CONTEXT: Runtime policy max active contexts (${this.maxActiveContexts}) reached`);
    }

    const contextId = `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const slots = { ...initialSlots };
    const missingSlots = requiredSlots.filter(s => slots[s] === undefined);
    const now = Date.now();

    const firstMissing = missingSlots[0];
    const newContext: DialogueContext = {
      contextId,
      ownerId: identity.ownerId,
      sessionId: identity.sessionId,
      intent,
      slots,
      missingSlots,
      status: missingSlots.length === 0 ? 'COMPLETED' : 'WAITING_FOR_SLOT',
      createdAt: now,
      updatedAt: now,
      expiresAt: now + this.defaultTtlMs,
      actionType,
      scenarioId,
      clarificationPrompts,
      clarificationPrompt: firstMissing ? clarificationPrompts[firstMissing] : undefined
    };

    this.contexts.set(contextId, newContext);
    this.activeContextId = contextId;

    if (missingSlots.length > 0) {
      this.scheduleTtlTimer(contextId, this.defaultTtlMs);
    }

    return newContext;
  }

  public resolveRouting(
    phrase: string,
    extractedSlotKeys: string[],
    identity: SessionIdentity
  ): RoutingResult {
    this.validateIdentity(identity);
    const text = phrase.toLowerCase();
    const tokens = text.split(/\s+/);

    for (const ctx of this.contexts.values()) {
      if (ctx.status !== 'WAITING_FOR_SLOT') continue;

      for (const [slotKey, slotVal] of Object.entries(ctx.slots)) {
        if (slotVal === undefined || slotVal === null) continue;
        const valStr = String(slotVal).toLowerCase();

        if (tokens.includes(valStr) || text.includes(valStr)) {
          if (ctx.ownerId !== identity.ownerId || ctx.sessionId !== identity.sessionId) {
            return { status: 'CONTEXT_ACCESS_DENIED' };
          }
          this.activeContextId = ctx.contextId;
          return { status: 'RESOLVED', contextId: ctx.contextId };
        }
      }
    }

    const candidates = Array.from(this.contexts.values()).filter(ctx => {
      if (ctx.ownerId !== identity.ownerId || ctx.sessionId !== identity.sessionId) return false;
      if (ctx.status !== 'WAITING_FOR_SLOT') return false;
      return extractedSlotKeys.some(key => ctx.missingSlots.includes(key));
    });

    if (candidates.length === 1) {
      this.activeContextId = candidates[0].contextId;
      return { status: 'RESOLVED', contextId: candidates[0].contextId };
    }

    if (candidates.length > 1) {
      return {
        status: 'AMBIGUOUS_CONTEXT',
        candidateContextIds: candidates.map(c => c.contextId)
      };
    }

    return { status: 'NO_MATCH' };
  }

  public fillSlot(
    slotName: string,
    value: any,
    contextId: string,
    identity: SessionIdentity
  ): DialogueContext | { status: 'CONTEXT_ACCESS_DENIED' } | null {
    this.validateIdentity(identity);
    const targetId = contextId || this.activeContextId;
    if (!targetId) return null;

    const ctx = this.contexts.get(targetId);
    if (!ctx) return null;

    if (ctx.ownerId !== identity.ownerId || ctx.sessionId !== identity.sessionId) {
      return { status: 'CONTEXT_ACCESS_DENIED' };
    }

    if (ctx.status !== 'WAITING_FOR_SLOT') return null;

    ctx.slots[slotName] = value;
    ctx.missingSlots = ctx.missingSlots.filter(s => s !== slotName);
    ctx.updatedAt = Date.now();

    if (ctx.missingSlots.length === 0) {
      ctx.clarificationPrompt = undefined;
      if (this.timerMap.has(ctx.contextId)) {
        clearTimeout(this.timerMap.get(ctx.contextId));
        this.timerMap.delete(ctx.contextId);
      }
    } else {
      const nextMissing = ctx.missingSlots[0];
      ctx.clarificationPrompt = ctx.clarificationPrompts?.[nextMissing] || `Укажите ${nextMissing}`;
      this.scheduleTtlTimer(ctx.contextId, this.defaultTtlMs);
    }

    return ctx;
  }

  public cancelContext(
    contextId: string,
    identity: SessionIdentity
  ): boolean | { status: 'CONTEXT_ACCESS_DENIED' } {
    this.validateIdentity(identity);
    const targetId = contextId || this.activeContextId;
    if (!targetId) return false;

    const ctx = this.contexts.get(targetId);
    if (!ctx) return false;

    if (ctx.ownerId !== identity.ownerId || ctx.sessionId !== identity.sessionId) {
      return { status: 'CONTEXT_ACCESS_DENIED' };
    }

    ctx.status = 'CANCELLED';
    ctx.updatedAt = Date.now();
    if (this.timerMap.has(ctx.contextId)) {
      clearTimeout(this.timerMap.get(ctx.contextId));
      this.timerMap.delete(ctx.contextId);
    }
    return true;
  }

  public expireContext(contextId: string): boolean {
    const ctx = this.contexts.get(contextId);
    if (!ctx || ctx.status !== 'WAITING_FOR_SLOT') return false;

    ctx.status = 'EXPIRED';
    ctx.updatedAt = Date.now();
    if (this.timerMap.has(contextId)) {
      clearTimeout(this.timerMap.get(contextId));
      this.timerMap.delete(contextId);
    }
    return true;
  }

  public createExecution(
    ctx: DialogueContext,
    identity: SessionIdentity,
    providedExecutionId?: string
  ): ActionExecution {
    this.validateIdentity(identity);
    if (ctx.ownerId !== identity.ownerId || ctx.sessionId !== identity.sessionId) {
      throw new Error('SECURITY_VIOLATION: Cannot create execution for foreign context');
    }

    const executionId = providedExecutionId || `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const idempotencyKey = `idemp_${ctx.contextId}_${ctx.actionType}_${JSON.stringify(ctx.slots)}`;
    const now = Date.now();

    const execution: ActionExecution = {
      executionId,
      idempotencyKey,
      ownerId: identity.ownerId,
      sessionId: identity.sessionId,
      contextId: ctx.contextId,
      scenarioId: ctx.scenarioId || 'sc-default',
      intent: ctx.intent,
      actionType: ctx.actionType,
      payload: { ...ctx.slots },
      status: 'PENDING',
      attempt: 0,
      createdAt: now,
      updatedAt: now
    };

    this.executions.set(executionId, execution);
    return execution;
  }

  public async dispatchAction(
    executionId: string,
    payload: Record<string, any>,
    identity: SessionIdentity
  ): Promise<DispatchResult> {
    this.validateIdentity(identity);
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`CONTRACT_VIOLATION: Execution "${executionId}" not found`);
    }

    if (execution.ownerId !== identity.ownerId || execution.sessionId !== identity.sessionId) {
      throw new Error('SECURITY_VIOLATION: Cannot dispatch cross-session execution');
    }

    if (JSON.stringify(execution.payload) !== JSON.stringify(payload)) {
      throw new Error('CONTRACT_VIOLATION: Payload cannot be mutated for same executionId');
    }

    if (execution.status === 'SUCCEEDED') {
      return { status: 'SUCCEEDED', executionId: execution.executionId, attempt: execution.attempt };
    }

    if (execution.status === 'DISPATCHING') {
      return { status: 'UNKNOWN', executionId: execution.executionId, errorCode: 'ALREADY_IN_PROGRESS', attempt: execution.attempt };
    }

    const ctx = this.contexts.get(execution.contextId);
    if (!ctx) {
      throw new Error(`CONTRACT_VIOLATION: Context "${execution.contextId}" not found`);
    }

    let currentAttempt = execution.attempt;
    let lastResult: DispatchResult = { status: 'UNKNOWN', executionId, errorCode: 'INIT', attempt: currentAttempt };

    while (currentAttempt < this.retryPolicy.maxAttempts) {
      currentAttempt++;
      execution.attempt = currentAttempt;
      execution.status = 'DISPATCHING';
      execution.updatedAt = Date.now();

      if (!this.actionDispatcher) {
        execution.status = 'SUCCEEDED';
        execution.updatedAt = Date.now();
        ctx.status = 'COMPLETED';
        return { status: 'SUCCEEDED', executionId: execution.executionId, attempt: currentAttempt };
      }

      try {
        const result = await this.actionDispatcher(
          { type: execution.actionType, payload: execution.payload },
          ctx,
          execution
        );

        lastResult = result;
        execution.updatedAt = Date.now();

        if (result.status === 'SUCCEEDED') {
          execution.status = 'SUCCEEDED';
          ctx.status = 'COMPLETED';
          return result;
        }

        if (result.status === 'FAILED') {
          execution.errorCode = result.errorCode;
          if (!this.retryPolicy.retryableErrors.includes(result.errorCode)) {
            execution.status = 'FAILED';
            return result;
          }
        }

        if (result.status === 'UNKNOWN') {
          execution.status = 'UNKNOWN';
          execution.errorCode = result.errorCode;
          return result;
        }
      } catch (err: any) {
        const code = err.message || 'DISPATCH_ERROR';
        lastResult = { status: 'FAILED', executionId, errorCode: code, attempt: currentAttempt };
        execution.errorCode = code;

        if (!this.retryPolicy.retryableErrors.includes(code)) {
          execution.status = 'FAILED';
          return lastResult;
        }
      }
    }

    execution.status = lastResult.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED';
    if (execution.status !== 'SUCCEEDED') {
      execution.errorCode = lastResult.errorCode || 'MAX_RETRIES_EXCEEDED';
    }
    return lastResult;
  }

  public getExecution(executionId: string, identity: SessionIdentity): ActionExecution | undefined {
    this.validateIdentity(identity);
    const exec = this.executions.get(executionId);
    if (!exec) return undefined;
    if (exec.ownerId !== identity.ownerId || exec.sessionId !== identity.sessionId) {
      return undefined;
    }
    return exec;
  }

  public getExecutionLogs(identity: SessionIdentity): ActionExecution[] {
    this.validateIdentity(identity);
    return Array.from(this.executions.values()).filter(
      l => l.ownerId === identity.ownerId && l.sessionId === identity.sessionId
    );
  }
}
