import { DialogueStateManager, RoutingResult, ActionDispatchHandler, SessionIdentity } from './dialogue-manager';

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
  private activeScenarioSetId: string = '';

  constructor(dialogueManager: DialogueStateManager) {
    this.dialogueManager = dialogueManager;
  }

  public registerScenarioSet(scenarioSet: ScenarioSet): void {
    if (scenarioSet && Array.isArray(scenarioSet.scenarios)) {
      this.scenarioRegistry = [...scenarioSet.scenarios];
      this.activeScenarioSetId = scenarioSet.id;
    }
  }

  public getActiveScenarioSetId(): string {
    return this.activeScenarioSetId;
  }

  public setActionDispatchHandler(handler: ActionDispatchHandler): void {
    this.dialogueManager.setActionDispatchHandler(handler);
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

  public async handleIncomingVoice(phrase: string, identity: SessionIdentity): Promise<any> {
    if (!identity || !identity.ownerId || !identity.sessionId) {
      throw new Error('CONTRACT_VIOLATION: SessionIdentity is strictly required for handleIncomingVoice');
    }

    const text = phrase.trim().toLowerCase();
    const tokens = text.split(/\s+/);

    // 1. Strict Cancellation Intent Resolution with Mandatory Session Identity
    const isCancelToken = tokens.includes('отмена') || tokens.includes('отменить') || tokens.includes('cancel');
    if (isCancelToken) {
      const isPureCancel = text === 'отмена' || text === 'отменить' || text === 'cancel';
      const activeWaiting = this.dialogueManager.listContexts(identity).filter(c => c.status === 'WAITING_FOR_SLOT');

      if (isPureCancel) {
        if (activeWaiting.length === 1) {
          return this.dialogueManager.cancelContext(activeWaiting[0].contextId, identity);
        }
        if (activeWaiting.length > 1) {
          const candidateEntities = activeWaiting
            .map(c => Object.values(c.slots)[0])
            .filter(v => v !== undefined)
            .join(', ');

          const candidateIntent = activeWaiting[0]?.intent;
          const matchingScenario = this.scenarioRegistry.find(sc => sc.intent === candidateIntent);
          if (!matchingScenario?.ambiguityPrompt?.template) {
            throw new Error('CONTRACT_VIOLATION: ambiguityPrompt template is missing in ScenarioDefinition for intent: ' + candidateIntent);
          }

          const promptText = matchingScenario.ambiguityPrompt.template.replace('{candidateEntities}', candidateEntities);

          return {
            status: 'AMBIGUOUS_CONTEXT',
            candidateContextIds: activeWaiting.map(c => c.contextId),
            clarificationPrompt: promptText
          };
        }
        return { status: 'NO_MATCH' };
      }

      // Explicit cancellation (e.g. "Заказ 1002 отмена")
      const routeResult = this.dialogueManager.resolveRouting(text, [], identity);
      if (routeResult.status === 'RESOLVED') {
        return this.dialogueManager.cancelContext(routeResult.contextId, identity);
      }
      if (routeResult.status === 'CONTEXT_ACCESS_DENIED') {
        return { status: 'CONTEXT_ACCESS_DENIED' };
      }
      return { status: 'NO_MATCH' };
    }

    // 2. Intent Resolution (New Context Initiation with Session Identity)
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
        prompts,
        identity
      );
    }

    // 3. Extract slots strictly scoped to active contexts of the CURRENT session in WAITING_FOR_SLOT
    const activeContexts = this.dialogueManager.listContexts(identity).filter(c => c.status === 'WAITING_FOR_SLOT');
    let extractedSlots: Record<string, any> = {};

    for (const ctx of activeContexts) {
      const scenario = this.scenarioRegistry.find(sc => sc.intent === ctx.intent);
      if (scenario && scenario.slotExtractors) {
        const slots = this.extractSlotsFromText(text, scenario.slotExtractors);
        extractedSlots = { ...extractedSlots, ...slots };
      }
    }

    const extractedSlotKeys = Object.keys(extractedSlots);

    // 4. Resolve Context Route using Ownership & Ambiguity Policy
    const routingResult: RoutingResult = this.dialogueManager.resolveRouting(text, extractedSlotKeys, identity);

    if (routingResult.status === 'CONTEXT_ACCESS_DENIED') {
      return { status: 'CONTEXT_ACCESS_DENIED' };
    }

    if (routingResult.status === 'AMBIGUOUS_CONTEXT') {
      const candidateContexts = routingResult.candidateContextIds
        .map(id => this.dialogueManager.getContext(id, identity))
        .filter(Boolean);

      const candidateEntities = candidateContexts
        .map(c => Object.values(c!.slots)[0])
        .filter(v => v !== undefined)
        .join(', ');

      const candidateIntent = candidateContexts[0]?.intent;
      const matchingScenario = this.scenarioRegistry.find(sc => sc.intent === candidateIntent);
      if (!matchingScenario?.ambiguityPrompt?.template) {
        throw new Error('CONTRACT_VIOLATION: ambiguityPrompt template is missing in ScenarioDefinition for intent: ' + candidateIntent);
      }

      const promptText = matchingScenario.ambiguityPrompt.template.replace('{candidateEntities}', candidateEntities);

      return {
        status: 'AMBIGUOUS_CONTEXT',
        candidateContextIds: routingResult.candidateContextIds,
        clarificationPrompt: promptText
      };
    }

    if (routingResult.status === 'NO_MATCH') {
      return { status: 'NO_MATCH' };
    }

    // 5. Single Resolved Context: Fill slots and execute deterministically
    const targetCtx = this.dialogueManager.getContext(routingResult.contextId, identity);
    if (!targetCtx || targetCtx.status !== 'WAITING_FOR_SLOT') {
      return routingResult;
    }

    let updatedCtx: any = targetCtx;
    for (const [slotKey, slotVal] of Object.entries(extractedSlots)) {
      if (targetCtx.missingSlots.includes(slotKey)) {
        updatedCtx = this.dialogueManager.fillSlot(slotKey, slotVal, targetCtx.contextId, identity);
      }
    }

    return updatedCtx;
  }
}
