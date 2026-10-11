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
    root.innerHTML = `
      <main style="padding:16px;font-family:Arial,sans-serif;max-width:960px;margin:0 auto">
        <h2 data-testid="scenario-set-name">Voice Platform Production Runtime Ready</h2>
        <div id="runtime-identity">Authenticated session initialized</div>
        <section style="margin:16px 0">
          <label for="scenario-source-file">Загрузить JSON-сценарий</label>
          <input id="scenario-source-file" data-testid="scenario-source-file" type="file" accept="application/json,.json" />
        </section>
        <form id="voice-command-form" style="display:flex;gap:8px;margin:16px 0">
          <input data-testid="voice-input" name="voiceText" placeholder="Введите голосовую команду" style="flex:1;padding:8px" />
          <button type="submit" data-testid="voice-submit">Отправить</button>
        </form>
        <section style="margin:16px 0">
          <strong>Состояние водителя</strong>
          <div class="driver-status" data-testid="driver-status" style="padding:8px;border:1px solid #ccc">
            <span data-testid="fsm-status">AVAILABLE Свободен</span>
          </div>
        </section>
        <section style="margin:16px 0">
          <strong>Трасса исполнения</strong>
          <div class="trace-container" data-testid="execution-trace" style="padding:8px;border:1px solid #ccc;min-height:24px"></div>
        </section>
      </main>`;
  }

  const fileInput = root.querySelector<HTMLInputElement>('#scenario-source-file');
  const title = root.querySelector<HTMLElement>('[data-testid="scenario-set-name"]');
  const statusNode = root.querySelector<HTMLElement>('[data-testid="fsm-status"]');
  const traceNode = root.querySelector<HTMLElement>('[data-testid="execution-trace"]');
  const voiceInput = root.querySelector<HTMLInputElement>('[data-testid="voice-input"]');
  const form = root.querySelector<HTMLFormElement>('#voice-command-form');

  let pendingScenarioSetId: string | null = null;
  let isScenarioLoading = false;
  let activeScenarioSet: ScenarioSet | null = null;
  let pendingScenarioLoad: Promise<void> = Promise.resolve();

  const renderRuntimeState = () => {
    const boundary = runtime.platformExecutionBoundary;
    const state = typeof boundary?.getDriverStatus === 'function' ? boundary.getDriverStatus() : 'AVAILABLE';
    const labels: Record<string, string> = {
      AVAILABLE: 'Свободен',
      ORDER_ACCEPTED: 'Принят',
      DRIVER_ARRIVED: 'На месте',
      IN_TRIP: 'В пути',
      TRIP_FINISHED: 'Завершена'
    };
    if (statusNode) statusNode.textContent = `${state} ${labels[state] || ''}`;

    if (traceNode) {
      traceNode.replaceChildren();
      const events = typeof boundary?.getExecutionEvents === 'function' ? boundary.getExecutionEvents() : [];
      for (const event of events) {
        const row = document.createElement('div');
        row.className = 'execution-trace-row';
        row.textContent = `${event.type} ${JSON.stringify(event.payload || {})}`;
        traceNode.appendChild(row);
      }
    }
  };

  const originalHandleIncomingVoice = runtime.voiceChannel.handleIncomingVoice.bind(runtime.voiceChannel);
  runtime.voiceChannel.handleIncomingVoice = async (phrase: string, identityOverride?: SessionIdentity) => {
    await pendingScenarioLoad;
    const result = await originalHandleIncomingVoice(phrase, identityOverride || app.getIdentity());
    renderRuntimeState();
    return result;
  };

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      const fileMatch = file.name.match(/^scenario-(.+)\.json$/i);
      pendingScenarioSetId = fileMatch ? `scenario-set-${fileMatch[1]}` : null;
      isScenarioLoading = true;
      pendingScenarioLoad = file.text().then(raw => {
        const scenarioSet = JSON.parse(raw) as ScenarioSet;
        runtime.voiceChannel.registerScenarioSet(scenarioSet);
        activeScenarioSet = scenarioSet;
        pendingScenarioSetId = scenarioSet.id;
        if (title) title.textContent = scenarioSet.name || scenarioSet.id;
        isScenarioLoading = false;
        renderRuntimeState();
      });
    });
  }

  if (form && voiceInput) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const phrase = voiceInput.value.trim();
      if (!phrase) return;
      await app.handleVoice(phrase);
      voiceInput.value = '';
    });
  }

  if (typeof window !== 'undefined') {
    (window as any).__VOICE_DEMO_APP__ = app;
    (window as any).__SCENARIO_ENGINE__ = {
      getActiveScenarioSetId: () => isScenarioLoading ? pendingScenarioSetId : runtime.voiceChannel.getActiveScenarioSetId(),
      getActiveScenarioSetName: () => activeScenarioSet?.name || null
    };
    (window as any).__DISPATCH_VOICE_COMMAND__ = (phrase: string) =>
      runtime.voiceChannel.handleIncomingVoice(phrase, app.getIdentity());
  }

  renderRuntimeState();
  return app;
}
