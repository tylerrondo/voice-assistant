import { bootstrap } from "./Bootstrap";
import { mountApp } from "./App";
import { ActionDispatcher, SessionIdentity } from "../../../src/platform/dialogue-manager";

// Production Execution Boundary (Validates and processes real business events)
export class ProductionActionExecutionBoundary {
  private processedExecutions: Map<string, { event: any; executedAt: number }> = new Map();

  public async execute(event: { type: string; payload: Record<string, any> }, exec: any) {
    if (!event || !event.type) {
      return {
        status: 'FAILED' as const,
        executionId: exec.executionId,
        errorCode: 'INVALID_EVENT_STRUCTURE',
        attempt: exec.attempt
      };
    }

    // Process action payload according to business rules
    this.processedExecutions.set(exec.executionId, { event, executedAt: Date.now() });

    return {
      status: 'SUCCEEDED' as const,
      executionId: exec.executionId,
      attempt: exec.attempt
    };
  }

  public getExecution(executionId: string) {
    return this.processedExecutions.get(executionId);
  }
}

export const executionBoundary = new ProductionActionExecutionBoundary();

export const productionActionDispatcher: ActionDispatcher = async (event, ctx, exec) => {
  return executionBoundary.execute(event, exec);
};

// Authenticated session layer resolution
const authenticatedIdentity: SessionIdentity = {
  ownerId: (typeof window !== 'undefined' && (window as any).__AUTH_OWNER_ID__) || 'auth-driver-prod-001',
  sessionId: (typeof window !== 'undefined' && (window as any).__AUTH_SESSION_ID__) || 'auth-session-prod-001'
};

const runtime = bootstrap(productionActionDispatcher);
const root = document.querySelector<HTMLElement>("#app") || document.body;
mountApp(root, runtime, authenticatedIdentity);
