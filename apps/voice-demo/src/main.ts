import { bootstrap } from "./Bootstrap";
import { mountApp } from "./App";
import { ActionDispatcher } from "../../../src/platform/dialogue-manager";

// Production Composition Root ActionDispatcher
export const productionActionDispatcher: ActionDispatcher = async (event, ctx, exec) => {
  console.info(`[Production Dispatcher] Executing ${exec.actionType} for executionId=${exec.executionId}, attempt=${exec.attempt}`);
  return {
    status: 'SUCCEEDED',
    executionId: exec.executionId,
    attempt: exec.attempt
  };
};

const runtime = bootstrap(productionActionDispatcher);
const root = document.querySelector<HTMLElement>("#app") || document.body;
mountApp(root, runtime);
