import type { SessionIdentity } from "../../../src/platform/dialogue-manager";

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
      <label for="scenario-source-file">Загрузить JSON-сценарий</label>
      <input id="scenario-source-file" data-testid="scenario-source-file" type="file" accept=".json,application/json" />
      <div id="scenario-load-status" role="status">Сценарий не загружен</div>
    </div>`;

    const input = root.querySelector<HTMLInputElement>('#scenario-source-file');
    const status = root.querySelector<HTMLElement>('#scenario-load-status');
    input?.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const scenarioSet = JSON.parse(await file.text());
        runtime.voiceChannel.registerScenarioSet(scenarioSet);
        if (typeof window !== 'undefined') {
          (window as any).__SCENARIO_ENGINE__ = runtime.voiceChannel;
        }
        if (status) status.textContent = `Загружен сценарий: ${scenarioSet.id}`;
      } catch (error) {
        if (status) status.textContent = `Ошибка загрузки сценария: ${error instanceof Error ? error.message : String(error)}`;
      }
    });
  }

  if (typeof window !== 'undefined') {
    (window as any).__VOICE_DEMO_APP__ = app;
    (window as any).__SCENARIO_ENGINE__ = runtime.voiceChannel;
  }
  return app;
}
