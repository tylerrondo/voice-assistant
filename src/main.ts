import { bootstrap } from "../apps/voice-demo/src/Bootstrap";
import { mountApp } from "../apps/voice-demo/src/App";
import { ActionDispatcher } from "./platform/dialogue-manager";

export const rootActionDispatcher: ActionDispatcher = async (event, ctx, exec) => {
  console.info(`[Root Dispatcher] Executing ${exec.actionType} for executionId=${exec.executionId}, attempt=${exec.attempt}`);
  return {
    status: 'SUCCEEDED',
    executionId: exec.executionId,
    attempt: exec.attempt
  };
};

const runtime = bootstrap(rootActionDispatcher);
const root = document.querySelector<HTMLElement>("#app") || document.body;
mountApp(root, runtime);
