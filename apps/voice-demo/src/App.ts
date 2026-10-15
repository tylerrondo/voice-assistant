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
      <div>Platform Dialogue State</div>
      <div id="runtime-identity">AUTHENTICATED: ${authenticatedIdentity.ownerId}:${authenticatedIdentity.sessionId}</div>
      <label for="scenario-file-input">Load ScenarioSet JSON</label>
      <input id="scenario-file-input" data-testid="scenario-file-input" type="file" accept="application/json,.json" />
      <div data-testid="scenario-file-name" id="scenario-file-name" aria-live="polite"></div>
      <div id="active-scenario-set" aria-live="polite">No ScenarioSet loaded</div>
      <div id="fsm-driver-state" data-testid="fsm-driver-state" class="driver-status" aria-live="polite">AVAILABLE</div>
      <label for="voice-input">Голосовая команда</label>
      <input id="voice-input" data-testid="voice-input" name="voiceText" placeholder="Введите голосовую команду" />
      <button id="start-scenario" data-testid="start-scenario" type="button">Запустить сценарий</button>
      <div class="trace-container" data-testid="execution-trace" aria-live="polite"></div>
      <div id="execution-terminal" data-testid="execution-terminal" aria-live="polite"></div>
    </div>`;
  }
  let loadedScenarioSet: ScenarioSet | null = null;
  const fileNameDisplay = root.querySelector<HTMLElement>('#scenario-file-name');
  const traceDisplay = root.querySelector<HTMLElement>('.trace-container');
  const terminalDisplay = root.querySelector<HTMLElement>('#execution-terminal');
  const startButton = root.querySelector<HTMLButtonElement>('#start-scenario');
  const voiceInput = root.querySelector<HTMLInputElement>('#voice-input');
  if (typeof window !== 'undefined') {
    (window as any).__VOICE_DEMO_APP__ = app;
    (window as any).__SCENARIO_ENGINE__ = { getActiveScenarioSetId: () => runtime.voiceChannel.getActiveScenarioSetId(), getExecutionTrace: () => traceDisplay ? traceDisplay.innerText : '' };
  }
  const dispatchVoiceInput = async (phrase: string) => {
    if (!phrase.trim()) return;
    await app.handleVoice(phrase);
    const logs = runtime.dialogueManager.getExecutionLogs(authenticatedIdentity);
    if (traceDisplay) {
      traceDisplay.replaceChildren();
      for (const log of logs) {
        const entry = document.createElement('div');
        entry.className = 'trace-entry';
        entry.textContent = String(log.event?.type || log.actionType || log.intent) + ' ' + JSON.stringify(log.event?.payload ?? log.payload ?? {});
        traceDisplay.appendChild(entry);
      }
    }
  };
  voiceInput?.addEventListener('keydown', event => { if (event.key === 'Enter') void dispatchVoiceInput(voiceInput.value); });
  const fileInput = root.querySelector<HTMLInputElement>('#scenario-file-input');
  const activeSetDisplay = root.querySelector<HTMLElement>('#active-scenario-set');
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const scenarioSet = JSON.parse(await file.text()) as ScenarioSet;
      runtime.voiceChannel.registerScenarioSet(scenarioSet);
      loadedScenarioSet = scenarioSet;
      if (fileNameDisplay) fileNameDisplay.textContent = file.name;
      if (activeSetDisplay) activeSetDisplay.textContent = file.name + ' — ' + (scenarioSet.name || scenarioSet.id);
    } catch (error) {
      if (activeSetDisplay) {
        activeSetDisplay.textContent = error instanceof Error ? error.message : 'Unable to load ScenarioSet';
      }
    }
  });

  startButton?.addEventListener('click', async () => {
    if (!loadedScenarioSet || !traceDisplay) return;
    traceDisplay.replaceChildren();
    if (terminalDisplay) terminalDisplay.textContent = 'Выполнение сценариев…';

    const totalEvents = loadedScenarioSet.scenarios.reduce((total, scenario) =>
      total + (scenario.steps || []).filter((step: any) => step.kind === 'emit' && step.event && step.event.type !== 'VOICE_INPUT_RECEIVED').length, 0);
    let completedEvents = 0;
    let eventIndex = 0;

    for (const scenario of loadedScenarioSet.scenarios) {
      for (const step of (scenario.steps || []) as any[]) {
        if (step.kind === 'delay') {
          await new Promise(resolve => window.setTimeout(resolve, Math.max(0, Number(step.ms) || 0)));
          continue;
        }
        if (step.kind === 'end') continue;
        if (step.kind !== 'emit' || !step.event || step.event.type === 'VOICE_INPUT_RECEIVED') continue;

        const event = step.event as { type: string; payload: Record<string, any> };
        const payload = { ...(event.payload || {}) };
        const unresolved = Object.values(payload).some(value => typeof value === 'string' && /{{\\s*slots\\./.test(value));
        if (unresolved) {
          if (terminalDisplay) terminalDisplay.textContent = 'kind: error — SCENARIO_STATE_BLOCKED — отсутствуют значения обязательных слотов';
          return;
        }
        if (typeof runtime.actionDispatcher !== 'function') {
          if (terminalDisplay) terminalDisplay.textContent = 'kind: error — SCENARIO_STATE_FAILED — ActionDispatcher не настроен';
          return;
        }

        try {
          const context = runtime.dialogueManager.createContext(
            scenario.intent || scenario.id,
            payload,
            [],
            event.type,
            {},
            authenticatedIdentity,
            scenario.id
          );
          const execution = runtime.dialogueManager.createExecution(context, authenticatedIdentity);
          const result = await runtime.dialogueManager.dispatchAction(execution.executionId, payload, authenticatedIdentity);
          if (result.status !== 'SUCCEEDED') {
            if (terminalDisplay) terminalDisplay.textContent = 'kind: error — SCENARIO_STATE_FAILED — ' + String(result.status);
            return;
          }

          const entry = document.createElement('div');
          entry.className = 'trace-entry';
          entry.dataset.testid = 'step-result-' + eventIndex;
          entry.textContent = event.type + ' ' + JSON.stringify(payload);
          traceDisplay.appendChild(entry);
          completedEvents++;
          eventIndex++;
        } catch (error) {
          if (terminalDisplay) terminalDisplay.textContent = 'kind: error — SCENARIO_STATE_FAILED — ' + (error instanceof Error ? error.message : 'Неизвестная ошибка');
          return;
        }
      }
    }

    const percent = totalEvents === 0 ? 100 : Math.round(completedEvents / totalEvents * 100);
    if (terminalDisplay) terminalDisplay.textContent = 'kind: end — SCENARIO_STATE_COMPLETED — ' + completedEvents + '/' + totalEvents + ' — ' + percent + '%';
  });
  return app;
}
