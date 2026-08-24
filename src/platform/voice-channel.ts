import { DialogueStateManager } from './dialogue-manager';

export interface ScenarioStep {
  kind: 'emit' | 'end';
  event?: {
    type: string;
    payload: Record<string, any>;
  };
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  activation: {
    type: 'voice';
    value: string;
  };
  intent: string;
  requiredSlots?: string[];
  clarificationPrompts?: Record<string, string>;
  steps: ScenarioStep[];
}

export interface ScenarioSet {
  version: number;
  id: string;
  name: string;
  scenarios: ScenarioDefinition[];
}

export class VoiceChannel {
  private dialogueManager: DialogueStateManager;
  private scenarioRegistry: ScenarioDefinition[] = [];

  constructor(dialogueManager: DialogueStateManager) {
    this.dialogueManager = dialogueManager;
  }

  public registerScenarioSet(scenarioSet: ScenarioSet): void {
    if (scenarioSet && Array.isArray(scenarioSet.scenarios)) {
      this.scenarioRegistry = [...scenarioSet.scenarios];
    }
  }

  public async handleIncomingVoice(phrase: string): Promise<any> {
    const text = phrase.trim().toLowerCase();

    // 1. Global / Cancellation
    if (text === 'отмена' || text === 'cancel') {
      return this.dialogueManager.cancelContext();
    }

    // 2. Intent Resolution via Scenario Registry
    const matchedScenario = this.scenarioRegistry.find(sc => {
      if (sc.activation.type !== 'voice') return false;
      const actPattern = sc.activation.value.replace(/^voice\./, '').replace(/[-_]/g, ' ').toLowerCase();
      // Match if text contains words from activation or intent
      const words = actPattern.split(' ');
      return words.every(w => text.includes(w)) || text.includes(sc.intent.toLowerCase().replace(/_/g, ' '));
    });

    if (matchedScenario) {
      const emitStep = matchedScenario.steps.find(st => st.kind === 'emit');
      const actionType = emitStep?.event?.type || '';
      const requiredSlots = matchedScenario.requiredSlots || [];
      const prompts = matchedScenario.clarificationPrompts || {};

      // Dynamic slot extraction from utterance
      const initialSlots: Record<string, any> = {};
      
      // Numeric / ID slots (orderId, cartId, passengerId, etc.)
      const numMatch = text.match(/\b\d+\b/);
      if (numMatch && requiredSlots.some(s => s.toLowerCase().includes('id'))) {
        const idSlot = requiredSlots.find(s => s.toLowerCase().includes('id')) || 'orderId';
        initialSlots[idSlot] = parseInt(numMatch[0], 10);
      }

      // Discrete / Text values
      if (text.includes('наличными') || text.includes('наличка')) {
        initialSlots.payment = 'cash';
      } else if (text.includes('картой') || text.includes('карта') || text.includes('безнал')) {
        initialSlots.payment = 'card';
      }

      return this.dialogueManager.createContext(
        matchedScenario.intent,
        initialSlots,
        requiredSlots,
        actionType,
        prompts
      );
    }

    // 3. Multi-Context Universal Entity Routing
    const targetCtx = this.dialogueManager.routeUtterance(text);
    if (!targetCtx || targetCtx.status !== 'WAITING_FOR_SLOT') {
      return null;
    }

    // 4. Slot Filling into routed context
    const numMatch = text.match(/\b\d+\b/);
    if (numMatch && targetCtx.missingSlots.some(s => s.toLowerCase().includes('id'))) {
      const idSlot = targetCtx.missingSlots.find(s => s.toLowerCase().includes('id'))!;
      return this.dialogueManager.fillSlot(idSlot, parseInt(numMatch[0], 10), targetCtx.contextId);
    }

    if ((text.includes('наличными') || text.includes('наличка')) && targetCtx.missingSlots.includes('payment')) {
      return this.dialogueManager.fillSlot('payment', 'cash', targetCtx.contextId);
    }

    if ((text.includes('картой') || text.includes('карта') || text.includes('безнал')) && targetCtx.missingSlots.includes('payment')) {
      return this.dialogueManager.fillSlot('payment', 'card', targetCtx.contextId);
    }

    // Invalid response: keeps context intact in WAITING_FOR_SLOT
    return targetCtx;
  }
}
