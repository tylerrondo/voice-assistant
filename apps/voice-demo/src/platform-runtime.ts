import type { ActionDispatcher, SessionIdentity } from "../../../src/platform/dialogue-manager";

// Strict Authenticated Session Provider (Zero fallback)
export function getAuthenticatedSessionIdentity(): SessionIdentity {
  const ownerId = typeof window !== 'undefined' ? (window as any).__AUTH_OWNER_ID__ : undefined;
  const sessionId = typeof window !== 'undefined' ? (window as any).__AUTH_SESSION_ID__ : undefined;

  if (!ownerId || !sessionId || typeof ownerId !== 'string' || typeof sessionId !== 'string') {
    throw new Error('CONTRACT_VIOLATION: No authenticated session found. SessionIdentity must be established prior to application startup.');
  }

  return { ownerId, sessionId };
}

// Real FSM / State Execution Engine Boundary
export class PlatformFsmExecutionBoundary {
  private activeOrders: Map<number, { status: string; executionId: string; updatedAt: number }> = new Map();

  public async execute(event: { type: string; payload: Record<string, any> }, exec: any) {
    // 1. Strict Payload Validation
    if (!event || typeof event !== 'object' || !event.type || typeof event.type !== 'string') {
      return {
        status: 'FAILED' as const,
        executionId: exec.executionId,
        errorCode: 'INVALID_EVENT_FORMAT',
        attempt: exec.attempt
      };
    }

    if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) {
      return {
        status: 'FAILED' as const,
        executionId: exec.executionId,
        errorCode: 'INVALID_PAYLOAD_STRUCTURE',
        attempt: exec.attempt
      };
    }

    // Invariant: Event payload must match execution payload immutably
    if (JSON.stringify(event.payload) !== JSON.stringify(exec.payload)) {
      return {
        status: 'FAILED' as const,
        executionId: exec.executionId,
        errorCode: 'PAYLOAD_MUTATION_DETECTED',
        attempt: exec.attempt
      };
    }

    // 2. Business Logic Execution via FSM
    if (event.type === 'order.accepted' || event.type === 'order.dispatch.completed') {
      const orderId = Number(event.payload.orderId);
      if (!Number.isFinite(orderId) || orderId <= 0) {
        return {
          status: 'FAILED' as const,
          executionId: exec.executionId,
          errorCode: 'INVALID_ORDER_ID',
          attempt: exec.attempt
        };
      }

      // Transition order state in FSM
      this.activeOrders.set(orderId, {
        status: 'DISPATCHED',
        executionId: exec.executionId,
        updatedAt: Date.now()
      });

      return {
        status: 'SUCCEEDED' as const,
        executionId: exec.executionId,
        attempt: exec.attempt
      };
    }

    const driverTransitions: Record<string, { from: string[]; to: string }> = {
      'driver.order.accepted': { from: ['ASSIGNED', 'AVAILABLE', 'DISPATCHED', 'ORDER_ACCEPTED'], to: 'ORDER_ACCEPTED' },
      'driver.arrived': { from: ['ORDER_ACCEPTED', 'DISPATCHED', 'DRIVER_ARRIVED'], to: 'DRIVER_ARRIVED' },
      'driver.trip.started': { from: ['DRIVER_ARRIVED', 'IN_TRIP'], to: 'IN_TRIP' },
      'driver.trip.finished': { from: ['IN_TRIP', 'TRIP_FINISHED'], to: 'TRIP_FINISHED' },
      'driver.available': { from: ['TRIP_FINISHED', 'AVAILABLE'], to: 'AVAILABLE' }
    };
    const driverTransition = driverTransitions[event.type];
    if (driverTransition) {
      const latestOrder = [...this.activeOrders.entries()].sort((a, b) => b[1].updatedAt - a[1].updatedAt)[0];
      const payloadOrderId = Number(event.payload.orderId);
      const orderId = Number.isFinite(payloadOrderId) && payloadOrderId > 0
        ? payloadOrderId
        : event.type === 'driver.order.accepted' ? NaN : latestOrder?.[0];

      if (!Number.isFinite(orderId) || !orderId || orderId <= 0) {
        return {
          status: 'FAILED' as const,
          executionId: exec.executionId,
          errorCode: 'INVALID_ORDER_ID',
          attempt: exec.attempt
        };
      }

      const current = this.activeOrders.get(orderId)?.status;
      if (current && !driverTransition.from.includes(current)) {
        return {
          status: 'FAILED' as const,
          executionId: exec.executionId,
          errorCode: 'INVALID_FSM_TRANSITION',
          attempt: exec.attempt
        };
      }
      if (!current && event.type !== 'driver.order.accepted') {
        return {
          status: 'FAILED' as const,
          executionId: exec.executionId,
          errorCode: 'NO_ACTIVE_ORDER',
          attempt: exec.attempt
        };
      }

      this.activeOrders.set(orderId, {
        status: driverTransition.to,
        executionId: exec.executionId,
        updatedAt: Date.now()
      });
      return {
        status: 'SUCCEEDED' as const,
        executionId: exec.executionId,
        attempt: exec.attempt
      };
    }

    const supportedDomainEvents = new Set([
      'passenger.order.created',
      'passenger.offer.selected',
      'nanny.order.confirmed',
      'INVENTORY_STOCK_RESOLVED',
      'SALE_TRANSACTION_COMPLETED',
      'ITEM_PRICE_UPDATED',
      'ITEM_STATUS_OUT_OF_STOCK_TRIGGERED',
      'CATALOG_ITEM_CREATED',
      'INVENTORY_STOCK_UPDATED'
    ]);
    if (supportedDomainEvents.has(event.type)) {
      return {
        status: 'SUCCEEDED' as const,
        executionId: exec.executionId,
        attempt: exec.attempt
      };
    }

    return {
      status: 'FAILED' as const,
      executionId: exec.executionId,
      errorCode: `UNKNOWN_ACTION_TYPE_${event.type}`,
      attempt: exec.attempt
    };
  }

  public getOrderState(orderId: number) {
    return this.activeOrders.get(orderId);
  }
}

export const platformExecutionBoundary = new PlatformFsmExecutionBoundary();

export const productionActionDispatcher: ActionDispatcher = async (event, ctx, exec) => {
  return platformExecutionBoundary.execute(event, exec);
};
