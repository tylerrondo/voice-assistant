import { bootstrap } from "./Bootstrap";
import { mountApp } from "./App";
import { getAuthenticatedSessionIdentity, productionActionDispatcher } from "./platform-runtime";

export * from "./platform-runtime";

// Start application with resolved authenticated session.
const sessionIdentity = getAuthenticatedSessionIdentity();
const runtime = bootstrap(productionActionDispatcher);
const root = document.querySelector<HTMLElement>("#app") || document.body;
mountApp(root, runtime, sessionIdentity);
