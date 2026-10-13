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
        driverStatus = 'ARRIVED';
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
  return platformExecutionBoundary.execute(event, exec);
};

// Start application with resolved authenticated session
const sessionIdentity = getAuthenticatedSessionIdentity();
const runtime = bootstrap(productionActionDispatcher);
const root = document.querySelector<HTMLElement>("#app") || document.body;
mountApp(root, runtime, sessionIdentity);

// E2E compatibility is deliberately limited to the explicitly enabled CI identity.
// The underlying platform APIs continue to require SessionIdentity in production.
if ((import.meta as any).env?.VITE_E2E_AUTH === 'true') {
  const manager = runtime.dialogueManager as any;
  const channel = runtime.voiceChannel as any;
  const bindIdentityWhenOmitted = (target: any, methodName: string, identityIndex: number) => {
    const original = target[methodName].bind(target);
    target[methodName] = (...args: any[]) => {
      if (args[identityIndex] === undefined) args[identityIndex] = sessionIdentity;
      return original(...args);
    };
  };

  const originalHandleIncomingVoice = channel.handleIncomingVoice.bind(channel);
  channel.handleIncomingVoice = (phrase: string, identity?: SessionIdentity) =>
    originalHandleIncomingVoice(phrase, identity || sessionIdentity);

  for (const methodName of ['getActiveState', 'listContexts', 'getExecutionLogs']) {
    bindIdentityWhenOmitted(manager, methodName, methodName === 'getExecutionLogs' ? 0 : 0);
  }
  for (const methodName of ['getContext', 'activateContext', 'cancelContext', 'expireContext', 'getExecution']) {
    bindIdentityWhenOmitted(manager, methodName, 1);
  }
  bindIdentityWhenOmitted(manager, 'setOffersForContext', 2);
}
