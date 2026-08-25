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
  status: 'WAITING_FOR_SLOT' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  actionType: string;
  clarificationPrompts?: Record<string, string>;
  clarificationPrompt?: string;
}

export interface ExecutionLog {
  contextId: string;
  ownerId: string;
  sessionId: string;
  intent: string;
  event: {
    type: string;
    payload: Record<string, any>;
  };
  timestamp: number;
}

export type ActionDispatchHandler = (
  event: { type: string; payload: Record<string, any> },
  context: DialogueContext,
  identity: SessionIdentity
) => void;

export interface DialogueManagerConfig {
  maxActiveContexts?: number;
  defaultTtlMs?: number;
  onActionDispatch?: ActionDispatchHandler;
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
  private executionLogs: ExecutionLog[] = [];
  private maxActiveContexts: number;
  private defaultTtlMs: number;
  private onActionDispatch?: ActionDispatchHandler;
  private timerMap: Map<string, any> = new Map();
  private enableAutoExpiryScheduler: boolean;

  constructor(configOrTimeout: DialogueManagerConfig | number = {}) {
    if (typeof configOrTimeout === 'number') {
      this.defaultTtlMs = configOrTimeout;
      this.maxActiveContexts = 50;
      this.enableAutoExpiryScheduler = true;
    } else {
      this.maxActiveContexts = configOrTimeout.maxActiveContexts ?? 50;
      this.defaultTtlMs = configOrTimeout.defaultTtlMs ?? 300000;
      this.onActionDispatch = configOrTimeout.onActionDispatch;
      this.enableAutoExpiryScheduler = configOrTimeout.enableAutoExpiryScheduler ?? true;
    }
    this.reset();
  }

  public setActionDispatchHandler(handler: ActionDispatchHandler): void {
    this.onActionDispatch = handler;
  }

  public reset(): void {
    for (const timer of this.timerMap.values()) {
      clearTimeout(timer);
    }
    this.timerMap.clear();
    this.contexts.clear();
    this.activeContextId = null;
    this.executionLogs = [];
  }

  public getActiveContextId(): string | null {
    return this.activeContextId;
  }

  public getActiveState(): DialogueContext | null {
    if (!this.activeContextId) return null;
    return this.contexts.get(this.activeContextId) || null;
  }

  public getContext(contextId: string, identity?: SessionIdentity): DialogueContext | undefined {
    const ctx = this.contexts.get(contextId);
    if (!ctx) return undefined;
    if (identity && (ctx.ownerId !== identity.ownerId || ctx.sessionId !== identity.sessionId)) {
      return undefined; // Security: no information leakage for cross-owner requests
    }
    return ctx;
  }

  public listContexts(identity?: SessionIdentity): DialogueContext[] {
    const all = Array.from(this.contexts.values());
    if (!identity) return all;
    return all.filter(c => c.ownerId === identity.ownerId && c.sessionId === identity.sessionId);
  }

  public activateContext(contextId: string, identity?: SessionIdentity): boolean {
    const ctx = this.contexts.get(contextId);
    if (!ctx) return false;
    if (identity && (ctx.ownerId !== identity.ownerId || ctx.sessionId !== identity.sessionId)) {
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
    initialSlots: Record<string, any> = {},
    requiredSlots: string[] = [],
    actionType: string = '',
    clarificationPrompts: Record<string, string> = {},
    identity: SessionIdentity = { ownerId: 'default-owner', sessionId: 'default-session' }
  ): DialogueContext {
    if (!actionType) {
      throw new Error('CONTRACT_VIOLATION: actionType is strictly required for createContext');
    }

    // Entity deduplication scoped strictly to the same owner and session
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
      clarificationPrompts,
      clarificationPrompt: firstMissing ? clarificationPrompts[firstMissing] : undefined
    };

    this.contexts.set(contextId, newContext);
    this.activeContextId = contextId;

    if (newContext.status === 'COMPLETED') {
      this.recordExecution(newContext, identity);
    } else {
      this.scheduleTtlTimer(contextId, this.defaultTtlMs);
    }

    return newContext;
  }

  public resolveRouting(
    phrase: string,
    extractedSlotKeys: string[],
    identity: SessionIdentity = { ownerId: 'default-owner', sessionId: 'default-session' }
  ): RoutingResult {
    const text = phrase.toLowerCase();
    const tokens = text.split(/\s+/);

    // 1. Check for cross-owner explicit entity collision
    for (const ctx of this.contexts.values()) {
      if (ctx.status !== 'WAITING_FOR_SLOT') continue;

      for (const [slotKey, slotVal] of Object.entries(ctx.slots)) {
        if (slotVal === undefined || slotVal === null) continue;
        const valStr = String(slotVal).toLowerCase();

        if (tokens.includes(valStr) || text.includes(valStr)) {
          // Ownership verification on explicit entity match
          if (ctx.ownerId !== identity.ownerId || ctx.sessionId !== identity.sessionId) {
            return { status: 'CONTEXT_ACCESS_DENIED' };
          }
          this.activeContextId = ctx.contextId;
          return { status: 'RESOLVED', contextId: ctx.contextId };
        }
      }
    }

    // 2. Candidate Resolution filtered strictly by current session ownership
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
    contextId?: string,
    identity: SessionIdentity = { ownerId: 'default-owner', sessionId: 'default-session' }
  ): DialogueContext | { status: 'CONTEXT_ACCESS_DENIED' } | null {
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
      ctx.status = 'COMPLETED';
      ctx.clarificationPrompt = undefined;
      if (this.timerMap.has(ctx.contextId)) {
        clearTimeout(this.timerMap.get(ctx.contextId));
        this.timerMap.delete(ctx.contextId);
      }
      this.recordExecution(ctx, identity);
    } else {
      const nextMissing = ctx.missingSlots[0];
      ctx.clarificationPrompt = ctx.clarificationPrompts?.[nextMissing] || `Укажите ${nextMissing}`;
      this.scheduleTtlTimer(ctx.contextId, this.defaultTtlMs);
    }

    return ctx;
  }

  public cancelContext(
    contextId?: string,
    identity: SessionIdentity = { ownerId: 'default-owner', sessionId: 'default-session' }
  ): boolean | { status: 'CONTEXT_ACCESS_DENIED' } {
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

  public recordExecution(
    ctx: DialogueContext,
    identity: SessionIdentity = { ownerId: 'default-owner', sessionId: 'default-session' }
  ): void {
    if (ctx.ownerId !== identity.ownerId || ctx.sessionId !== identity.sessionId) {
      throw new Error('SECURITY_VIOLATION: Cannot record execution for cross-owner context');
    }

    const exists = this.executionLogs.some(l => l.contextId === ctx.contextId);
    if (exists) return;

    if (!ctx.actionType) {
      throw new Error('CONTRACT_VIOLATION: Cannot record execution without actionType');
    }

    const eventObj = {
      type: ctx.actionType,
      payload: { ...ctx.slots }
    };

    this.executionLogs.push({
      contextId: ctx.contextId,
      ownerId: ctx.ownerId,
      sessionId: ctx.sessionId,
      intent: ctx.intent,
      event: eventObj,
      timestamp: Date.now()
    });

    if (this.onActionDispatch) {
      this.onActionDispatch(eventObj, ctx, identity);
    }
  }

  public getExecutionLogs(identity?: SessionIdentity): ExecutionLog[] {
    if (!identity) return [...this.executionLogs];
    return this.executionLogs.filter(l => l.ownerId === identity.ownerId && l.sessionId === identity.sessionId);
  }
}
