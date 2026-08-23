import { DialogueStateManager, ScenarioDefinition, DialogueStatus } from './dialogue-manager';

export class VoiceChannel {
  private dialogueManager: DialogueStateManager;
  private registeredScenarios: Map<string, ScenarioDefinition> = new Map();

  constructor(timeoutMs = 15000) {
    this.dialogueManager = new DialogueStateManager(timeoutMs);
    this.registerDefaultPlatformScenarios();
    this.exposeRuntimeForE2E();
  }

  public registerScenario(scenario: ScenarioDefinition): void {
    this.registeredScenarios.set(scenario.intent, scenario);
  }

  public getDialogueManager(): DialogueStateManager {
    return this.dialogueManager;
  }

  public async handleIncomingVoice(phrase: string): Promise<{ status: DialogueStatus; prompt?: string; executedAction?: any }> {
    const text = phrase.trim();
    const activeState = this.dialogueManager.getActiveState();

    // 1. If currently in active dialogue waiting for a slot, route directly to DialogueStateManager
    if (activeState && activeState.status === 'WAITING_FOR_SLOT') {
      const currentScenario = this.registeredScenarios.get(activeState.intent);
      return this.dialogueManager.processVoiceInput(text, undefined, currentScenario);
    }

    // 2. Dynamic Intent Resolution across all registered scenarios
    const resolved = this.resolveIntent(text);
    if (resolved) {
      const scenarioDef = this.registeredScenarios.get(resolved.intent);
      return this.dialogueManager.processVoiceInput(text, resolved, scenarioDef);
    }

    return { status: 'IDLE' };
  }

  public resolveIntent(text: string): { intent: string; slots: Record<string, any> } | null {
    const lower = text.toLowerCase();

    for (const [intent, def] of this.registeredScenarios.entries()) {
      if (def.aliases && def.aliases.some(alias => lower.includes(alias.toLowerCase()))) {
        const slots: Record<string, any> = {};
        if (def.slotExtractors) {
          for (const [slotKey, extractor] of Object.entries(def.slotExtractors)) {
            const extracted = extractor(lower);
            if (extracted !== null && extracted !== undefined) {
              slots[slotKey] = extracted;
            }
          }
        }
        return { intent, slots };
      }
    }

    return null;
  }

  private registerDefaultPlatformScenarios(): void {
    this.registerScenario({
      intent: 'PROCESS_TEST_ACTION',
      actionType: 'platform.test_action.processed',
      requiredSlots: ['item', 'quantity'],
      clarificationPrompts: {
        quantity: 'Сколько?'
      },
      aliases: ['обработай яблоки', 'обработать яблоки', 'яблоки'],
      slotExtractors: {
        item: (text: string) => (text.includes('яблоки') || text.includes('яблок') ? 'apples' : null),
        quantity: (text: string) => {
          if (text.includes('пять') || text.includes('5')) return 5;
          if (text.includes('два') || text.includes('2')) return 2;
          return null;
        }
      }
    });

    this.registerScenario({
      intent: 'PROCESS_SALE',
      actionType: 'platform.sale.processed',
      requiredSlots: ['item', 'quantity'],
      clarificationPrompts: {
        quantity: 'Сколько килограммов продать?'
      },
      aliases: ['продай помидоры', 'продать помидоры', 'помидоры'],
      slotExtractors: {
        item: (text: string) => (text.includes('помидоры') || text.includes('помидор') ? 'tomatoes' : null),
        quantity: (text: string) => {
          if (text.includes('два') || text.includes('2')) return 2;
          return null;
        }
      }
    });
  }

  private exposeRuntimeForE2E(): void {
    if (typeof window !== 'undefined') {
      (window as any).__VOICE_CHANNEL__ = this;
      (window as any).__DIALOGUE_MANAGER__ = this.dialogueManager;
      (window as any).__DISPATCH_VOICE_COMMAND__ = (phrase: string) => this.handleIncomingVoice(phrase);
    }
  }
}

export const platformVoiceChannel = new VoiceChannel();
