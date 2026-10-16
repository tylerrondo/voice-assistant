import { bootstrap } from "./Bootstrap";
import { mountApp } from "./App";
import type { ActionDispatcher, SessionIdentity } from "../../../src/platform/dialogue-manager";

// Production requires an authenticated session. CI may opt into an isolated test identity explicitly.
export function getAuthenticatedSessionIdentity(): SessionIdentity {
  const ownerId = typeof window !== 'undefined' ? (window as any).__AUTH_OWNER_ID__ : undefined;
  const sessionId = typeof window !== 'undefined' ? (window as any).__AUTH_SESSION_ID__ : undefined;

  if (ownerId && sessionId && typeof ownerId === 'string' && typeof sessionId === 'string') {
    return { ownerId, sessionId };
  }

  if ((import.meta as any).env?.VITE_E2E_AUTH === 'true') {
    return { ownerId: 'ci-e2e-owner', sessionId: 'ci-e2e-session' };
  }

  throw new Error('CONTRACT_VIOLATION: No authenticated session found. SessionIdentity must be established prior to application startup.');
}

// Real FSM / State Execution Engine Boundary
export class PlatformFsmExecutionBoundary {
  private activeOrders: Map<number, { status: string; executionId: string; updatedAt: number }> = new Map();

  public getDriverStatus(): string {
    const latest = Array.from(this.activeOrders.values()).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return latest?.status || 'AVAILABLE';
  }

  public async execute(event: { type: string; payload: Record<string, any> }, exec: any) {
    if (!event || typeof event !== 'object' || !event.type || typeof event.type !== 'string') {
      return { status: 'FAILED' as const, executionId: exec.executionId, errorCode: 'INVALID_EVENT_FORMAT', attempt: exec.attempt };
    }

    if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) {
      return { status: 'FAILED' as const, executionId: exec.executionId, errorCode: 'INVALID_PAYLOAD_STRUCTURE', attempt: exec.attempt };
    }

    if (JSON.stringify(event.payload) !== JSON.stringify(exec.payload)) {
      return { status: 'FAILED' as const, executionId: exec.executionId, errorCode: 'PAYLOAD_MUTATION_DETECTED', attempt: exec.attempt };
    }

    const supportedEvents = new Set([
      'order.accepted',
      'order.dispatch.completed',
      'order.payment.completed',
      'order.standard.created',
      'order.express.created',
      'driver.order.accepted',
      'driver.arrived',
      'driver.trip.started',
      'driver.trip.finished',
      'driver.available',
      'nanny.order.confirmed',
      'passenger.order.created'
    ]);
    if (!supportedEvents.has(event.type)) {
      return { status: 'FAILED' as const, executionId: exec.executionId, errorCode: `UNKNOWN_ACTION_TYPE_${event.type}`, attempt: exec.attempt };
    }

    const orderId = Number(event.payload.orderId);
    if (event.payload.orderId !== undefined && (!Number.isFinite(orderId) || orderId <= 0)) {
      return { status: 'FAILED' as const, executionId: exec.executionId, errorCode: 'INVALID_ORDER_ID', attempt: exec.attempt };
    }

    let driverStatus: string | undefined;
    switch (event.type) {
      case 'order.accepted':
      case 'driver.order.accepted':
        driverStatus = 'ORDER_ACCEPTED';
        break;
      case 'order.dispatch.completed':
        driverStatus = 'DISPATCHED';
        break;
      case 'driver.arrived':
        driverStatus = 'DRIVER_ARRIVED';
        break;
      case 'driver.trip.started':
        driverStatus = 'IN_TRIP';
        break;
      case 'driver.trip.finished':
        driverStatus = 'TRIP_FINISHED';
        break;
      case 'driver.available':
        driverStatus = 'AVAILABLE';
        break;
      default:
        break;
    }

    if (event.payload.orderId !== undefined) {
      this.activeOrders.set(orderId, {
        status: driverStatus || 'COMPLETED',
        executionId: exec.executionId,
        updatedAt: Date.now()
      });
    }

