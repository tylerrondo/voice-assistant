export interface DialogueContext {
  contextId: string;
  intent: string;
  slots: Record<string, any>;
  missingSlots: string[];
  status: 'WAITING_FOR_SLOT' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
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

export class DialogueStateManager {
  private contexts: Map<string, DialogueContext> = new Map();
  private activeContextId: string | null = null;
  private executionLogs: ExecutionLog[] = [];
  private maxActiveContexts: number;
  private defaultTtlMs: number;

  constructor(config: DialogueManagerConfig = {}) {
    this.maxActiveContexts = config.maxActiveContexts ?? 50; // Configurable runtime policy, default 50
    this.defaultTtlMs = config.defaultTtlMs ?? 300000;
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

  public createContext(intent: string, initialSlots: Record<string, any> = {}, requiredSlots: string[] = ['orderId', 'payment']): DialogueContext {
    if (initialSlots.orderId) {
      const existing = Array.from(this.contexts.values()).find(
        c => c.intent === intent && c.slots.orderId === initialSlots.orderId && c.status === 'WAITING_FOR_SLOT'
      );
      if (existing) {
        this.activeContextId = existing.contextId;
        return existing;
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

    const newContext: DialogueContext = {
      contextId,
      intent,
      slots,
      missingSlots,
      status: missingSlots.length === 0 ? 'COMPLETED' : 'WAITING_FOR_SLOT',
      createdAt: now,
      updatedAt: now,
      expiresAt: now + this.defaultTtlMs,
      clarificationPrompt: missingSlots.includes('orderId') ? 'Какой заказ?' : (missingSlots.includes('payment') ? 'Какой способ оплаты?' : undefined)
    };

    this.contexts.set(contextId, newContext);
    this.activeContextId = contextId;

    if (newContext.status === 'COMPLETED') {
      this.recordExecution(newContext);
    }

    return newContext;
  }

  public routeUtterance(phrase: string): DialogueContext | null {
    const orderMatch = phrase.match(/100\d/);
    if (orderMatch) {
      const targetOrderId = parseInt(orderMatch[0], 10);
      const targetCtx = Array.from(this.contexts.values()).find(
        c => c.slots.orderId === targetOrderId && c.status === 'WAITING_FOR_SLOT'
      );
      if (targetCtx) {
        this.activeContextId = targetCtx.contextId;
        return targetCtx;
      }
    }

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
      ctx.clarificationPrompt = ctx.missingSlots.includes('orderId') ? 'Какой заказ?' : 'Какой способ оплаты?';
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

    let eventType = 'driver.order.accepted';
    if (ctx.intent === 'DRIVER_ARRIVED') eventType = 'driver.arrived';

    this.executionLogs.push({
      contextId: ctx.contextId,
      intent: ctx.intent,
      event: {
        type: eventType,
        payload: { ...ctx.slots }
      },
      timestamp: Date.now()
    });
  }

  public getExecutionLogs(): ExecutionLog[] {
    return [...this.executionLogs];
  }
}
