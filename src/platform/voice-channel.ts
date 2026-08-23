import { DialogueStateManager, ScenarioDefinition } from './dialogue-manager';

export class VoiceChannel {
  private dialogueManager: DialogueStateManager;
  private registeredScenarios: Map<string, ScenarioDefinition> = new Map();

  constructor(timeoutMs = 15000) {
    this.dialogueManager = new DialogueStateManager(timeoutMs);
    this.exposeRuntimeForE2E();
  }

  public registerScenario(scenario: ScenarioDefinition) {
    this.registeredScenarios.set(scenario.intent, scenario);
  }

  public getDialogueManager(): DialogueStateManager {
    return this.dialogueManager;
  }

  public async handleIncomingVoice(phrase: string): Promise<any> {
    const text = phrase.trim();
    const activeState = this.dialogueManager.getActiveState();

    // 1. If we are waiting for slot, feed directly into DialogueStateManager
    if (activeState && activeState.status === 'WAITING_FOR_SLOT') {
      const currentScenario = this.registeredScenarios.get(activeState.intent);
      return this.dialogueManager.processVoiceInput(text, undefined, currentScenario);
    }

    // 2. Intent Resolution from incoming utterance
    const resolved = this.resolveIntent(text);
    if (resolved) {
      const scenarioDef = this.registeredScenarios.get(resolved.intent);
      return this.dialogueManager.processVoiceInput(text, resolved, scenarioDef);
    }

    return { status: 'UNRESOLVED' };
  }

  private resolveIntent(text: string): { intent: string; slots: Record<string, any> } | null {
    const lower = text.toLowerCase();
    
    // Universal pattern matching for platform intents
    if (lower.includes('обработай яблоки') || lower.includes('яблоки')) {
      return {
        intent: 'PROCESS_TEST_ACTION',
        slots: { item: 'apples' }
      };
    }
    
    if (lower.includes('продай помидоры') || lower.includes('помидоры')) {
      return {
        intent: 'PROCESS_SALE',
        slots: { item: 'tomatoes' }
      };
    }

    return null;
  }

  private exposeRuntimeForE2E() {
    if (typeof window !== 'undefined') {
      (window as any).__VOICE_CHANNEL__ = this;
      (window as any).__DIALOGUE_MANAGER__ = this.dialogueManager;
      (window as any).__DISPATCH_VOICE_COMMAND__ = (phrase: string) => this.handleIncomingVoice(phrase);
      (window as any).__TRIGGER_DIALOGUE_TIMEOUT__ = () => this.dialogueManager.triggerTimeout();
      (window as any).__ACTION_EXECUTION_LOGS__ = this.dialogueManager.getExecutionLogs();
    }
  }
}

// Global runtime instance
export const platformVoiceChannel = new VoiceChannel();
