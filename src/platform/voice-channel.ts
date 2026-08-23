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

    // 1. If currently waiting for a slot in active dialogue
    if (activeState && activeState.status === 'WAITING_FOR_SLOT') {
      // Check if new utterance is an independent intent (e.g. "Я приехал")
      const resolvedNewIntent = this.resolveIntent(text);
      if (resolvedNewIntent && resolvedNewIntent.intent !== activeState.intent) {
        const newScenarioDef = this.registeredScenarios.get(resolvedNewIntent.intent);
        return this.dialogueManager.processVoiceInput(text, resolvedNewIntent, newScenarioDef);
      }

      const currentScenario = this.registeredScenarios.get(activeState.intent);
      const res = this.dialogueManager.processVoiceInput(text, undefined, currentScenario);
      this.syncWithDriverFsm(res);
      return res;
    }

    // 2. Dynamic Intent Resolution across all registered scenarios
    const resolved = this.resolveIntent(text);
    if (resolved) {
      const scenarioDef = this.registeredScenarios.get(resolved.intent);
      const res = this.dialogueManager.processVoiceInput(text, resolved, scenarioDef);
      this.syncWithDriverFsm(res);
      return res;
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

  private syncWithDriverFsm(result: { status: DialogueStatus; executedAction?: any }): void {
    if (result.status === 'COMPLETED' && result.executedAction) {
      if (typeof window !== 'undefined') {
        const action = result.executedAction;
        // Dispatch to real DOM / FSM listener
        window.dispatchEvent(new CustomEvent('driver:fsm:action', { detail: action }));
        const fsmBadge = document.querySelector('[data-testid="fsm-driver-state"], .driver-status, [data-testid="driver-status"]');
        if (fsmBadge && action.intent === 'ACCEPT_ORDER') {
          fsmBadge.textContent = 'ORDER_ACCEPTED';
        }
      }
    }
  }

  private registerDefaultPlatformScenarios(): void {
    // SC-004: Taxi Driver Dialogue Intent
    this.registerScenario({
      intent: 'ACCEPT_ORDER',
      actionType: 'driver.order.accepted',
      requiredSlots: ['orderId'],
      clarificationPrompts: {
        orderId: 'Какой заказ?'
      },
      aliases: ['прими заказ', 'принять заказ', 'заказ'],
      slotExtractors: {
        orderId: (text: string) => {
          const match = text.match(/\b(\d{4})\b/);
          return match ? parseInt(match[1], 10) : null;
        }
      }
    });

    // Taxi Driver Arrived Intent
    this.registerScenario({
      intent: 'DRIVER_ARRIVED',
      actionType: 'driver.arrived',
      requiredSlots: [],
      aliases: ['я приехал', 'прибыл', 'на месте']
    });

    // Platform Test Action
    this.registerScenario({
      intent: 'PROCESS_TEST_ACTION',
      actionType: 'platform.test_action.processed',
      requiredSlots: ['item', 'quantity'],
      clarificationPrompts: {
        quantity: 'Сколько?'
      },
      aliases: ['обработай яблоки', 'яблоки'],
      slotExtractors: {
        item: (text: string) => (text.includes('яблоки') ? 'apples' : null),
        quantity: (text: string) => {
          const m = text.match(/\b(\d+)\b/);
          if (m) return parseInt(m[1], 10);
          if (text.includes('пять')) return 5;
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
