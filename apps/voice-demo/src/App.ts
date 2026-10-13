import type { SessionIdentity } from '../../../src/platform/dialogue-manager';
import type { ScenarioSet } from '../../../src/platform/voice-channel';

export class VoiceDemoApp {
  public runtime: any;
  private currentIdentity: SessionIdentity;

  constructor(runtime: any, authenticatedIdentity: SessionIdentity) {
    if (!authenticatedIdentity || !authenticatedIdentity.ownerId || !authenticatedIdentity.sessionId) {
      throw new Error('CONTRACT_VIOLATION: Authenticated SessionIdentity (ownerId, sessionId) is strictly required from session layer');
    }
    this.runtime = runtime;
    this.currentIdentity = authenticatedIdentity;
  }

  public async handleVoice(phrase: string, identityOverride?: SessionIdentity) {
    const identity = identityOverride || this.currentIdentity;
    if (!identity || !identity.ownerId || !identity.sessionId) {
      throw new Error('CONTRACT_VIOLATION: Valid SessionIdentity required to process voice');
    }
    return this.runtime.voiceChannel.handleIncomingVoice(phrase, identity);
  }

  public setIdentity(identity: SessionIdentity) {
    if (!identity || !identity.ownerId || !identity.sessionId) {
      throw new Error('CONTRACT_VIOLATION: Valid SessionIdentity required');
    }
    this.currentIdentity = identity;
  }

  public getIdentity(): SessionIdentity {
    return this.currentIdentity;
  }
}

export function mountApp(root: HTMLElement, runtime: any, authenticatedIdentity: SessionIdentity) {
  if (!authenticatedIdentity) {
    throw new Error('CONTRACT_VIOLATION: Authenticated SessionIdentity must be provided to mountApp');
  }
  const app = new VoiceDemoApp(runtime, authenticatedIdentity);
  if (root) {
    root.innerHTML = `<div id="voice-app-ready" style="padding: 16px; font-family: sans-serif;">
      <h2>Voice Platform Production Runtime Ready</h2>
      <div id="runtime-identity">AUTHENTICATED: ${authenticatedIdentity.ownerId}:${authenticatedIdentity.sessionId}</div>
      <label for="scenario-file-input">Load ScenarioSet JSON</label>
      <input id="scenario-file-input" data-testid="scenario-file-input" type="file" accept="application/json,.json" />
      <div id="active-scenario-set" aria-live="polite">No ScenarioSet loaded</div>
      <div id="fsm-driver-state" data-testid="fsm-driver-state" class="driver-status" aria-live="polite">AVAILABLE</div>
    </div>`;
  }
  if (typeof window !== 'undefined') {
    (window as any).__VOICE_DEMO_APP__ = app;
    (window as any).__SCENARIO_ENGINE__ = {
      getActiveScenarioSetId: () => runtime.voiceChannel.getActiveScenarioSetId()
    };
  }

  const fileInput = root.querySelector<HTMLInputElement>('#scenario-file-input');
  const activeSetDisplay = root.querySelector<HTMLElement>('#active-scenario-set');
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const scenarioSet = JSON.parse(await file.text()) as ScenarioSet;
      runtime.voiceChannel.registerScenarioSet(scenarioSet);
      if (activeSetDisplay) activeSetDisplay.textContent = scenarioSet.name || scenarioSet.id;
    } catch (error) {
      if (activeSetDisplay) {
        activeSetDisplay.textContent = error instanceof Error ? error.message : 'Unable to load ScenarioSet';
      }
    }
  });

  return app;
}
