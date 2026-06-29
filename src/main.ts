import { bootstrap } from "../apps/voice-demo/src/Bootstrap"
import { mountApp } from "../apps/voice-demo/src/App"

const app = bootstrap()
const root = document.querySelector<HTMLElement>("#app")!
mountApp(root, app)