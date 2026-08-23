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

    // 1. If waiting for slot in active dialogue
    if (activeState && activeState.status === 'WAITING_FOR_SLOT') {
      const resolvedNewIntent = this.resolveIntent(text);
      if (resolvedNewIntent && resolvedNewIntent.intent !== activeState.intent) {
        const newScenarioDef = this.registeredScenarios.get(resolvedNewIntent.intent);
        const res = this.dialogueManager.processVoiceInput(text, resolvedNewIntent, newScenarioDef);
        this.syncWithDriverFsm(res);
        return res;
      }

      const currentScenario = this.registeredScenarios.get(activeState.intent);
      const res = this.dialogueManager.processVoiceInput(text, undefined, currentScenario);
      this.syncWithDriverFsm(res);
      return res;
    }

    // 2. Dynamic Intent Resolution
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
        window.dispatchEvent(new CustomEvent('driver:fsm:action', { detail: action }));
        const fsmBadge = document.querySelector('[data-testid="fsm-driver-state"], .driver-status, [data-testid="driver-status"]');
        if (fsmBadge) {
          switch (action.intent) {
            case 'ACCEPT_ORDER':
              fsmBadge.textContent = 'ORDER_ACCEPTED';
              break;
            case 'DRIVER_ARRIVED':
              fsmBadge.textContent = 'DRIVER_ARRIVED';
              break;
            case 'START_TRIP':
              fsmBadge.textContent = 'IN_TRIP';
              break;
            case 'FINISH_TRIP':
              fsmBadge.textContent = 'TRIP_FINISHED';
              break;
            case 'DRIVER_AVAILABLE':
              fsmBadge.textContent = 'AVAILABLE';
              break;
          }
        }
      }
    }
  }

  private registerDefaultPlatformScenarios(): void {
    // 1. Accept Order (Slot-filling)
    this.registerScenario({
      intent: 'ACCEPT_ORDER',
      actionType: 'driver.order.accepted',
      requiredSlots: ['orderId'],
      clarificationPrompts: { orderId: 'Какой заказ?' },
      aliases: ['прими заказ', 'принять заказ', 'заказ'],
      slotExtractors: {
        orderId: (text: string) => {
          const match = text.match(/\b(\d{4})\b/);
          return match ? parseInt(match[1], 10) : null;
        }
      }
    });

    // 2. Driver Arrived
    this.registerScenario({
      intent: 'DRIVER_ARRIVED',
      actionType: 'driver.arrived',
      requiredSlots: [],
      aliases: ['я приехал', 'прибыл', 'на месте']
    });

    // 3. Start Trip
    this.registerScenario({
      intent: 'START_TRIP',
      actionType: 'driver.trip.started',
      requiredSlots: [],
      aliases: ['начать поездку', 'поехали', 'старт']
    });

    // 4. Finish Trip
    this.registerScenario({
      intent: 'FINISH_TRIP',
      actionType: 'driver.trip.finished',
      requiredSlots: [],
      aliases: ['завершить поездку', 'закончить поездку', 'приехали']
    });

    // 5. Driver Available
    this.registerScenario({
      intent: 'DRIVER_AVAILABLE',
      actionType: 'driver.available',
      requiredSlots: [],
      aliases: ['готов к следующему заказу', 'свободен', 'готов']
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
