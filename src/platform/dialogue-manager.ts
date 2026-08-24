export interface DialogueContext {
  contextId: string;
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
  intent: string;
  event: {
    type: string;
    payload: Record<string, any>;
  };
  timestamp: number;
}

export interface DialogueManagerConfig {
  maxActiveContexts?: number;
  defaultTtlMs?: number;
}

export type RoutingResult =
  | { status: 'RESOLVED'; contextId: string }
  | { status: 'AMBIGUOUS_CONTEXT'; candidateContextIds: string[] }
  | { status: 'NO_MATCH' };

export class DialogueStateManager {
  private contexts: Map<string, DialogueContext> = new Map();
  private activeContextId: string | null = null;
  private executionLogs: ExecutionLog[] = [];
  private maxActiveContexts: number;
  private defaultTtlMs: number;

  constructor(configOrTimeout: DialogueManagerConfig | number = {}) {
    if (typeof configOrTimeout === 'number') {
      this.defaultTtlMs = configOrTimeout;
      this.maxActiveContexts = 50;
    } else {
      this.maxActiveContexts = configOrTimeout.maxActiveContexts ?? 50;
      this.defaultTtlMs = configOrTimeout.defaultTtlMs ?? 300000;
    }
    this.reset();
  }

  public reset(): void {
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

  public getContext(contextId: string): DialogueContext | undefined {
    return this.contexts.get(contextId);
  }

  public listContexts(): DialogueContext[] {
    return Array.from(this.contexts.values());
  }

  public activateContext(contextId: string): boolean {
    if (this.contexts.has(contextId)) {
      this.activeContextId = contextId;
      return true;
    }
    return false;
  }

  public createContext(
    intent: string,
    initialSlots: Record<string, any> = {},
    requiredSlots: string[] = [],
    actionType: string = '',
    clarificationPrompts: Record<string, string> = {}
  ): DialogueContext {
    if (!actionType) {
      throw new Error('CONTRACT_VIOLATION: actionType is strictly required for createContext');
    }

    // Entity-based deduplication/reuse: if context with identical entity slot is waiting, reactivate it
    for (const [key, value] of Object.entries(initialSlots)) {
      if (value !== undefined) {
        const existing = Array.from(this.contexts.values()).find(
          c => c.intent === intent && c.slots[key] === value && c.status === 'WAITING_FOR_SLOT'
        );
        if (existing) {
          this.activeContextId = existing.contextId;
          return existing;
        }
      }
    }

    const activeCount = Array.from(this.contexts.values()).filter(c => c.status === 'WAITING_FOR_SLOT').length;
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
      this.recordExecution(newContext);
    }

    return newContext;
  }

  public resolveRouting(phrase: string, extractedSlotKeys: string[]): RoutingResult {
    const text = phrase.toLowerCase();
    const tokens = text.split(/\s+/);

    // 1. Explicit Entity / Slot-value matching has highest priority
    for (const ctx of this.contexts.values()) {
      if (ctx.status !== 'WAITING_FOR_SLOT') continue;

      for (const [slotKey, slotVal] of Object.entries(ctx.slots)) {
        if (slotVal === undefined || slotVal === null) continue;
        const valStr = String(slotVal).toLowerCase();

        if (tokens.includes(valStr) || text.includes(valStr)) {
          this.activeContextId = ctx.contextId;
          return { status: 'RESOLVED', contextId: ctx.contextId };
        }
      }
    }

    // 2. Candidate Resolution: Filter contexts in WAITING_FOR_SLOT that are missing any extracted slot
    const candidates = Array.from(this.contexts.values()).filter(ctx => {
      if (ctx.status !== 'WAITING_FOR_SLOT') return false;
      return extractedSlotKeys.some(key => ctx.missingSlots.includes(key));
    });

    if (candidates.length === 1) {
      this.activeContextId = candidates[0].contextId;
      return { status: 'RESOLVED', contextId: candidates[0].contextId };
    }

    if (candidates.length > 1) {
      // Ambiguous input: no arbitrary selection, no silent activeContext fallback
      return {
        status: 'AMBIGUOUS_CONTEXT',
        candidateContextIds: candidates.map(c => c.contextId)
      };
    }

    return { status: 'NO_MATCH' };
  }

  public routeUtterance(phrase: string): DialogueContext | null {
    const text = phrase.toLowerCase();
    const tokens = text.split(/\s+/);

    // 1. Entity match across active contexts
    for (const ctx of this.contexts.values()) {
      if (ctx.status !== 'WAITING_FOR_SLOT') continue;

      for (const [slotKey, slotVal] of Object.entries(ctx.slots)) {
        if (slotVal === undefined || slotVal === null) continue;
        const valStr = String(slotVal).toLowerCase();

        if (tokens.includes(valStr) || text.includes(valStr)) {
          this.activeContextId = ctx.contextId;
          return ctx;
        }
      }
    }

    // 2. Active state
    return this.getActiveState();
  }

  public fillSlot(slotName: string, value: any, contextId?: string): DialogueContext | null {
    const targetId = contextId || this.activeContextId;
    if (!targetId) return null;

    const ctx = this.contexts.get(targetId);
    if (!ctx || ctx.status !== 'WAITING_FOR_SLOT') return null;

    ctx.slots[slotName] = value;
    ctx.missingSlots = ctx.missingSlots.filter(s => s !== slotName);
    ctx.updatedAt = Date.now();

    if (ctx.missingSlots.length === 0) {
      ctx.status = 'COMPLETED';
      ctx.clarificationPrompt = undefined;
      this.recordExecution(ctx);
    } else {
      const nextMissing = ctx.missingSlots[0];
      ctx.clarificationPrompt = ctx.clarificationPrompts?.[nextMissing] || `Укажите ${nextMissing}`;
    }

    return ctx;
  }

  public cancelContext(contextId?: string): boolean {
    const targetId = contextId || this.activeContextId;
    if (!targetId) return false;

    const ctx = this.contexts.get(targetId);
    if (!ctx) return false;

    ctx.status = 'CANCELLED';
    ctx.updatedAt = Date.now();
    return true;
  }

  public expireContext(contextId: string): boolean {
    const ctx = this.contexts.get(contextId);
    if (!ctx) return false;

    ctx.status = 'EXPIRED';
    ctx.updatedAt = Date.now();
    return true;
  }

  public recordExecution(ctx: DialogueContext): void {
    const exists = this.executionLogs.some(l => l.contextId === ctx.contextId);
    if (exists) return;

    if (!ctx.actionType) {
      throw new Error('CONTRACT_VIOLATION: Cannot record execution without actionType');
    }

    this.executionLogs.push({
      contextId: ctx.contextId,
      intent: ctx.intent,
      event: {
        type: ctx.actionType,
        payload: { ...ctx.slots }
      },
      timestamp: Date.now()
    });
  }

  public getExecutionLogs(): ExecutionLog[] {
    return [...this.executionLogs];
  }
}
