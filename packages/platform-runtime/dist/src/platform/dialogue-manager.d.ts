export interface SessionIdentity {
    ownerId: string;
    sessionId: string;
}
export interface OfferDefinition {
    offerId: string;
    index: number;
    driver: string;
    vehicleType: string;
    etaMinutes: number;
    price: number;
    distanceKm: number;
    status: 'AVAILABLE' | 'UNAVAILABLE';
}
export interface DialogueContext {
    contextId: string;
    version: number;
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
    offers?: OfferDefinition[];
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
    event?: {
        type: string;
        payload: Record<string, any>;
    };
}
export type DispatchResult = {
    status: 'SUCCEEDED';
    executionId: string;
    attempt: number;
} | {
    status: 'FAILED';
    executionId: string;
    errorCode: string;
    attempt: number;
} | {
    status: 'UNKNOWN';
    executionId: string;
    errorCode: string;
    attempt: number;
};
export interface RetryPolicy {
    maxAttempts: number;
    retryableErrors: string[];
}
export type ActionDispatcher = (event: {
    type: string;
    payload: Record<string, any>;
}, context: DialogueContext, execution: ActionExecution) => Promise<DispatchResult>;
export interface DialogueManagerConfig {
    maxActiveContexts?: number;
    defaultTtlMs?: number;
    actionDispatcher?: ActionDispatcher;
    retryPolicy?: RetryPolicy;
    enableAutoExpiryScheduler?: boolean;
}
export type RoutingResult = {
    status: 'RESOLVED';
    contextId: string;
} | {
    status: 'AMBIGUOUS_CONTEXT';
    candidateContextIds: string[];
} | {
    status: 'NO_MATCH';
} | {
    status: 'CONTEXT_ACCESS_DENIED';
};
export type MutationResult<T> = {
    success: true;
    data: T;
    version: number;
} | {
    success: false;
    error: 'CONTEXT_VERSION_CONFLICT' | 'TERMINAL_STATE' | 'CONTEXT_NOT_FOUND' | 'CONTEXT_ACCESS_DENIED' | 'SYSTEM_EVENT_NOT_HANDLED' | 'MUTATION_REJECTED';
    message: string;
};
export interface SystemEventDescriptor {
    type: string;
    targetTransition?: 'COMPLETE' | 'CANCEL' | 'NONE';
    payload?: Record<string, any>;
}
export declare class DialogueStateManager {
    private contexts;
    private activeContextId;
    private executions;
    private maxActiveContexts;
    private defaultTtlMs;
    private actionDispatcher?;
    private retryPolicy;
    private timerMap;
    private enableAutoExpiryScheduler;
    private contextMutationQueues;
    constructor(configOrTimeout?: DialogueManagerConfig | number);
    hasActionDispatcher(): boolean;
    setActionDispatcher(dispatcher: ActionDispatcher): void;
    reset(): void;
    private validateIdentity;
    getActiveContextId(): string | null;
    getActiveState(identity: SessionIdentity): DialogueContext | null;
    /**
     * Read the currently active context, or the most recent context for this session
     * when a terminal transition has cleared activeContextId. This is an inspection
     * helper; routing continues to use getActiveState and explicit context selection.
     */
    getLatestState(identity: SessionIdentity): DialogueContext | null;
    getContext(contextId: string, identity: SessionIdentity): DialogueContext | undefined;
    listContexts(identity: SessionIdentity): DialogueContext[];
    activateContext(contextId: string, identity: SessionIdentity): boolean;
    setOffersForContext(contextId: string, offers: OfferDefinition[], identity: SessionIdentity): boolean;
    executeSerializedMutation<T>(contextId: string, expectedVersion: number | undefined, identity: SessionIdentity, mutationFn: (ctx: DialogueContext) => Promise<{
        result: T;
        targetStatus?: DialogueContext['status'];
    } | null>): Promise<MutationResult<T>>;
    private scheduleTtlTimer;
    createContext(intent: string, initialSlots: Record<string, any>, requiredSlots: string[], actionType: string, clarificationPrompts: Record<string, string>, identity: SessionIdentity, scenarioId?: string, initialOffers?: OfferDefinition[]): DialogueContext;
    resolveRouting(phrase: string, extractedSlotKeys: string[], identity: SessionIdentity): RoutingResult;
    fillSlot(slotName: string, value: any, contextId: string, identity: SessionIdentity, expectedVersion?: number): Promise<MutationResult<DialogueContext>>;
    cancelContext(contextId: string, identity: SessionIdentity, expectedVersion?: number): Promise<MutationResult<boolean>>;
    expireContext(contextId: string, identity: SessionIdentity, expectedVersion?: number): Promise<MutationResult<boolean>>;
    handleSystemEvent(contextId: string, event: SystemEventDescriptor | string, identity: SessionIdentity, expectedVersion?: number): Promise<MutationResult<{
        handled: boolean;
        eventType: string;
        context: DialogueContext;
    }>>;
    createExecution(ctx: DialogueContext, identity: SessionIdentity, providedExecutionId?: string, payloadOverride?: Record<string, any>): ActionExecution;
    dispatchAction(executionId: string, payload: Record<string, any>, identity: SessionIdentity): Promise<DispatchResult>;
    reconcileExecution(executionId: string, resolvedStatus: 'SUCCEEDED' | 'FAILED', identity: SessionIdentity, errorCode?: string): Promise<ActionExecution>;
    getExecution(executionId: string, identity: SessionIdentity): ActionExecution | undefined;
    getExecutionLogs(identity: SessionIdentity): ActionExecution[];
}
