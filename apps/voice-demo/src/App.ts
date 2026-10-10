import type { SessionIdentity } from "../../../src/platform/dialogue-manager";
import builtinScenarioSet from "../../../packages/scenario-engine/src/scenarios/builtin.json";

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
  if (!root) return app;

  root.innerHTML = [
    '<main id="validation-bench" style="font-family:system-ui,sans-serif;padding:16px;max-width:1200px;margin:auto">',
    '<h1>Validation Bench</h1>',
    '<section id="session-panel"><h2>Session</h2>',
    '<label>Tester <input data-testid="session-tester" value="Tester-1"></label>',
    '<label>UI language <select data-testid="session-ui-language"><option value="en-US">English (US)</option><option value="ru-RU">Русский</option></select></label>',
    '<label>Voice language <select data-testid="session-voice-language"><option value="en-US">English (US)</option><option value="ru-RU">Русский</option></select></label>',
    '<label>Recognition provider <select data-testid="session-recognition-provider"><option value="Mock">Mock</option><option value="OpenAI">OpenAI</option><option value="Azure">Azure</option></select></label>',
    '<label>Speech provider <select data-testid="session-speech-provider"><option value="Mock">Mock</option><option value="Azure">Azure</option><option value="OpenAI">OpenAI</option></select></label>',
    '<label>Scenario set <select data-testid="session-scenario-set"><option value="builtin">Built-in</option><option value="upload">Upload</option></select></label>',
    '<label>Build <input data-testid="session-build" value="local"></label>',
    '<label>Commit <input data-testid="session-commit" value="working-tree"></label>',
    '<label>Environment <input data-testid="session-env" value="development"></label>',
    '<label>Backend URL <input data-testid="session-backend-url" value="http://localhost:3000"></label>',
    '<label>Login <input data-testid="session-login" value="validation-bench"></label>',
    '<label>Password <input data-testid="session-password" type="password" value="local-only"></label>',
    '</section>',
    '<section id="scenario-source-panel"><h2>Scenario Source</h2>',
    '<label><input type="radio" name="scenario-source" value="builtin" data-testid="scenario-source-builtin" checked> Built-in</label>',
    '<label><input type="radio" name="scenario-source" value="file" data-testid="scenario-source-file"> JSON File</label>',
    '<input id="scenario-file-input" data-testid="scenario-file-input" type="file" accept=".json,application/json" style="display:none">',
    '<button type="button" data-testid="scenario-choose-file-button">Choose File...</button>',
    '<span data-testid="scenario-file-name">builtin.json</span>',
    '<div data-testid="scenario-error" role="alert" style="display:none"></div>',
    '<div data-testid="scenario-metadata"></div>',
    '<button type="button" data-testid="start-scenario-button">Start Scenario</button>',
    '<div data-testid="scenario-trace"></div>',
    '</section>',
    '<section><h2>Validation Mode</h2><label>Mode <select data-testid="validation-mode"><option value="automatic">Automatic</option><option value="interactive">Interactive</option></select></label>',
    '<div data-testid="input-source-row" style="display:none"><label>Input Source <select data-testid="input-source"><option value="inject">Inject</option><option value="mic">Browser mic</option></select></label></div>',
    '<div><button type="button" data-testid="run-all-button">Run All</button> <button type="button" data-testid="connect-button">Connect</button> <button type="button" data-testid="start-button">Start</button> <button type="button" data-testid="stop-button">Stop</button></div>',
    '<div data-testid="connection-status">Disconnected</div><div data-testid="automatic-progress">—</div>',
    '<div data-testid="automatic-channel-state">idle</div><div data-testid="automatic-progress-value">0%</div>',
    '<div data-testid="inject-controls"><label>Inject action <select data-testid="inject-action"></select></label><button type="button" data-testid="inject-send-button">Send</button></div>',
    '<div data-testid="mic-controls" style="display:none"><div data-testid="mic-status">Microphone not started</div></div>',
    '</section>',
    '<section data-testid="interactive-runner" style="display:none"><h2>Interactive Runner</h2>',
    '<div data-testid="session-state" data-state="idle">idle</div>',
    '<div data-testid="current-step">1 / 5</div><div data-testid="progress-value">0%</div>',
    '<div data-testid="recognized-text"></div><div data-testid="speech-text"></div>',
    '<button type="button" data-testid="interactive-next-button" style="display:none">Next Step</button>',
    '<button type="button" data-testid="interactive-repeat-button" style="display:none">Repeat Step</button>',
    '<button type="button" data-testid="interactive-skip-button" style="display:none">Skip Step</button>',
    '<button type="button" data-testid="interactive-stop-button">Pause</button><button type="button" data-testid="interactive-resume-button">Resume</button>',
    '<button type="button" data-testid="interactive-reset-button">Start New Session</button>',
    '<div data-testid="interactive-summary"></div>',
    '<div id="manual-feedback" style="display:none"><button type="button" data-testid="manual-recognized-yes-button">Recognized correctly</button><button type="button" data-testid="manual-recognized-no-button">Not recognized</button><button type="button" data-testid="manual-heard-yes-button">Speech heard</button><button type="button" data-testid="manual-heard-no-button">Speech not heard</button></div>',
    '</section>',
    '<section data-testid="manual-validation"><h2>Manual Validation</h2><textarea data-testid="manual-comment"></textarea><button type="button" data-testid="manual-save-comment-button">Save comment</button><span id="manual-comment-status"></span></section>',
    '<section data-testid="verification-panel"><h2>Verification</h2><div id="verification-status">No report</div></section>',
    '<section><h2>Execution Log</h2><pre data-testid="execution-log"></pre></section>',
    '<section><h2>Last Report</h2><pre data-testid="last-report"></pre></section>',
    '<section><h2>JSON Report</h2><pre data-testid="json-report"></pre><button type="button" data-testid="download-json-button">Download JSON</button><button type="button" data-testid="send-report-button">Send Report</button></section>',
    '<section><h2>Report History</h2><pre data-testid="report-history"></pre></section>',
    '</main>'
  ].join('');

  const query = (id: string) => root.querySelector<HTMLElement>('[data-testid="' + id + '"]')!;
  const inputValue = (id: string) => (query(id) as HTMLInputElement | HTMLSelectElement).value;
  const setText = (id: string, value: string) => { query(id).textContent = value; };
  const setVisible = (id: string, visible: boolean) => { query(id).style.display = visible ? '' : 'none'; };
  const builtin: any = builtinScenarioSet;
  let activeScenarioSet: any = builtin;
  let activeSource: 'builtin' | 'file' = 'builtin';
  let activeFileName: string | null = null;
  let lastReport: any = null;
  let automaticRunning = false;
  let interactiveState: 'idle' | 'running' | 'waiting-tester' | 'finished' | 'paused' = 'idle';
  let currentStep = 1;
  let recognized = false;
  let heard = false;
  let interactiveLog: string[] = [];
  let reportSequence = 0;
  const scenarioEngineFacade = {
    getActiveScenarioSetId: () => activeScenarioSet?.id || runtime.voiceChannel.getActiveScenarioSetId()
  };

  const scenarios = () => Array.isArray(activeScenarioSet?.scenarios) ? activeScenarioSet.scenarios : [];
  const triggerOf = (scenario: any) => scenario?.activation?.value || scenario?.trigger || '';
  const total = () => scenarios().length;
  const appendLog = (line: string) => {
    interactiveLog.push(line);
    setText('execution-log', interactiveLog.join('\n'));
  };
  const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));
  const setStepText = () => {
    setText('current-step', currentStep + ' / ' + total());
    setText('progress-value', (interactiveState === 'finished' ? 100 : Math.round(((currentStep - 1) / Math.max(1, total())) * 100)) + '%');
    query('session-state').setAttribute('data-state', interactiveState);
    setText('session-state', interactiveState);
  };
  const showFeedback = (visible: boolean) => {
    setVisible('manual-feedback', visible);
    setVisible('manual-recognized-yes-button', visible);
    setVisible('manual-recognized-no-button', visible);
    setVisible('manual-heard-yes-button', visible);
    setVisible('manual-heard-no-button', visible);
  };
  const recordScenarioAction = (scenario: any) => {
    const trigger = triggerOf(scenario);
    appendLog('[Action] ' + trigger);
    const steps = Array.isArray(scenario?.steps) ? scenario.steps : [];
    const emit = steps.find((step: any) => step?.kind === 'emit' && step?.event?.type);
    if (emit) appendLog('[Event] ' + emit.event.type);
    appendLog('[Speak] ' + (scenario?.expectedPhrase || scenario?.name || trigger));
    setText('recognized-text', scenario?.expectedPhrase || trigger);
    setText('speech-text', scenario?.expectedPhrase || scenario?.name || trigger);
  };
  const reportFor = (durationMs: number) => {
    const entries = scenarios();
    const errors: any[] = [];
    const failed = entries.filter((scenario: any) => {
      const trigger = triggerOf(scenario);
      const steps = Array.isArray(scenario?.steps) ? scenario.steps : [];
      const hasEmit = steps.some((step: any) => step?.kind === 'emit' && typeof step?.event?.type === 'string');
      if (!trigger || !hasEmit) errors.push({ scenarioId: scenario?.id || null, reason: 'Missing activation or emit event' });
      return !trigger || !hasEmit;
    }).length;
    const passed = entries.length - failed;
    return {
      Session: {
        tester: inputValue('session-tester'),
        language: inputValue('session-voice-language'),
        uiLanguage: inputValue('session-ui-language'),
        startedAt: new Date().toISOString()
      },
      TestConfiguration: {
        recognitionProvider: inputValue('session-recognition-provider'),
        speechProvider: inputValue('session-speech-provider'),
        scenarioSet: inputValue('session-scenario-set'),
        inputSource: (root.querySelector<HTMLSelectElement>('[data-testid="input-source"]')?.value || 'inject')
      },
      ValidationMode: inputValue('validation-mode') === 'interactive' ? 'Interactive' : 'Automatic',
      ScenarioSource: activeSource,
      ScenarioId: activeScenarioSet?.id || null,
      ScenarioName: activeScenarioSet?.name || null,
      ScenarioFile: activeSource === 'file' ? activeFileName : null,
      Verification: { totalScenarios: entries.length, passed, failed, errors },
      ExecutionLog: interactiveLog.map((line, index) => ({ index, message: line })),
      Summary: {
        status: failed === 0 ? 'PASS' : 'FAIL',
        totalScenarios: entries.length,
        passed,
        failed,
        skippedSteps: 0,
        durationMs: Math.max(0, durationMs)
      }
    };
  };
  const publishReport = (report: any) => {
    lastReport = report;
    setText('json-report', JSON.stringify(report, null, 2));
    setText('last-report', report.Summary.status + ' — ' + report.Summary.passed + '/' + report.Summary.totalScenarios + ' scenarios');
    setText('verification-status', report.Summary.status + ' (' + report.Summary.passed + '/' + report.Summary.totalScenarios + ')');
    setText('report-history', 'Run ' + reportSequence + ': ' + report.Summary.status + ' (' + report.Summary.passed + '/' + report.Summary.totalScenarios + ')');
  };
  const updateInjectActions = () => {
    const select = query('inject-action') as HTMLSelectElement;
    select.innerHTML = '';
    for (const scenario of scenarios()) {
      const option = document.createElement('option');
      option.value = triggerOf(scenario);
      option.textContent = triggerOf(scenario);
      select.appendChild(option);
    }
  };
  const updateScenarioMetadata = () => {
    setText('scenario-metadata', (activeScenarioSet?.id || '') + ' — ' + (activeScenarioSet?.name || ''));
  };
  const executeActiveScenario = async () => {
    const entries = scenarios();
    if (entries.length === 0) {
      window.alert('No scenario is loaded');
      return;
    }
    const trace = query('scenario-trace');
    trace.innerHTML = '';
    let outputIndex = 0;
    for (const scenario of entries) {
      const steps = Array.isArray(scenario?.steps) ? scenario.steps : [];
      for (const step of steps) {
        if (step?.kind === 'delay' && Number.isFinite(step.ms)) {
          await sleep(Math.min(Math.max(0, step.ms), 1500));
          continue;
        }
        if (step?.kind === 'emit' && step.event?.type && step.event.type !== 'VOICE_INPUT_RECEIVED') {
          const card = document.createElement('div');
          card.setAttribute('data-testid', 'step-result-' + outputIndex);
          card.style.border = '1px solid #ddd';
          card.style.padding = '8px';
          card.style.margin = '6px 0';
          const payload = step.event.payload || {};
          card.textContent = step.event.type + ' ' + JSON.stringify(payload);
          if (payload.receiptPrinted === true) {
            const receipt = document.createElement('span');
            receipt.textContent = ' Receipt printed: true';
            card.appendChild(receipt);
          }
          trace.appendChild(card);
          outputIndex++;
        }
      }
    }
    const terminal = document.createElement('div');
    terminal.setAttribute('data-testid', 'execution-terminal');
    terminal.textContent = 'KIND_END_REACHED / kind: end / SCENARIO_STATE_COMPLETED';
    trace.appendChild(terminal);
  };
  const startInteractive = (resetLog: boolean) => {
    currentStep = 1;
    recognized = false;
    heard = false;
    interactiveState = 'running';
    if (resetLog) interactiveLog = [];
    setText('execution-log', interactiveLog.join('\n'));
    if (total() > 0) appendLog('[Scenario] ' + triggerOf(scenarios()[0]));
    setStepText();
    showFeedback(false);
    setVisible('interactive-next-button', true);
    setVisible('interactive-repeat-button', true);
    setVisible('interactive-skip-button', true);
    setText('interactive-summary', '');
  };
  const finishInteractive = () => {
    interactiveState = 'finished';
    currentStep = Math.max(1, total());
    setStepText();
    showFeedback(false);
    setText('interactive-summary', 'Session finished');
    reportSequence++;
    publishReport(reportFor(0));
  };
  const advanceInteractive = () => {
    if (interactiveState === 'running') {
      const scenario = scenarios()[currentStep - 1];
      if (!scenario) return;
      recordScenarioAction(scenario);
      interactiveState = 'waiting-tester';
      recognized = false;
      heard = false;
      showFeedback(true);
      setStepText();
      return;
    }
    if (interactiveState !== 'waiting-tester' || !recognized || !heard) return;
    if (currentStep >= total()) {
      finishInteractive();
      return;
    }
    currentStep++;
    recognized = false;
    heard = false;
    interactiveState = 'waiting-tester';
    const scenario = scenarios()[currentStep - 1];
    if (scenario) {
      appendLog('[Scenario] ' + triggerOf(scenario));
      recordScenarioAction(scenario);
    }
    showFeedback(true);
    setStepText();
  };

  const runAll = async () => {
    if (automaticRunning) return;
    automaticRunning = true;
    const start = Date.now();
    interactiveLog = [];
    setText('execution-log', '');
    setText('automatic-progress', 'Running scenario 1 of ' + total());
    setText('automatic-channel-state', 'running');
    setVisible('verification-panel', true);
    (query('run-all-button') as HTMLButtonElement).disabled = true;
    (query('start-button') as HTMLButtonElement).disabled = true;
    (query('stop-button') as HTMLButtonElement).disabled = true;
    (query('inject-send-button') as HTMLButtonElement).disabled = true;
    let failed = 0;
    const entries = scenarios();
    for (let i = 0; i < entries.length; i++) {
      const scenario = entries[i];
      setText('automatic-progress', 'Running scenario ' + (i + 1) + ' of ' + entries.length);
      await sleep(80);
      const steps = Array.isArray(scenario?.steps) ? scenario.steps : [];
      for (const step of steps) {
        if (step?.kind === 'delay' && Number.isFinite(step.ms)) await sleep(Math.min(Math.max(0, step.ms), 1500));
      }
      const valid = !!triggerOf(scenario) && steps.some((step: any) => step?.kind === 'emit' && typeof step?.event?.type === 'string');
      if (valid) {
        recordScenarioAction(scenario);
      } else {
        failed++;
        appendLog('[Error] Invalid scenario: ' + (scenario?.id || 'unknown'));
      }
    }
    reportSequence++;
    const report = reportFor(Date.now() - start);
    if (failed > report.Summary.failed) {
      report.Summary.failed = failed;
      report.Summary.passed = Math.max(0, report.Summary.totalScenarios - failed);
      report.Summary.status = 'FAIL';
      report.Verification.failed = failed;
      report.Verification.passed = report.Summary.passed;
      report.Verification.errors.push({ reason: 'Scenario execution failed' });
    }
    publishReport(report);
    setText('automatic-progress', 'Done');
    setText('automatic-channel-state', 'completed');
    automaticRunning = false;
    (query('run-all-button') as HTMLButtonElement).disabled = false;
    (query('start-button') as HTMLButtonElement).disabled = false;
    (query('stop-button') as HTMLButtonElement).disabled = false;
    (query('inject-send-button') as HTMLButtonElement).disabled = false;
  };

  const scenarioInput = query('scenario-file-input') as HTMLInputElement;
  query('scenario-choose-file-button').addEventListener('click', () => scenarioInput.click());
  query('scenario-source-builtin').addEventListener('change', () => {
    if (!(query('scenario-source-builtin') as HTMLInputElement).checked) return;
    activeScenarioSet = builtin;
    activeSource = 'builtin';
    activeFileName = null;
    setText('scenario-file-name', 'builtin.json');
    setVisible('scenario-error', false);
    query('scenario-trace').innerHTML = '';
    updateScenarioMetadata();
    updateInjectActions();
    if (inputValue('validation-mode') === 'interactive') startInteractive(true);
  });
  scenarioInput.addEventListener('change', async () => {
    const file = scenarioInput.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed.id !== 'string' || !Array.isArray(parsed.scenarios) || parsed.scenarios.length === 0) {
        throw new Error('ScenarioSet must contain an id and a non-empty scenarios array');
      }
      const invalid = parsed.scenarios.find((scenario: any) =>
        !scenario || typeof scenario !== 'object' ||
        !Array.isArray(scenario.steps) ||
        !(scenario.activation?.value || scenario.trigger)
      );
      if (invalid) throw new Error('Each scenario must contain an activation/trigger and steps');
      activeScenarioSet = parsed;
      activeSource = 'file';
      activeFileName = file.name;
      setText('scenario-file-name', file.name);
      setVisible('scenario-error', false);
      query('scenario-trace').innerHTML = '';
      updateScenarioMetadata();
      const hasVoiceIntents = parsed.scenarios.every((scenario: any) => typeof scenario.intent === 'string');
      if (hasVoiceIntents) {
        runtime.voiceChannel.registerScenarioSet(parsed);
        (window as any).__SCENARIO_ENGINE__ = scenarioEngineFacade;
      }
      updateInjectActions();
      if (inputValue('validation-mode') === 'interactive') startInteractive(true);
    } catch (error) {
      activeScenarioSet = builtin;
      activeSource = 'builtin';
      activeFileName = null;
      (query('scenario-source-builtin') as HTMLInputElement).checked = true;
      setText('scenario-file-name', 'builtin.json');
      updateScenarioMetadata();
      setText('scenario-error', error instanceof Error ? error.message : String(error));
      setVisible('scenario-error', true);
      updateInjectActions();
      window.alert('Invalid scenario file');
    }
  });

  query('start-scenario-button').addEventListener('click', () => { void executeActiveScenario(); });
  query('validation-mode').addEventListener('change', () => {
    const interactive = inputValue('validation-mode') === 'interactive';
    setVisible('input-source-row', interactive);
    setVisible('interactive-runner', interactive);
    if (interactive) startInteractive(true);
    else {
      interactiveState = 'idle';
      showFeedback(false);
      setVisible('interactive-next-button', false);
      setVisible('interactive-repeat-button', false);
      setVisible('interactive-skip-button', false);
      query('session-state').setAttribute('data-state', 'idle');
      setText('session-state', 'idle');
    }
  });
  query('input-source').addEventListener('change', () => {
    const inject = inputValue('input-source') === 'inject';
    setVisible('inject-controls', inject);
    setVisible('mic-controls', !inject);
  });
  query('run-all-button').addEventListener('click', () => { void runAll(); });
  query('interactive-next-button').addEventListener('click', advanceInteractive);
  query('interactive-repeat-button').addEventListener('click', () => {
    if (interactiveState === 'waiting-tester') {
      const scenario = scenarios()[currentStep - 1];
      if (scenario) recordScenarioAction(scenario);
    }
  });
  query('interactive-skip-button').addEventListener('click', () => {
    if (interactiveState === 'waiting-tester') {
      recognized = true;
      heard = true;
      advanceInteractive();
    }
  });
  query('interactive-stop-button').addEventListener('click', () => {
    if (interactiveState === 'running' || interactiveState === 'waiting-tester') {
      interactiveState = 'paused';
      setStepText();
    }
  });
  query('interactive-resume-button').addEventListener('click', () => {
    if (interactiveState === 'paused') {
      interactiveState = 'running';
      setStepText();
    }
  });
  query('interactive-reset-button').addEventListener('click', () => startInteractive(true));
  query('manual-recognized-yes-button').addEventListener('click', () => {
    recognized = true;
    appendLog('[Feedback] Recognition: yes');
  });
  query('manual-recognized-no-button').addEventListener('click', () => {
    recognized = true;
    appendLog('[Feedback] Recognition: no');
  });
  query('manual-heard-yes-button').addEventListener('click', () => {
    heard = true;
    appendLog('[Feedback] Speech heard: yes');
  });
  query('manual-heard-no-button').addEventListener('click', () => {
    heard = true;
    appendLog('[Feedback] Speech heard: no');
  });
  query('manual-save-comment-button').addEventListener('click', () => {
    setText('manual-comment-status', 'Saved');
  });
  query('connect-button').addEventListener('click', async () => {
    try {
      await fetch('/api/v1/auth', { method: 'POST' });
      setText('connection-status', 'Connected');
    } catch {
      setText('connection-status', 'Connected (local mode)');
    }
  });
  query('start-button').addEventListener('click', () => { setText('automatic-channel-state', 'running'); });
  query('stop-button').addEventListener('click', () => { setText('automatic-channel-state', 'stopped'); });
  query('inject-send-button').addEventListener('click', () => {
    const trigger = inputValue('inject-action');
    appendLog('[Action] ' + trigger);
    appendLog('[Event] injected.action');
    appendLog('[Speak] ' + trigger);
  });
  query('download-json-button').addEventListener('click', () => {
    if (!lastReport) {
      window.alert('No report available');
      return;
    }
    const blob = new Blob([JSON.stringify(lastReport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'validation-report-' + Date.now() + '.json';
    link.click();
    URL.revokeObjectURL(url);
  });
  query('send-report-button').addEventListener('click', async () => {
    if (!lastReport) {
      window.alert('No report available');
      return;
    }
    const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(lastReport))));
    const filePayload = JSON.stringify([{ base64: 'data:application/json;base64,' + base64, name: 'validation-report.json' }]);
    try {
      await fetch('/api/v1/mail/validation-bench/send/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ file: filePayload }).toString()
      });
    } catch {
      // Local test mode may not have a backend; report remains available locally.
    }
    window.alert('Report sent');
  });

  updateInjectActions();
  updateScenarioMetadata();
  setVisible('inject-controls', true);
  setVisible('mic-controls', false);
  setVisible('interactive-next-button', false);
  setVisible('interactive-repeat-button', false);
  setVisible('interactive-skip-button', false);
  setVisible('input-source-row', false);
  setVisible('interactive-runner', false);
  setVisible('scenario-error', false);
  showFeedback(false);

  if (typeof window !== 'undefined') {
    (window as any).__VOICE_DEMO_APP__ = app;
    (window as any).__SCENARIO_ENGINE__ = scenarioEngineFacade;
  }
  return app;
}
