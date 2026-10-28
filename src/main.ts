import { bootstrap } from "../apps/voice-demo/src/Bootstrap";
import { mountApp } from "../apps/voice-demo/src/App";
import type { ActionDispatcher } from "./platform/dialogue-manager";
import {
  platformExecutionBoundary,
  getAuthenticatedSessionIdentity,
  productionActionDispatcher,
} from "../apps/voice-demo/src/main";

export const rootProductionDispatcher: ActionDispatcher = async (event, ctx, exec) => {
  return productionActionDispatcher(event, ctx, exec);
};

if (import.meta.env.DEV && typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
    (!(window as any).__AUTH_OWNER_ID__ || !(window as any).__AUTH_SESSION_ID__)) {
  // Local-only development identity; production still requires the host auth layer.
  (window as any).__AUTH_OWNER_ID__ = 'local-dev-owner';
  (window as any).__AUTH_SESSION_ID__ = 'local-dev-session';
}

const sessionIdentity = getAuthenticatedSessionIdentity();
const runtime = bootstrap(rootProductionDispatcher);
(runtime as any).platformExecutionBoundary = platformExecutionBoundary;
if (typeof window !== 'undefined') {
  // The declarative scenario runner and the voice runtime share the same production FSM boundary.
  (window as any).__PLATFORM_EXECUTION_BOUNDARY__ = platformExecutionBoundary;
  (window as any).__PRODUCTION_ACTION_DISPATCHER__ = rootProductionDispatcher;
}
const root = document.querySelector<HTMLElement>("#app") || document.body;
mountApp(root, runtime, sessionIdentity);
