import { bootstrap } from './Bootstrap';
import { mountApp } from './App';
import { getAuthenticatedSessionIdentity, productionActionDispatcher } from './main';

const root = document.querySelector<HTMLElement>('#app');
if (!root) {
  throw new Error('VOICE_DEMO_ROOT_NOT_FOUND: expected #app in apps/voice-demo/index.html');
}

const identity = getAuthenticatedSessionIdentity();
const runtime = bootstrap(productionActionDispatcher);
mountApp(root, runtime, identity);
