import { bootstrap } from "./Bootstrap";
import { mountApp } from "./App";
import { ActionDispatcher, SessionIdentity } from "../../../src/platform/dialogue-manager";

// Strict Authenticated Session Provider (Zero fallback)
export function getAuthenticatedSessionIdentity(): SessionIdentity {
  const ownerId = typeof window !== 'undefined' ? (window as any).__AUTH_OWNER_ID__ : undefined;
  const sessionId = typeof window !== 'undefined' ? (window as any).__AUTH_SESSION_ID__ : undefined;

  if (!ownerId || !sessionId || typeof ownerId !== 'string' || typeof sessionId !== 'string') {
    throw new Error('CONTRACT_VIOLATION: No authenticated session found. SessionIdentity must be established prior to application startup.');
  }

  return { ownerId, sessionId };
}

type ExecutionEvent = {
  type: string;
  payload: Record<string, any>;
  executionId: string;
  attempt: number;
  updatedAt: number;
};

export class PlatformFsmExecutionBoundary {
  private activeOrders: Map<number, { status: string; executionId: string; updatedAt: number }> = new Map();
  private activeOrderId: number | null = null;
  private driverStatus = 'AVAILABLE';
  private executionEvents: ExecutionEvent[] = [];

  public async execute(event: { type: string; payload: Record<string, any> }, exec: any) {
    if (!event || typeof event !== 'object' || typeof event.type !== 'string' || !event.type) {
      return { status: 'FAILED' as const, executionId: exec.executionId, errorCode: 'INVALID_EVENT_FORMAT', attempt: exec.attempt };
    }
    if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) {
      return { status: 'FAILED' as const, executionId: exec.executionId, errorCode: 'INVALID_PAYLOAD_STRUCTURE', attempt: exec.attempt };
    }
    if (JSON.stringify(event.payload) !== JSON.stringify(exec.payload)) {
      return { status: 'FAILED' as const, executionId: exec.executionId, errorCode: 'PAYLOAD_MUTATION_DETECTED', attempt: exec.attempt };
    }

    const orderIdValue = event.payload.orderId;
    const orderId = orderIdValue === undefined ? this.activeOrderId : Number(orderIdValue);
    const currentOrder = orderId !== null && Number.isFinite(orderId) ? this.activeOrders.get(orderId) : undefined;
    let nextStatus: string | null = null;

    switch (event.type) {
      case 'driver.order.accepted':
        if (!Number.isFinite(Number(orderIdValue)) || Number(orderIdValue) <= 0) {
          return { status: 'FAILED' as const, executionId: exec.executionId, errorCode: 'INVALID_ORDER_ID', attempt: exec.attempt };
        }
        if (this.driverStatus !== 'AVAILABLE') {
          return { status: 'FAILED' as const, executionId: exec.executionId, errorCode: 'INVALID_FSM_TRANSITION', attempt: exec.attempt };
        }
        nextStatus = 'ORDER_ACCEPTED';
        this.activeOrderId = Number(orderIdValue);
        break;
      case 'driver.arrived':
        if (!currentOrder || currentOrder.status !== 'ORDER_ACCEPTED') {
          return { status: 'FAILED' as const, executionId: exec.executionId, errorCode: 'INVALID_FSM_TRANSITION', attempt: exec.attempt };
        }
        nextStatus = 'DRIVER_ARRIVED';
        break;
      case 'driver.trip.started':
        if (!currentOrder || currentOrder.status !== 'DRIVER_ARRIVED') {
          return { status: 'FAILED' as const, executionId: exec.executionId, errorCode: 'INVALID_FSM_TRANSITION', attempt: exec.attempt };
        }
        nextStatus = 'IN_TRIP';
        break;
      case 'driver.trip.finished':
        if (!currentOrder || currentOrder.status !== 'IN_TRIP') {
          return { status: 'FAILED' as const, executionId: exec.executionId, errorCode: 'INVALID_FSM_TRANSITION', attempt: exec.attempt };
        }
        nextStatus = 'TRIP_FINISHED';
        break;
      case 'driver.available':
        if (this.driverStatus !== 'TRIP_FINISHED') {
          return { status: 'FAILED' as const, executionId: exec.executionId, errorCode: 'INVALID_FSM_TRANSITION', attempt: exec.attempt };
        }
        nextStatus = 'AVAILABLE';
        break;
      case 'order.accepted':
      case 'order.dispatch.completed':
        if (!Number.isFinite(Number(orderIdValue)) || Number(orderIdValue) <= 0) {
          return { status: 'FAILED' as const, executionId: exec.executionId, errorCode: 'INVALID_ORDER_ID', attempt: exec.attempt };
        }
        nextStatus = 'DISPATCHED';
        this.activeOrderId = Number(orderIdValue);
        break;
      default:
        if (event.type.startsWith('driver.')) {
          return { status: 'FAILED' as const, executionId: exec.executionId, errorCode: 'UNKNOWN_DRIVER_EVENT', attempt: exec.attempt };
        }
        // Generic non-driver domain events are accepted and recorded.
        break;
    }

    if (nextStatus) {
      this.driverStatus = nextStatus;
      if (orderId !== null && Number.isFinite(orderId)) {
        this.activeOrders.set(orderId, {
          status: nextStatus,
          executionId: exec.executionId,
          updatedAt: Date.now()
        });
      }
    }

    this.executionEvents.push({
      type: event.type,
      payload: { ...event.payload },
      executionId: exec.executionId,
      attempt: exec.attempt,
      updatedAt: Date.now()
    });

    return { status: 'SUCCEEDED' as const, executionId: exec.executionId, attempt: exec.attempt };
  }

  public getOrderState(orderId: number) {
    return this.activeOrders.get(orderId);
  }

  public getDriverStatus() {
    return this.driverStatus;
  }

  public getExecutionEvents() {
    return this.executionEvents.map(event => ({ ...event, payload: { ...event.payload } }));
  }
}

export const platformExecutionBoundary = new PlatformFsmExecutionBoundary();

export const productionActionDispatcher: ActionDispatcher = async (event, ctx, exec) => {
  return platformExecutionBoundary.execute(event, exec);
};

// Application startup is owned by src/main.ts. Keep this module side-effect-free
// so importing the execution boundary cannot bootstrap a second runtime.
