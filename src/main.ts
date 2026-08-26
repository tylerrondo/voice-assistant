import { bootstrap } from "../apps/voice-demo/src/Bootstrap";
import { mountApp } from "../apps/voice-demo/src/App";
import { ActionDispatcher, SessionIdentity } from "./platform/dialogue-manager";
import { executionBoundary } from "../apps/voice-demo/src/main";

export const rootProductionDispatcher: ActionDispatcher = async (event, ctx, exec) => {
  return executionBoundary.execute(event, exec);
};

const authenticatedIdentity: SessionIdentity = {
  ownerId: (typeof window !== 'undefined' && (window as any).__AUTH_OWNER_ID__) || 'auth-driver-prod-001',
  sessionId: (typeof window !== 'undefined' && (window as any).__AUTH_SESSION_ID__) || 'auth-session-prod-001'
};

const runtime = bootstrap(rootProductionDispatcher);
const root = document.querySelector<HTMLElement>("#app") || document.body;
mountApp(root, runtime, authenticatedIdentity);
