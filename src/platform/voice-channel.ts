import { DialogueStateManager, RoutingResult } from './dialogue-manager';

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
  ambiguityPrompt?: {
    template: string;
  };
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

    // 1. Ambiguity-Safe Cancellation Flow
    if (text === 'отмена' || text === 'cancel' || text.includes('отмена') || text.includes('cancel')) {
      const isPureCancel = text === 'отмена' || text === 'cancel';
      const activeWaiting = this.dialogueManager.listContexts().filter(c => c.status === 'WAITING_FOR_SLOT');

      if (isPureCancel) {
        if (activeWaiting.length === 1) {
          return this.dialogueManager.cancelContext(activeWaiting[0].contextId);
        }
        if (activeWaiting.length > 1) {
          const candidateEntities = activeWaiting
            .map(c => Object.values(c.slots)[0])
            .filter(v => v !== undefined)
            .join(', ');

          const candidateIntent = activeWaiting[0]?.intent;
          const matchingScenario = this.scenarioRegistry.find(sc => sc.intent === candidateIntent);
          const template = matchingScenario?.ambiguityPrompt?.template || 'Уточните заказ: {candidateEntities}';
          const promptText = template.replace('{candidateEntities}', candidateEntities);

          return {
            status: 'AMBIGUOUS_CONTEXT',
            candidateContextIds: activeWaiting.map(c => c.contextId),
            clarificationPrompt: promptText
          };
        }
        return { status: 'NO_MATCH' };
      }

      // Explicit cancellation (e.g. "Заказ 1002 отмена")
      const routeResult = this.dialogueManager.resolveRouting(text, []);
      if (routeResult.status === 'RESOLVED') {
        return this.dialogueManager.cancelContext(routeResult.contextId);
      }
    }

    // 2. Intent Resolution (New Context Initiation)
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

      const initialSlots = this.extractSlotsFromText(text, matchedScenario.slotExtractors);

      return this.dialogueManager.createContext(
        matchedScenario.intent,
        initialSlots,
        requiredSlots,
        actionType,
        prompts
      );
    }

    // 3. Extract slots strictly scoped to active contexts in WAITING_FOR_SLOT
    const activeContexts = this.dialogueManager.listContexts().filter(c => c.status === 'WAITING_FOR_SLOT');
    let extractedSlots: Record<string, any> = {};

    for (const ctx of activeContexts) {
      const scenario = this.scenarioRegistry.find(sc => sc.intent === ctx.intent);
      if (scenario && scenario.slotExtractors) {
        const slots = this.extractSlotsFromText(text, scenario.slotExtractors);
        extractedSlots = { ...extractedSlots, ...slots };
      }
    }

    const extractedSlotKeys = Object.keys(extractedSlots);

    // 4. Resolve Context Route using Ambiguity Policy
    const routingResult: RoutingResult = this.dialogueManager.resolveRouting(text, extractedSlotKeys);

    if (routingResult.status === 'AMBIGUOUS_CONTEXT') {
      const candidateContexts = routingResult.candidateContextIds
        .map(id => this.dialogueManager.getContext(id))
        .filter(Boolean);

      const candidateEntities = candidateContexts
        .map(c => Object.values(c!.slots)[0])
        .filter(v => v !== undefined)
        .join(', ');

      const candidateIntent = candidateContexts[0]?.intent;
      const matchingScenario = this.scenarioRegistry.find(sc => sc.intent === candidateIntent);
      const template = matchingScenario?.ambiguityPrompt?.template || 'Уточните заказ: {candidateEntities}';
      const promptText = template.replace('{candidateEntities}', candidateEntities);

      return {
        status: 'AMBIGUOUS_CONTEXT',
        candidateContextIds: routingResult.candidateContextIds,
        clarificationPrompt: promptText
      };
    }

    if (routingResult.status === 'NO_MATCH') {
      return { status: 'NO_MATCH' };
    }

    // 5. Single Resolved Context: Fill slots and execute if complete
    const targetCtx = this.dialogueManager.getContext(routingResult.contextId);
    if (!targetCtx || targetCtx.status !== 'WAITING_FOR_SLOT') {
      return routingResult;
    }

    let updatedCtx: any = targetCtx;
    for (const [slotKey, slotVal] of Object.entries(extractedSlots)) {
      if (targetCtx.missingSlots.includes(slotKey)) {
        updatedCtx = this.dialogueManager.fillSlot(slotKey, slotVal, targetCtx.contextId);
      }
    }

    return updatedCtx || routingResult;
  }
}
