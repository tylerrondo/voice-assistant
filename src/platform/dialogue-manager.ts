export type DialogueStatus = 'IDLE' | 'WAITING_FOR_SLOT' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';

export interface DialogueState {
  dialogueStateId: string;
  status: DialogueStatus;
  intent: string;
  slots: Record<string, any>;
  missingSlots: string[];
  clarificationPrompt?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ScenarioDefinition {
  intent: string;
  requiredSlots: string[];
  clarificationPrompts?: Record<string, string>;
  actionType: string;
  aliases?: string[];
  slotExtractors?: Record<string, (text: string) => any>;
}

export interface ExecutedAction {
  intent: string;
  type: string;
  payload: Record<string, any>;
  timestamp: number;
}

export class DialogueStateManager {
  private activeState: DialogueState | null = null;
  private timeoutTimer: any = null;
  private readonly timeoutMs: number;
  private readonly executedActions: ExecutedAction[] = [];

  constructor(timeoutMs = 15000) {
    this.timeoutMs = timeoutMs;
  }

  public getActiveState(): DialogueState | null {
    return this.activeState;
  }

  public getExecutionLogs(): ExecutedAction[] {
    return this.executedActions;
  }

  public processVoiceInput(
    phrase: string,
    resolvedIntent?: { intent: string; slots: Record<string, any> },
    scenarioDef?: ScenarioDefinition
  ): { status: DialogueStatus; prompt?: string; executedAction?: ExecutedAction } {
    const text = phrase.trim().toLowerCase();

    // 1. Cancellation check
    if (text === 'отмена' || text === 'отменить' || text === 'cancel') {
      if (this.activeState) {
        this.activeState.status = 'CANCELLED';
        this.activeState.updatedAt = Date.now();
        this.clearTimeout();
        return { status: 'CANCELLED' };
      }
      return { status: 'IDLE' };
    }

    // 2. If new independent command arrives while in WAITING_FOR_SLOT
    if (resolvedIntent && resolvedIntent.intent && this.activeState && this.activeState.intent !== resolvedIntent.intent) {
      this.activeState = null;
      this.clearTimeout();
    }

    // 3. Handle Slot Filling when in WAITING_FOR_SLOT
    if (this.activeState && this.activeState.status === 'WAITING_FOR_SLOT') {
      const targetSlot = this.activeState.missingSlots[0];
      const parsedValue = this.parseSlotValue(targetSlot, text, scenarioDef);

      if (parsedValue !== null && parsedValue !== undefined) {
        this.activeState.slots[targetSlot] = parsedValue;
        this.activeState.missingSlots.shift();
        this.activeState.updatedAt = Date.now();

        if (this.activeState.missingSlots.length === 0) {
          this.activeState.status = 'COMPLETED';
          this.clearTimeout();

          if (!scenarioDef) {
            throw new Error(`ScenarioDefinition missing for completed intent: ${this.activeState.intent}`);
          }

          const finalAction: ExecutedAction = {
            intent: this.activeState.intent,
            type: scenarioDef.actionType,
            payload: { ...this.activeState.slots },
            timestamp: Date.now()
          };
          this.executedActions.push(finalAction);

          return {
            status: 'COMPLETED',
            executedAction: finalAction
          };
        } else {
          const nextSlot = this.activeState.missingSlots[0];
          const nextPrompt = scenarioDef?.clarificationPrompts?.[nextSlot] || 'Уточните параметр';
          this.activeState.clarificationPrompt = nextPrompt;
          this.resetTimeout();
          return {
            status: 'WAITING_FOR_SLOT',
            prompt: nextPrompt
          };
        }
      } else {
        // Invalid answer preserves context and returns existing prompt
        return {
          status: 'WAITING_FOR_SLOT',
          prompt: this.activeState.clarificationPrompt
        };
      }
    }

    // 4. Initial Incomplete / Complete Command Handling
    if (resolvedIntent && scenarioDef) {
      const required = scenarioDef.requiredSlots || [];
      const providedSlots = resolvedIntent.slots || {};
      const missing = required.filter(slot => providedSlots[slot] === undefined);

      if (missing.length > 0) {
        const firstMissing = missing[0];
        const prompt = scenarioDef.clarificationPrompts?.[firstMissing] || 'Уточните значение';

        this.activeState = {
          dialogueStateId: `ds-${Date.now()}`,
          status: 'WAITING_FOR_SLOT',
          intent: resolvedIntent.intent,
          slots: { ...providedSlots },
          missingSlots: [...missing],
          clarificationPrompt: prompt,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        this.resetTimeout();
        return {
          status: 'WAITING_FOR_SLOT',
          prompt
        };
      } else {
        const action: ExecutedAction = {
          intent: resolvedIntent.intent,
          type: scenarioDef.actionType,
          payload: providedSlots,
          timestamp: Date.now()
        };
        this.executedActions.push(action);
        return { status: 'COMPLETED', executedAction: action };
      }
    }

    return { status: this.activeState?.status || 'IDLE' };
  }

  public triggerTimeout(): void {
    if (this.activeState && this.activeState.status === 'WAITING_FOR_SLOT') {
      this.activeState.status = 'EXPIRED';
      this.activeState.updatedAt = Date.now();
    }
  }

  private parseSlotValue(slotName: string, text: string, scenarioDef?: ScenarioDefinition): any {
    if (scenarioDef?.slotExtractors && scenarioDef.slotExtractors[slotName]) {
      return scenarioDef.slotExtractors[slotName](text);
    }

    if (slotName === 'quantity') {
      if (text.includes('пять') || text.includes('5')) return 5;
      if (text.includes('два') || text.includes('2')) return 2;
      if (text.includes('один') || text.includes('1')) return 1;
      const num = parseInt(text, 10);
      return isNaN(num) ? null : num;
    }

    return text.length > 0 ? text : null;
  }

  private resetTimeout(): void {
    this.clearTimeout();
    this.timeoutTimer = setTimeout(() => {
      this.triggerTimeout();
    }, this.timeoutMs);
  }

  private clearTimeout(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }
}