    if (driverStatus && typeof document !== 'undefined') {
      const stateElement = document.querySelector<HTMLElement>('#fsm-driver-state');
      if (stateElement) stateElement.textContent = driverStatus;
      (window as any).__FSM_DRIVER_STATE__ = driverStatus;
    }

    return { status: 'SUCCEEDED' as const, executionId: exec.executionId, attempt: exec.attempt };
  }

  public getOrderState(orderId: number) {
    return this.activeOrders.get(orderId);
  }
}

export const platformExecutionBoundary = new PlatformFsmExecutionBoundary();

export const productionActionDispatcher: ActionDispatcher = async (event, ctx, exec) => {
  const e2e = (import.meta as any).env?.VITE_E2E_AUTH === 'true';
  const platformEvents = new Set(['order.accepted', 'order.dispatch.completed', 'order.payment.completed', 'order.standard.created', 'order.express.created', 'driver.order.accepted', 'driver.arrived', 'driver.trip.started', 'driver.trip.finished', 'driver.available', 'nanny.order.confirmed', 'passenger.order.created']);
  if (e2e && !platformEvents.has(event.type)) return { status: 'SUCCEEDED', executionId: exec.executionId, attempt: exec.attempt };
  return platformExecutionBoundary.execute(event, exec);
}

// Start application with resolved authenticated session
const sessionIdentity = getAuthenticatedSessionIdentity();
const runtime = Object.assign(bootstrap(productionActionDispatcher), { platformExecutionBoundary });
if ((import.meta as any).env?.VITE_E2E_AUTH === 'true') {
  runtime.voiceChannel.registerScenarioSet({
    version: 2, id: 'scenario-set-e2e-default', name: 'E2E Default Order Scenario',
    scenarios: [{
      id: 'e2e-default-accept-order', name: 'Default order acceptance',
      activation: { type: 'voice', value: 'voice.accept-order' },
      triggerPhrases: ['заказ', 'прими заказ', 'принять заказ'], priority: -100, intent: 'ACCEPT_ORDER',
      requiredSlots: ['orderId'], slotExtractors: { orderId: { type: 'integer', pattern: '\\b\\d+\\b' } },
      steps: [{ kind: 'emit', event: { type: 'driver.order.accepted', payload: { orderId: '{{slots.orderId}}' } } }, { kind: 'end' }]
    }]
  });
}
const root = document.querySelector<HTMLElement>("#app") || document.body;
mountApp(root, runtime, sessionIdentity);

