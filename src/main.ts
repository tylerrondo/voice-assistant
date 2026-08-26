import { bootstrap } from "../apps/voice-demo/src/Bootstrap";
import { mountApp } from "../apps/voice-demo/src/App";
import { ActionDispatcher } from "./platform/dialogue-manager";

// Root production composition dispatcher
export const rootProductionDispatcher: ActionDispatcher = async (event, ctx, exec) => {
  console.info(`[Root Dispatcher] Processing ${exec.actionType} for executionId=${exec.executionId}, attempt=${exec.attempt}`);
  return {
    status: 'SUCCEEDED',
    executionId: exec.executionId,
    attempt: exec.attempt
  };
};

// Explicitly pass dispatcher into bootstrap
const runtime = bootstrap(rootProductionDispatcher);
const root = document.querySelector<HTMLElement>("#app") || document.body;
mountApp(root, runtime);
