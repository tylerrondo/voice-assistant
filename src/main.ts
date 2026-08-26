import { bootstrap } from "../apps/voice-demo/src/Bootstrap";
import { mountApp } from "../apps/voice-demo/src/App";
import { ActionDispatcher } from "./platform/dialogue-manager";
import { platformExecutionBoundary, getAuthenticatedSessionIdentity } from "../apps/voice-demo/src/main";

export const rootProductionDispatcher: ActionDispatcher = async (event, ctx, exec) => {
  return platformExecutionBoundary.execute(event, exec);
};

const sessionIdentity = getAuthenticatedSessionIdentity();
const runtime = bootstrap(rootProductionDispatcher);
const root = document.querySelector<HTMLElement>("#app") || document.body;
mountApp(root, runtime, sessionIdentity);