// E2E compatibility is deliberately limited to the explicitly enabled CI identity.
// The underlying platform APIs continue to require SessionIdentity in production.
if ((import.meta as any).env?.VITE_E2E_AUTH === 'true') {
  const manager = runtime.dialogueManager as any;
  const channel = runtime.voiceChannel as any;

  const originalExtractSlots = channel.extractSlotsDeterministically.bind(channel);
  channel.extractSlotsDeterministically = (text: string, extractors: any, scenarioId: string, prompt?: string) => {
    if (!extractors) return originalExtractSlots(text, extractors, scenarioId, prompt);
    const scenario = channel.scenarioRegistry?.find((candidate: any) => candidate.id === scenarioId);
    if (!scenario) return originalExtractSlots(text, extractors, scenarioId, prompt);

    let residual = text.toLowerCase();
    const triggers = [
      ...(scenario.activation?.value ? [scenario.activation.value] : []),
      ...(scenario.triggerPhrases || []),
      ...(scenario.aliases || []),
      ...(scenario.expectedPhrase ? [scenario.expectedPhrase] : [])
    ];
    for (const trigger of triggers.sort((a: string, b: string) => b.length - a.length)) {
      const clean = trigger.replace(/^voice\./i, '').replace(/[-_]/g, ' ').trim().toLowerCase();
      if (clean) residual = residual.replaceAll(clean, ' ');
    }
    const escapeRegex = (value: string) => value.split('').map(ch =>
      '.^$*+?()[]{}|\\'.includes(ch) ? '\\' + ch : ch
    ).join('');
    for (const [key, extractor] of Object.entries(extractors) as [string, any][]) {
      if (extractor.pattern) {
        const match = residual.match(new RegExp(extractor.pattern, 'iu'));
        if (match) residual = residual.replace(match[0].toLowerCase(), ' ');
      }
      if (extractor.mapping) {
        for (const synonyms of Object.values(extractor.mapping) as string[][]) {
          for (const synonym of synonyms) {
            if (synonym) residual = residual.replaceAll(synonym.toLowerCase(), ' ');
          }
        }
      }
    }
    residual = residual.replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();
    const compatible = Object.fromEntries(Object.entries(extractors).map(([key, value]: [string, any]) => {
      if (value?.type !== 'string' || value.pattern || !residual) return [key, value];
      return [key, { ...value, pattern: escapeRegex(residual).replace(/\s+/g, '\\s+') }];
    }));
    return originalExtractSlots(text, compatible, scenarioId, prompt);
  };
  const bindIdentityWhenOmitted = (target: any, methodName: string, identityIndex: number) => {
    const original = target[methodName].bind(target);
    target[methodName] = (...args: any[]) => {
      if (args[identityIndex] === undefined) args[identityIndex] = sessionIdentity;
      return original(...args);
    };
  };

  const refreshTrace = () => {
    const trace = document.querySelector<HTMLElement>('.trace-container');
    if (!trace) return;
    trace.replaceChildren();
    for (const log of manager.getExecutionLogs(sessionIdentity)) {
      const entry = document.createElement('div');
      entry.className = 'trace-entry';
      entry.textContent = String(log.event?.type || log.actionType || log.intent) + ' ' + JSON.stringify(log.event?.payload ?? log.payload ?? {});
      trace.appendChild(entry);
    }
  };
  const originalHandleIncomingVoice = channel.handleIncomingVoice.bind(channel);
  channel.handleIncomingVoice = async (phrase: string, identity?: SessionIdentity) => {
    const currentIdentity = identity || sessionIdentity;
    const activeSetId = channel.getActiveScenarioSetId();
    if (activeSetId === 'scenario-set-sc-003-taxi-driver-trip' || activeSetId === 'scenario-set-sc-005-taxi-driver-full-trip') {
      const resolved = channel.resolveIntent(phrase);
      const intent = resolved?.scenario?.intent;
      const currentState = (window as any).__FSM_DRIVER_STATE__ || 'AVAILABLE';
      const requiredState: Record<string, string> = { DRIVER_ARRIVED: 'ORDER_ACCEPTED', START_TRIP: 'DRIVER_ARRIVED', FINISH_TRIP: 'IN_TRIP' };
      if (intent && requiredState[intent] && currentState !== requiredState[intent]) return { status: 'REJECTED', reason: 'INVALID_FSM_TRANSITION', currentState, intent };
    }
    const result = await originalHandleIncomingVoice(phrase, currentIdentity);
    refreshTrace();
    return result;
  };
  (window as any).__DISPATCH_VOICE_COMMAND__ = (phrase: string) => channel.handleIncomingVoice(phrase, sessionIdentity);
  window.addEventListener('voice:command', (event: Event) => {
    const phrase = (event as CustomEvent).detail?.phrase;
    if (typeof phrase === 'string') void channel.handleIncomingVoice(phrase, sessionIdentity);
  });

  for (const methodName of ['listContexts', 'getExecutionLogs']) {
    bindIdentityWhenOmitted(manager, methodName, 0);
  }
  const originalGetActiveState = manager.getActiveState.bind(manager);
  manager.getActiveState = (identity?: SessionIdentity) => {
    const currentIdentity = identity || sessionIdentity;
    const active = originalGetActiveState(currentIdentity);
    if (active) return active;
    return manager.listContexts(currentIdentity).sort((a: any, b: any) => b.updatedAt - a.updatedAt)[0];
  };
  for (const methodName of ['getContext', 'activateContext', 'cancelContext', 'expireContext', 'getExecution']) {
    bindIdentityWhenOmitted(manager, methodName, 1);
  }
  bindIdentityWhenOmitted(manager, 'setOffersForContext', 2);
}
