import type { SessionIdentity } from '../../../src/platform/dialogue-manager';
import type { ScenarioSet } from '../../../src/platform/voice-channel';
import { ScenarioEngine } from '../../../packages/scenario-engine/src/ScenarioEngine';
import { ScenarioRegistry } from '../../../packages/scenario-engine/src/ScenarioRegistry';
import type { Scenario, ScenarioStep } from '../../../packages/scenario-engine/src/index';

export class VoiceDemoApp {
  private currentIdentity: SessionIdentity;

  constructor(runtime: any, authenticatedIdentity: SessionIdentity) {
    if (!authenticatedIdentity || !authenticatedIdentity.ownerId || !authenticatedIdentity.sessionId) {
      throw new Error('CONTRACT_VIOLATION: Authenticated SessionIdentity (ownerId, sessionId) is strictly required from session layer');
    }
    this.currentIdentity = authenticatedIdentity;
    this.runtime = runtime;
  }

  private runtime: any;

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
      <main id="voice-app-ready" style="padding:16px;font-family:Arial,sans-serif;max-width:960px;margin:0 auto">
        <h2 data-testid="scenario-set-name">Voice Platform Production Runtime Ready</h2>
        <div id="runtime-identity">Authenticated session initialized</div>
        <section style="margin:16px 0">
          <label for="scenario-source-file">Загрузить JSON-сценарий</label>
          <input id="scenario-source-file" data-testid="scenario-source-file" type="file" accept="application/json,.json" />
          <div data-testid="scenario-file-name" aria-live="polite"></div>
        </section>
        <section data-testid="scenario-runner" style="margin:16px 0" hidden>
          <button type="button" data-testid="start-scenario">Запустить сценарий</button>
          <div data-testid="scenario-run-status" aria-live="polite"></div>
          <div data-testid="scenario-run-results"></div>
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
  const fileNameNode = root.querySelector<HTMLElement>('[data-testid="scenario-file-name"]');
  const runnerSection = root.querySelector<HTMLElement>('[data-testid="scenario-runner"]');
  const startButton = root.querySelector<HTMLButtonElement>('[data-testid="start-scenario"]');
  const runStatus = root.querySelector<HTMLElement>('[data-testid="scenario-run-status"]');
  const runResults = root.querySelector<HTMLElement>('[data-testid="scenario-run-results"]');
  const statusNode = root.querySelector<HTMLElement>('[data-testid="fsm-status"]');
  const traceNode = root.querySelector<HTMLElement>('[data-testid="execution-trace"]');
  const voiceInput = root.querySelector<HTMLInputElement>('[data-testid="voice-input"]');
  const form = root.querySelector<HTMLFormElement>('#voice-command-form');

  let pendingScenarioSetId: string | null = null;
  let isScenarioLoading = false;
  let activeScenarioSet: ScenarioSet | null = null;
  let pendingScenarioLoad: Promise<void> = Promise.resolve();
  let activeRunnerScenario: Scenario | null = null;
  const scenarioRegistry = new ScenarioRegistry();
  const scenarioEngine = new ScenarioEngine(scenarioRegistry);

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

      pendingScenarioSetId = file.name.match(/^scenario-(.+)\.json$/i)
        ? `scenario-set-${file.name.match(/^scenario-(.+)\.json$/i)?.[1]}`
        : null;
      isScenarioLoading = true;
      if (runnerSection) runnerSection.hidden = true;
      if (runStatus) runStatus.textContent = '';
      if (runResults) runResults.replaceChildren();

      pendingScenarioLoad = file.text().then(raw => {
        const scenarioSet = JSON.parse(raw) as ScenarioSet;
        const entries = Array.isArray(scenarioSet.scenarios) ? scenarioSet.scenarios as any[] : [];
        if (entries.length === 0) {
          throw new Error('CONTRACT_VIOLATION: ScenarioSet must contain at least one scenario');
        }

        const hasVoiceIntents = entries.every(entry => typeof entry.intent === 'string' && entry.intent.trim().length > 0);
        scenarioRegistry.clear();
        activeRunnerScenario = null;

        if (hasVoiceIntents) {
          runtime.voiceChannel.registerScenarioSet(scenarioSet);
        } else {
          const runnable = entries.map(entry => {
            const trigger = entry.activation?.value || entry.trigger || entry.expectedPhrase;
            if (typeof trigger !== 'string' || !trigger.trim() || !Array.isArray(entry.steps)) {
              throw new Error(`CONTRACT_VIOLATION: Scenario "${entry.id || entry.name || 'unknown'}" requires a trigger and steps`);
            }
            const scenario: Scenario = {
              name: entry.name || entry.id || trigger,
              trigger,
              steps: entry.steps as ScenarioStep[]
            };
            scenarioRegistry.register(scenario);
            return scenario;
          });
          activeRunnerScenario = runnable[0];
        }

        activeScenarioSet = scenarioSet;
        pendingScenarioSetId = scenarioSet.id;
        if (title) title.textContent = scenarioSet.name || scenarioSet.id;
        if (fileNameNode) fileNameNode.textContent = file.name;
        if (runnerSection) runnerSection.hidden = !activeRunnerScenario;
        isScenarioLoading = false;
        renderRuntimeState();
      }).catch(error => {
        isScenarioLoading = false;
        if (runStatus) runStatus.textContent = error instanceof Error ? error.message : String(error);
        throw error;
      });
    });
  }

  if (startButton) {
    startButton.addEventListener('click', async () => {
      if (!activeRunnerScenario || startButton.disabled) return;
      startButton.disabled = true;
      if (runStatus) runStatus.textContent = 'Выполнение…';
      if (runResults) runResults.replaceChildren();

      const expectedResults = activeRunnerScenario.steps.filter(
        step => step.kind === 'emit' && step.event.type !== 'VOICE_INPUT_RECEIVED'
      ).length;
      const emittedResults: Array<{ type: string; payload?: Record<string, unknown> }> = [];

      try {
        for await (const event of scenarioEngine.run({
          type: activeRunnerScenario.trigger,
          payload: {}
        })) {
          if (event.type !== 'VOICE_INPUT_RECEIVED') emittedResults.push(event);
        }

        if (runResults) {
          emittedResults.forEach((event, index) => {
            const row = document.createElement('div');
            row.dataset.testid = `step-result-${index}`;
            row.textContent = `${event.type} ${JSON.stringify(event.payload || {})}`;
            runResults.appendChild(row);
          });
        }

        const terminalReached = activeRunnerScenario.steps[activeRunnerScenario.steps.length - 1]?.kind === 'end';
        if (terminalReached && emittedResults.length === expectedResults) {
          const terminal = document.createElement('div');
          terminal.dataset.testid = 'execution-terminal';
          terminal.textContent = 'KIND_END_REACHED';
          runResults?.appendChild(terminal);
          if (runStatus) runStatus.textContent = `100% · ${emittedResults.length}/${expectedResults}`;
        } else if (runStatus) {
          runStatus.textContent = `Проверка не пройдена: ${emittedResults.length}/${expectedResults}`;
        }
      } catch (error) {
        if (runStatus) runStatus.textContent = error instanceof Error ? error.message : String(error);
      } finally {
        startButton.disabled = false;
      }
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
