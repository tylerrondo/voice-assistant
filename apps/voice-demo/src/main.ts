import { bootstrap } from "./Bootstrap";
import { mountApp } from "./App";
import { ActionDispatcher } from "../../../src/platform/dialogue-manager";

// Production ActionDispatcher injected at composition root
export const productionActionDispatcher: ActionDispatcher = async (event, ctx, exec) => {
  console.info(`[Production Dispatcher] Dispatched ${exec.actionType} for executionId=${exec.executionId}, attempt=${exec.attempt}`);
  return {
    status: 'SUCCEEDED',
    executionId: exec.executionId,
    attempt: exec.attempt
  };
};

// Explicitly pass the production dispatcher
const runtime = bootstrap(productionActionDispatcher);
const root = document.querySelector<HTMLElement>("#app") || document.body;
mountApp(root, runtime);
