export class DialogueStateManager {
    contexts = new Map();
    activeContextId = null;
    executions = new Map();
    maxActiveContexts;
    defaultTtlMs;
    actionDispatcher;
    retryPolicy;
    timerMap = new Map();
    enableAutoExpiryScheduler;
    // Per-Context Serialization Queues
    contextMutationQueues = new Map();
    constructor(configOrTimeout = {}) {
        if (typeof configOrTimeout === 'number') {
            this.defaultTtlMs = configOrTimeout;
            this.maxActiveContexts = 50;
            this.enableAutoExpiryScheduler = true;
            this.retryPolicy = { maxAttempts: 3, retryableErrors: ['TIMEOUT', 'NETWORK_ERROR', 'TEMPORARY_UNAVAILABLE'] };
        }
        else {
            this.maxActiveContexts = configOrTimeout.maxActiveContexts ?? 50;
            this.defaultTtlMs = configOrTimeout.defaultTtlMs ?? 300000;
            this.actionDispatcher = configOrTimeout.actionDispatcher;
            this.retryPolicy = configOrTimeout.retryPolicy ?? { maxAttempts: 3, retryableErrors: ['TIMEOUT', 'NETWORK_ERROR', 'TEMPORARY_UNAVAILABLE'] };
            this.enableAutoExpiryScheduler = configOrTimeout.enableAutoExpiryScheduler ?? true;
        }
        this.reset();
    }
    hasActionDispatcher() {
        return Boolean(this.actionDispatcher);
    }
    setActionDispatcher(dispatcher) {
        this.actionDispatcher = dispatcher;
    }
    reset() {
        for (const timer of this.timerMap.values()) {
            clearTimeout(timer);
        }
        this.timerMap.clear();
        this.contexts.clear();
        this.activeContextId = null;
        this.executions.clear();
        this.contextMutationQueues.clear();
    }
    validateIdentity(identity) {
        if (!identity || typeof identity.ownerId !== 'string' || typeof identity.sessionId !== 'string' || !identity.ownerId || !identity.sessionId) {
            throw new Error('CONTRACT_VIOLATION: SessionIdentity with non-empty ownerId and sessionId is strictly required');
        }
    }
    getActiveContextId() {
        return this.activeContextId;
    }
    getActiveState(identity) {
        this.validateIdentity(identity);
        // The pointer is global for compatibility and can be empty or foreign.
        // Prefer this session's latest waiting context only when it is newer than
        // its latest terminal context; otherwise inspection must expose the terminal
        // result rather than an older, unrelated waiting dialogue.
        const pointed = this.activeContextId ? this.contexts.get(this.activeContextId) : undefined;
        let ctx;
        if (pointed &&
            pointed.ownerId === identity.ownerId &&
            pointed.sessionId === identity.sessionId &&
            !['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(pointed.status)) {
            ctx = pointed;
        }
        else {
            const ownContexts = Array.from(this.contexts.values()).filter(candidate => candidate.ownerId === identity.ownerId && candidate.sessionId === identity.sessionId);
            const waiting = ownContexts
                .filter(candidate => candidate.status === 'WAITING_FOR_SLOT')
                .sort((a, b) => b.updatedAt - a.updatedAt)[0];
            const terminal = ownContexts
                .filter(candidate => ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(candidate.status))
                .sort((a, b) => b.updatedAt - a.updatedAt)[0];
            if (waiting && (!terminal || waiting.updatedAt >= terminal.updatedAt)) {
                ctx = waiting;
            }
        }
        if (!ctx)
            return null;
        return {
            ...ctx,
            slots: { ...ctx.slots },
            missingSlots: [...ctx.missingSlots],
            offers: ctx.offers ? [...ctx.offers.map(o => ({ ...o }))] : undefined
        };
    }
    /**
     * Read the currently active context, or the most recent context for this session
     * when a terminal transition has cleared activeContextId. This is an inspection
     * helper; routing continues to use getActiveState and explicit context selection.
     */
    getLatestState(identity) {
        const active = this.getActiveState(identity);
        if (active)
            return active;
        const ctx = this.listContexts(identity).sort((a, b) => b.updatedAt - a.updatedAt)[0];
        return ctx || null;
    }
    getContext(contextId, identity) {
        this.validateIdentity(identity);
        const ctx = this.contexts.get(contextId);
        if (!ctx)
            return undefined;
        if (ctx.ownerId !== identity.ownerId || ctx.sessionId !== identity.sessionId) {
            return undefined;
        }
        return {
            ...ctx,
            slots: { ...ctx.slots },
            missingSlots: [...ctx.missingSlots],
            offers: ctx.offers ? [...ctx.offers.map(o => ({ ...o }))] : undefined
        };
    }
    listContexts(identity) {
        this.validateIdentity(identity);
        return Array.from(this.contexts.values())
            .filter(c => c.ownerId === identity.ownerId && c.sessionId === identity.sessionId)
            .map(c => ({
            ...c,
            slots: { ...c.slots },
            missingSlots: [...c.missingSlots],
            offers: c.offers ? [...c.offers.map(o => ({ ...o }))] : undefined
        }));
    }
    activateContext(contextId, identity) {
        this.validateIdentity(identity);
        const ctx = this.contexts.get(contextId);
        if (!ctx || ctx.ownerId !== identity.ownerId || ctx.sessionId !== identity.sessionId) {
            return false;
        }
        this.activeContextId = contextId;
        return true;
    }
    setOffersForContext(contextId, offers, identity) {
        this.validateIdentity(identity);
        const ctx = this.contexts.get(contextId);
        if (!ctx || ctx.ownerId !== identity.ownerId || ctx.sessionId !== identity.sessionId) {
            return false;
        }
        ctx.offers = [...offers.map(o => ({ ...o }))];
        ctx.version += 1;
        ctx.updatedAt = Date.now();
        return true;
    }
    // --- Per-Context Serialization & Queue Lifecycle Management ---
    async executeSerializedMutation(contextId, expectedVersion, identity, mutationFn) {
        this.validateIdentity(identity);
        const prevPromise = this.contextMutationQueues.get(contextId) || Promise.resolve();
        const mutationPromise = prevPromise.then(async () => {
            const ctx = this.contexts.get(contextId);
            if (!ctx) {
                return { success: false, error: 'CONTEXT_NOT_FOUND', message: `Context "${contextId}" not found` };
            }
            if (ctx.ownerId !== identity.ownerId || ctx.sessionId !== identity.sessionId) {
                return { success: false, error: 'CONTEXT_ACCESS_DENIED', message: 'Cross-session context mutation is prohibited' };
            }
            // Optimistic CAS version check
            if (expectedVersion !== undefined && ctx.version !== expectedVersion) {
                return {
                    success: false,
                    error: 'CONTEXT_VERSION_CONFLICT',
                    message: `Version conflict for context "${contextId}". Expected: ${expectedVersion}, Current: ${ctx.version}`
                };
            }
            // Terminal State Protection
            if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(ctx.status)) {
                return {
                    success: false,
                    error: 'TERMINAL_STATE',
                    message: `Context "${contextId}" is in terminal state "${ctx.status}" and cannot be resurrected or modified`
                };
            }
            const outcome = await mutationFn(ctx);
            if (!outcome) {
                return { success: false, error: 'MUTATION_REJECTED', message: 'Mutation rejected by predicate' };
            }
            // Atomic version increment
            ctx.version += 1;
            ctx.updatedAt = Date.now();
            if (outcome.targetStatus) {
                ctx.status = outcome.targetStatus;
            }
            if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(ctx.status)) {
                if (this.timerMap.has(contextId)) {
                    clearTimeout(this.timerMap.get(contextId));
                    this.timerMap.delete(contextId);
                }
                if (this.activeContextId === contextId) {
                    this.activeContextId = null;
                }
            }
            return {
                success: true,
                data: outcome.result,
                version: ctx.version
            };
        }).catch(err => {
            return { success: false, error: 'MUTATION_REJECTED', message: err?.message || 'Unknown error' };
        }).finally(() => {
            if (this.contextMutationQueues.get(contextId) === mutationPromise) {
                this.contextMutationQueues.delete(contextId);
            }
        });
        this.contextMutationQueues.set(contextId, mutationPromise);
        return mutationPromise;
    }
    scheduleTtlTimer(contextId, ttlMs) {
        if (!this.enableAutoExpiryScheduler)
            return;
        if (this.timerMap.has(contextId)) {
            clearTimeout(this.timerMap.get(contextId));
        }
        const timer = setTimeout(() => {
            const ctx = this.contexts.get(contextId);
            if (ctx) {
                const identity = { ownerId: ctx.ownerId, sessionId: ctx.sessionId };
                this.expireContext(contextId, identity);
            }
            this.timerMap.delete(contextId);
        }, ttlMs);
        // In Node-based test runners, expiry timers must not keep the process alive
        // after the suite has completed. Browsers do not expose unref(), so this is
        // a no-op there and leaves normal runtime expiry unchanged.
        timer.unref?.();
        this.timerMap.set(contextId, timer);
    }
    createContext(intent, initialSlots, requiredSlots, actionType, clarificationPrompts, identity, scenarioId, initialOffers) {
        this.validateIdentity(identity);
        if (!actionType) {
            throw new Error('CONTRACT_VIOLATION: actionType is strictly required for createContext');
        }
        for (const [key, value] of Object.entries(initialSlots)) {
            if (value !== undefined) {
                const existing = Array.from(this.contexts.values()).find(c => c.ownerId === identity.ownerId &&
                    c.sessionId === identity.sessionId &&
                    c.intent === intent &&
                    c.slots[key] === value &&
                    c.status === 'WAITING_FOR_SLOT');
                if (existing) {
                    this.activeContextId = existing.contextId;
                    return {
                        ...existing,
                        slots: { ...existing.slots },
                        missingSlots: [...existing.missingSlots],
                        offers: existing.offers ? [...existing.offers.map(o => ({ ...o }))] : undefined
                    };
                }
            }
        }
        const activeCount = Array.from(this.contexts.values()).filter(c => c.ownerId === identity.ownerId && c.sessionId === identity.sessionId && c.status === 'WAITING_FOR_SLOT').length;
        if (activeCount >= this.maxActiveContexts) {
            throw new Error(`REJECT_NEW_CONTEXT: Runtime policy max active contexts (${this.maxActiveContexts}) reached`);
        }
        const contextId = `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const slots = { ...initialSlots };
        const missingSlots = requiredSlots.filter(s => slots[s] === undefined);
        const now = Date.now();
        const firstMissing = missingSlots[0];
        const newContext = {
            contextId,
            version: 1,
            ownerId: identity.ownerId,
            sessionId: identity.sessionId,
            intent,
            slots,
            missingSlots,
            status: 'WAITING_FOR_SLOT',
            createdAt: now,
            updatedAt: now,
            expiresAt: now + this.defaultTtlMs,
            actionType,
            scenarioId,
            clarificationPrompts,
            clarificationPrompt: firstMissing ? clarificationPrompts[firstMissing] : undefined,
            offers: initialOffers ? [...initialOffers.map(o => ({ ...o }))] : undefined
        };
        this.contexts.set(contextId, newContext);
        this.activeContextId = contextId;
        if (missingSlots.length > 0) {
            this.scheduleTtlTimer(contextId, this.defaultTtlMs);
        }
        return {
            ...newContext,
            slots: { ...newContext.slots },
            missingSlots: [...newContext.missingSlots],
            offers: newContext.offers ? [...newContext.offers.map(o => ({ ...o }))] : undefined
        };
    }
    resolveRouting(phrase, extractedSlotKeys, identity) {
        this.validateIdentity(identity);
        const text = phrase.toLowerCase();
        const tokens = text.split(/\s+/);
        let foreignContextMatched = false;
        for (const ctx of this.contexts.values()) {
            if (ctx.status !== 'WAITING_FOR_SLOT')
                continue;
            for (const [slotKey, slotVal] of Object.entries(ctx.slots)) {
                if (slotVal === undefined || slotVal === null)
                    continue;
                const valStr = String(slotVal).toLowerCase();
                const numericSlotValue = /^-?\d+(?:\.\d+)?$/.test(valStr);
                const valueMentioned = numericSlotValue
                    ? tokens.includes(valStr)
                    : tokens.includes(valStr) || text.includes(valStr);
                if (valueMentioned) {
                    if (ctx.ownerId !== identity.ownerId || ctx.sessionId !== identity.sessionId) {
                        foreignContextMatched = true;
                        continue;
                    }
                    this.activeContextId = ctx.contextId;
                    return { status: 'RESOLVED', contextId: ctx.contextId };
                }
            }
        }
        if (foreignContextMatched) {
            return { status: 'CONTEXT_ACCESS_DENIED' };
        }
        const candidates = Array.from(this.contexts.values()).filter(ctx => {
            if (ctx.ownerId !== identity.ownerId || ctx.sessionId !== identity.sessionId)
                return false;
            if (ctx.status !== 'WAITING_FOR_SLOT')
                return false;
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
    async fillSlot(slotName, value, contextId, identity, expectedVersion) {
        const targetId = contextId || this.activeContextId;
        if (!targetId) {
            return { success: false, error: 'CONTEXT_NOT_FOUND', message: 'No target contextId specified' };
        }
        return this.executeSerializedMutation(targetId, expectedVersion, identity, async (ctx) => {
            if (ctx.status !== 'WAITING_FOR_SLOT') {
                return null;
            }
            ctx.slots[slotName] = value;
            ctx.missingSlots = ctx.missingSlots.filter(s => s !== slotName);
            if (ctx.missingSlots.length === 0) {
                ctx.clarificationPrompt = undefined;
                if (this.timerMap.has(ctx.contextId)) {
                    clearTimeout(this.timerMap.get(ctx.contextId));
                    this.timerMap.delete(ctx.contextId);
                }
            }
            else {
                const nextMissing = ctx.missingSlots[0];
                ctx.clarificationPrompt = ctx.clarificationPrompts?.[nextMissing] || `Укажите ${nextMissing}`;
                this.scheduleTtlTimer(ctx.contextId, this.defaultTtlMs);
            }
            return {
                result: {
                    ...ctx,
                    slots: { ...ctx.slots },
                    missingSlots: [...ctx.missingSlots],
                    offers: ctx.offers ? [...ctx.offers.map(o => ({ ...o }))] : undefined
                }
            };
        });
    }
    async cancelContext(contextId, identity, expectedVersion) {
        const targetId = contextId || this.activeContextId;
        if (!targetId) {
            return { success: false, error: 'CONTEXT_NOT_FOUND', message: 'No target contextId specified' };
        }
        return this.executeSerializedMutation(targetId, expectedVersion, identity, async (ctx) => {
            if (this.timerMap.has(ctx.contextId)) {
                clearTimeout(this.timerMap.get(ctx.contextId));
                this.timerMap.delete(ctx.contextId);
            }
            return {
                result: true,
                targetStatus: 'CANCELLED'
            };
        });
    }
    async expireContext(contextId, identity, expectedVersion) {
        return this.executeSerializedMutation(contextId, expectedVersion, identity, async (ctx) => {
            if (ctx.status !== 'WAITING_FOR_SLOT') {
                return null;
            }
            if (this.timerMap.has(contextId)) {
                clearTimeout(this.timerMap.get(contextId));
                this.timerMap.delete(contextId);
            }
            return {
                result: true,
                targetStatus: 'EXPIRED'
            };
        });
    }
    async handleSystemEvent(contextId, event, identity, expectedVersion) {
        const descriptor = typeof event === 'string'
            ? { type: event, targetTransition: 'NONE' }
            : event;
        if (!descriptor.targetTransition || descriptor.targetTransition === 'NONE') {
            return {
                success: false,
                error: 'SYSTEM_EVENT_NOT_HANDLED',
                message: `System event "${descriptor.type}" specifies no state transition and was ignored without mutation.`
            };
        }
        return this.executeSerializedMutation(contextId, expectedVersion, identity, async (ctx) => {
            if (descriptor.targetTransition === 'CANCEL') {
                if (this.timerMap.has(ctx.contextId)) {
                    clearTimeout(this.timerMap.get(ctx.contextId));
                    this.timerMap.delete(ctx.contextId);
                }
                ctx.status = 'CANCELLED';
            }
            else if (descriptor.targetTransition === 'COMPLETE') {
                if (this.timerMap.has(ctx.contextId)) {
                    clearTimeout(this.timerMap.get(ctx.contextId));
                    this.timerMap.delete(ctx.contextId);
                }
                ctx.status = 'COMPLETED';
            }
            return {
                result: {
                    handled: true,
                    eventType: descriptor.type,
                    context: {
                        ...ctx,
                        slots: { ...ctx.slots },
                        missingSlots: [...ctx.missingSlots],
                        offers: ctx.offers ? [...ctx.offers.map(o => ({ ...o }))] : undefined
                    }
                }
            };
        });
    }
    createExecution(ctx, identity, providedExecutionId, payloadOverride) {
        this.validateIdentity(identity);
        if (ctx.ownerId !== identity.ownerId || ctx.sessionId !== identity.sessionId) {
            throw new Error('SECURITY_VIOLATION: Cannot create execution for foreign context');
        }
        // The caller may hold a stale context snapshot. Authorize and validate the
        // current stored state, not the snapshot, before creating an execution.
        const authoritativeCtx = this.contexts.get(ctx.contextId);
        if (!authoritativeCtx) {
            throw new Error(`CONTRACT_VIOLATION: Cannot create execution for missing context "${ctx.contextId}"`);
        }
        if (authoritativeCtx.ownerId !== identity.ownerId || authoritativeCtx.sessionId !== identity.sessionId) {
            throw new Error('SECURITY_VIOLATION: Cannot create execution for foreign context');
        }
        if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(authoritativeCtx.status)) {
            throw new Error(`CONTRACT_VIOLATION: Cannot create execution for terminal context (${authoritativeCtx.status})`);
        }
        const executionId = providedExecutionId || `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        if (this.executions.has(executionId)) {
            const existing = this.executions.get(executionId);
            const sameOwner = existing.ownerId === identity.ownerId && existing.sessionId === identity.sessionId;
            const sameCtx = existing.contextId === ctx.contextId;
            const sameAction = existing.actionType === authoritativeCtx.actionType;
            const expectedPayload = { ...(payloadOverride || {}), ...authoritativeCtx.slots };
            const samePayload = JSON.stringify(existing.payload) === JSON.stringify(expectedPayload);
            if (sameOwner && sameCtx && sameAction && samePayload) {
                return existing;
            }
            throw new Error(`CONTRACT_VIOLATION: Cannot overwrite existing executionId "${executionId}" with different execution data`);
        }
        const idempotencyKey = `idemp_${authoritativeCtx.contextId}_${executionId}_${authoritativeCtx.actionType}`;
        const now = Date.now();
        const execution = {
            executionId,
            idempotencyKey,
            ownerId: identity.ownerId,
            sessionId: identity.sessionId,
            contextId: authoritativeCtx.contextId,
            scenarioId: authoritativeCtx.scenarioId || 'sc-default',
            intent: authoritativeCtx.intent,
            actionType: authoritativeCtx.actionType,
            payload: { ...(payloadOverride || {}), ...authoritativeCtx.slots },
            status: 'PENDING',
            attempt: 0,
            createdAt: now,
            updatedAt: now
        };
        this.executions.set(executionId, execution);
        return execution;
    }
    async dispatchAction(executionId, payload, identity) {
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
        if (execution.status === 'FAILED') {
            throw new Error(`CONTRACT_VIOLATION: Cannot dispatch terminal FAILED execution "${executionId}". A new executionId must be created.`);
        }
        if (execution.status === 'UNKNOWN') {
            throw new Error(`CONTRACT_VIOLATION: Execution "${executionId}" is in UNKNOWN state. Explicit reconciliation is required before retry.`);
        }
        if (execution.status === 'DISPATCHING') {
            return { status: 'UNKNOWN', executionId: execution.executionId, errorCode: 'ALREADY_IN_PROGRESS', attempt: execution.attempt };
        }
        const contextId = execution.contextId;
        const prevPromise = this.contextMutationQueues.get(contextId) || Promise.resolve();
        const dispatchPromise = prevPromise.then(async () => {
            // Re-check after acquiring the per-context queue. Concurrent callers may
            // have observed PENDING before the first dispatch completed.
            if (execution.status === 'SUCCEEDED') {
                return { status: 'SUCCEEDED', executionId: execution.executionId, attempt: execution.attempt };
            }
            if (execution.status === 'FAILED') {
                throw new Error(`CONTRACT_VIOLATION: Cannot dispatch terminal FAILED execution "${executionId}". A new executionId must be created.`);
            }
            if (execution.status === 'UNKNOWN') {
                throw new Error(`CONTRACT_VIOLATION: Execution "${executionId}" is in UNKNOWN state. Explicit reconciliation is required before retry.`);
            }
            if (execution.status === 'DISPATCHING') {
                return { status: 'UNKNOWN', executionId: execution.executionId, errorCode: 'ALREADY_IN_PROGRESS', attempt: execution.attempt };
            }
            const ctx = this.contexts.get(contextId);
            if (!ctx) {
                throw new Error(`CONTRACT_VIOLATION: Context "${contextId}" not found`);
            }
            if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(ctx.status)) {
                throw new Error(`CONTRACT_VIOLATION: Context "${contextId}" is already in terminal status "${ctx.status}"`);
            }
            // Mark context as DISPATCHING under the queue lock
            ctx.status = 'DISPATCHING';
            ctx.version += 1;
            ctx.updatedAt = Date.now();
            let currentAttempt = execution.attempt;
            let lastResult = { status: 'UNKNOWN', executionId, errorCode: 'INIT', attempt: currentAttempt };
            while (currentAttempt < this.retryPolicy.maxAttempts) {
                currentAttempt++;
                execution.attempt = currentAttempt;
                execution.status = 'DISPATCHING';
                execution.updatedAt = Date.now();
                if (!this.actionDispatcher) {
                    execution.status = 'FAILED';
                    execution.errorCode = 'DISPATCHER_NOT_CONFIGURED';
                    execution.updatedAt = Date.now();
                    ctx.status = 'WAITING_FOR_SLOT';
                    ctx.version += 1;
                    ctx.updatedAt = Date.now();
                    return {
                        status: 'FAILED',
                        executionId: execution.executionId,
                        errorCode: 'DISPATCHER_NOT_CONFIGURED',
                        attempt: currentAttempt
                    };
                }
                try {
                    const result = await this.actionDispatcher({ type: execution.actionType, payload: execution.payload }, {
                        ...ctx,
                        slots: { ...ctx.slots },
                        missingSlots: [...ctx.missingSlots],
                        offers: ctx.offers ? [...ctx.offers.map(o => ({ ...o }))] : undefined
                    }, execution);
                    if (result.executionId !== execution.executionId || result.attempt !== execution.attempt) {
                        execution.status = 'FAILED';
                        execution.errorCode = 'DISPATCHER_IDENTITY_MISMATCH';
                        ctx.status = 'WAITING_FOR_SLOT';
                        ctx.version += 1;
                        ctx.updatedAt = Date.now();
                        throw new Error(`CONTRACT_VIOLATION: ActionDispatcher returned mismatched identity.`);
                    }
                    lastResult = result;
                    execution.updatedAt = Date.now();
                    if (result.status === 'SUCCEEDED') {
                        execution.status = 'SUCCEEDED';
                        ctx.status = 'COMPLETED';
                        if (this.timerMap.has(contextId)) {
                            clearTimeout(this.timerMap.get(contextId));
                            this.timerMap.delete(contextId);
                        }
                        ctx.version += 1;
                        ctx.updatedAt = Date.now();
                        return result;
                    }
                    if (result.status === 'FAILED') {
                        execution.errorCode = result.errorCode;
                        if (!this.retryPolicy.retryableErrors.includes(result.errorCode)) {
                            execution.status = 'FAILED';
                            ctx.status = 'WAITING_FOR_SLOT';
                            ctx.version += 1;
                            ctx.updatedAt = Date.now();
                            return result;
                        }
                    }
                    if (result.status === 'UNKNOWN') {
                        execution.status = 'UNKNOWN';
                        execution.errorCode = result.errorCode;
                        ctx.status = 'WAITING_FOR_SLOT';
                        ctx.version += 1;
                        ctx.updatedAt = Date.now();
                        return result;
                    }
                }
                catch (err) {
                    if (err.message && err.message.startsWith('CONTRACT_VIOLATION')) {
                        throw err;
                    }
                    const code = err.message || 'DISPATCH_ERROR';
                    lastResult = { status: 'FAILED', executionId, errorCode: code, attempt: currentAttempt };
                    execution.errorCode = code;
                    if (!this.retryPolicy.retryableErrors.includes(code)) {
                        execution.status = 'FAILED';
                        ctx.status = 'WAITING_FOR_SLOT';
                        ctx.version += 1;
                        ctx.updatedAt = Date.now();
                        return lastResult;
                    }
                }
            }
            execution.status = lastResult.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED';
            if (execution.status === 'SUCCEEDED') {
                ctx.status = 'COMPLETED';
            }
            else {
                ctx.status = 'WAITING_FOR_SLOT';
                if (lastResult.status === 'FAILED' || lastResult.status === 'UNKNOWN') {
                    execution.errorCode = lastResult.errorCode;
                }
                else {
                    execution.errorCode = 'MAX_RETRIES_EXCEEDED';
                }
            }
            ctx.version += 1;
            ctx.updatedAt = Date.now();
            return lastResult;
        }).finally(() => {
            if (this.contextMutationQueues.get(contextId) === dispatchPromise) {
                this.contextMutationQueues.delete(contextId);
            }
        });
        this.contextMutationQueues.set(contextId, dispatchPromise);
        return dispatchPromise.then(result => {
            const current = this.contexts.get(contextId);
            if (current && ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(current.status) && this.activeContextId === contextId) {
                this.activeContextId = null;
            }
            return result;
        });
    }
    async reconcileExecution(executionId, resolvedStatus, identity, errorCode) {
        this.validateIdentity(identity);
        const execution = this.executions.get(executionId);
        if (!execution) {
            throw new Error(`CONTRACT_VIOLATION: Execution "${executionId}" not found for reconciliation`);
        }
        if (execution.ownerId !== identity.ownerId || execution.sessionId !== identity.sessionId) {
            throw new Error('SECURITY_VIOLATION: Cross-session reconciliation is denied');
        }
        if (execution.status !== 'UNKNOWN') {
            throw new Error(`CONTRACT_VIOLATION: Cannot reconcile execution in non-UNKNOWN status (${execution.status})`);
        }
        execution.status = resolvedStatus;
        execution.updatedAt = Date.now();
        if (errorCode)
            execution.errorCode = errorCode;
        const ctx = this.contexts.get(execution.contextId);
        if (ctx) {
            await this.executeSerializedMutation(ctx.contextId, undefined, identity, async (c) => {
                c.status = resolvedStatus === 'SUCCEEDED' ? 'COMPLETED' : 'WAITING_FOR_SLOT';
                return { result: true };
            });
        }
        return execution;
    }
    getExecution(executionId, identity) {
        this.validateIdentity(identity);
        const exec = this.executions.get(executionId);
        if (!exec)
            return undefined;
        if (exec.ownerId !== identity.ownerId || exec.sessionId !== identity.sessionId) {
            return undefined;
        }
        return { ...exec, payload: { ...exec.payload } };
    }
    getExecutionLogs(identity) {
        this.validateIdentity(identity);
        return Array.from(this.executions.values())
            .filter(l => l.ownerId === identity.ownerId && l.sessionId === identity.sessionId)
            .map(l => ({
            ...l,
            payload: { ...l.payload },
            event: { type: l.actionType, payload: { ...l.payload } }
        }));
    }
}
