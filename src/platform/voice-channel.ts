import { DialogueStateManager } from './dialogue-manager';

export interface SlotExtractorDefinition {
  type: 'integer' | 'enum' | 'string';
  pattern?: string;
  mapping?: Record<string, string[]>;
}

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
  slotExtractors?: Record<string, SlotExtractorDefinition>;
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

  private extractSlotsFromText(text: string, extractors?: Record<string, SlotExtractorDefinition>): Record<string, any> {
    const extracted: Record<string, any> = {};
    if (!extractors) return extracted;

    for (const [slotKey, extractor] of Object.entries(extractors)) {
      if (extractor.type === 'integer' && extractor.pattern) {
        const regex = new RegExp(extractor.pattern);
        const match = text.match(regex);
        if (match) {
          extracted[slotKey] = parseInt(match[0], 10);
        }
      } else if (extractor.type === 'enum' && extractor.mapping) {
        for (const [enumValue, synonyms] of Object.entries(extractor.mapping)) {
          if (synonyms.some(synonym => text.includes(synonym.toLowerCase()))) {
            extracted[slotKey] = enumValue;
            break;
          }
        }
      }
    }

    return extracted;
  }

  public async handleIncomingVoice(phrase: string): Promise<any> {
    const text = phrase.trim().toLowerCase();

    // 1. Universal Cancellation
    if (text === 'отмена' || text === 'cancel') {
      return this.dialogueManager.cancelContext();
    }

    // 2. Universal Intent Resolution via Scenario Registry
    const matchedScenario = this.scenarioRegistry.find(sc => {
      if (sc.activation.type !== 'voice') return false;
      const actPattern = sc.activation.value.replace(/^voice\./, '').replace(/[-_]/g, ' ').toLowerCase();
      const words = actPattern.split(' ');
      return words.every(w => text.includes(w)) || text.includes(sc.intent.toLowerCase().replace(/_/g, ' '));
    });

    if (matchedScenario) {
      const emitStep = matchedScenario.steps.find(st => st.kind === 'emit');
      const actionType = emitStep?.event?.type || '';
      const requiredSlots = matchedScenario.requiredSlots || [];
      const prompts = matchedScenario.clarificationPrompts || {};

      // Universal Slot Extraction via Declarative Extractors
      const initialSlots = this.extractSlotsFromText(text, matchedScenario.slotExtractors);

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

    // 4. Universal Slot Filling for active/routed context using registered scenario extractors
    const activeScenario = this.scenarioRegistry.find(sc => sc.intent === targetCtx.intent);
    const filledSlots = this.extractSlotsFromText(text, activeScenario?.slotExtractors);

    let updatedCtx: any = targetCtx;
    for (const [slotKey, slotVal] of Object.entries(filledSlots)) {
      if (targetCtx.missingSlots.includes(slotKey)) {
        updatedCtx = this.dialogueManager.fillSlot(slotKey, slotVal, targetCtx.contextId);
      }
    }

    return updatedCtx;
  }
}
