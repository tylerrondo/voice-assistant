import { DialogueStateManager, RoutingResult, ActionDispatchHandler, SessionIdentity } from './dialogue-manager';

export interface SlotExtractorDefinition {
  type: 'integer' | 'enum' | 'string';
  pattern?: string;
  mapping?: Record<string, string[]>;
  priority?: number;
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
  aliases?: string[];
  priority?: number;
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

export type IntentResolutionResult =
  | { status: 'RESOLVED'; scenarioId: string; intent: string; scenario: ScenarioDefinition }
  | { status: 'AMBIGUOUS_INTENT'; candidateScenarioIds: string[]; candidateIntents: string[]; clarificationPrompt?: string }
  | { status: 'NO_MATCH' };

export type SlotExtractionResult =
  | { status: 'RESOLVED'; slots: Record<string, any> }
  | { status: 'AMBIGUOUS_SLOT'; candidates: Array<{ slotName: string; value: any; scenarioId: string }> }
  | { status: 'NO_MATCH' };

export class VoiceChannel {
  private dialogueManager: DialogueStateManager;
  private scenarioRegistry: ScenarioDefinition[] = [];
  private activeScenarioSetId: string = '';

  constructor(dialogueManager: DialogueStateManager) {
    this.dialogueManager = dialogueManager;
  }

  public registerScenarioSet(scenarioSet: ScenarioSet): void {
    if (!scenarioSet || !Array.isArray(scenarioSet.scenarios)) {
      throw new Error('CONTRACT_VIOLATION: Invalid ScenarioSet structure');
    }

    const seenIds = new Set<string>();
    const seenTriggers = new Set<string>();

    // Comprehensive atomic registry validation
    for (const sc of scenarioSet.scenarios) {
      if (!sc.id || typeof sc.id !== 'string') {
        throw new Error('CONTRACT_VIOLATION: Scenario missing valid id');
      }
      if (seenIds.has(sc.id)) {
        throw new Error(`CONTRACT_VIOLATION: Duplicate scenario id "${sc.id}"`);
      }
      seenIds.add(sc.id);

      if (!sc.intent || typeof sc.intent !== 'string') {
        throw new Error(`CONTRACT_VIOLATION: Scenario "${sc.id}" missing intent`);
      }

      if (sc.priority !== undefined) {
        if (typeof sc.priority !== 'number' || !Number.isFinite(sc.priority) || Number.isNaN(sc.priority)) {
          throw new Error(`CONTRACT_VIOLATION: Scenario "${sc.id}" has invalid priority`);
        }
      }

      if (sc.aliases !== undefined && !Array.isArray(sc.aliases)) {
        throw new Error(`CONTRACT_VIOLATION: Scenario "${sc.id}" aliases must be an array`);
      }

      if (!sc.activation || sc.activation.type !== 'voice' || !sc.activation.value) {
        throw new Error(`CONTRACT_VIOLATION: Scenario "${sc.id}" missing valid voice activation`);
      }

      const allTriggers = [sc.activation.value, ...(sc.aliases || [])];
      for (const trig of allTriggers) {
        if (typeof trig !== 'string' || !trig.trim()) {
          throw new Error(`CONTRACT_VIOLATION: Empty or invalid trigger/alias in scenario "${sc.id}"`);
        }
        const norm = trig.trim().toLowerCase();
        if (seenTriggers.has(norm)) {
          throw new Error(`CONTRACT_VIOLATION: Trigger or alias collision detected for "${norm}" in scenario "${sc.id}"`);
        }
        seenTriggers.add(norm);
      }

      if (sc.slotExtractors) {
        for (const [slotKey, ext] of Object.entries(sc.slotExtractors)) {
          if (!['integer', 'enum', 'string'].includes(ext.type)) {
            throw new Error(`CONTRACT_VIOLATION: Invalid extractor type for "${slotKey}" in scenario "${sc.id}"`);
          }
          if (ext.priority !== undefined) {
            if (typeof ext.priority !== 'number' || !Number.isFinite(ext.priority) || Number.isNaN(ext.priority)) {
              throw new Error(`CONTRACT_VIOLATION: Extractor "${slotKey}" in scenario "${sc.id}" has invalid priority`);
            }
          }
        }
      }

      const hasEmit = sc.steps && sc.steps.some(st => st.kind === 'emit' && st.event && st.event.type);
      if (!hasEmit) {
        throw new Error(`CONTRACT_VIOLATION: Scenario "${sc.id}" missing emit step with actionType`);
      }
    }

    // Atomic assignment on successful validation
    this.scenarioRegistry = [...scenarioSet.scenarios];
    this.activeScenarioSetId = scenarioSet.id;
  }

  public getActiveScenarioSetId(): string {
    return this.activeScenarioSetId;
  }

  public setActionDispatchHandler(handler: ActionDispatchHandler): void {
    this.dialogueManager.setActionDispatchHandler(handler);
  }

  public getDeterministicScenarioForIntent(intent: string): ScenarioDefinition | undefined {
    const matching = this.scenarioRegistry.filter(sc => sc.intent === intent);
    if (matching.length === 0) return undefined;
    if (matching.length === 1) return matching[0];

    const maxPriority = Math.max(...matching.map(s => s.priority ?? 0));
    const highest = matching.filter(s => (s.priority ?? 0) === maxPriority);
    
    // Deterministic tie-breaker: order-independent lexical sorting by scenario ID
    highest.sort((a, b) => a.id.localeCompare(b.id));
    return highest[0];
  }

  public resolveIntent(phrase: string): IntentResolutionResult {
    const text = phrase.trim().toLowerCase();
    const matchingScenarios: ScenarioDefinition[] = [];

    for (const sc of this.scenarioRegistry) {
      const allTriggers = [sc.activation.value, ...(sc.aliases || [])];
      const matches = allTriggers.some(trig => {
        const clean = trig.replace(/^voice\./, '').replace(/[-_]/g, ' ').toLowerCase();
        const words = clean.split(/\s+/);
        return words.every(w => text.includes(w));
      });

      if (matches) {
        matchingScenarios.push(sc);
      }
    }

    if (matchingScenarios.length === 0) {
      return { status: 'NO_MATCH' };
    }

    if (matchingScenarios.length === 1) {
      const sc = matchingScenarios[0];
      return { status: 'RESOLVED', scenarioId: sc.id, intent: sc.intent, scenario: sc };
    }

    // Priority-based resolution
    const maxPriority = Math.max(...matchingScenarios.map(s => s.priority ?? 0));
    const highestCandidates = matchingScenarios.filter(s => (s.priority ?? 0) === maxPriority);

    if (highestCandidates.length === 1) {
      const sc = highestCandidates[0];
      return { status: 'RESOLVED', scenarioId: sc.id, intent: sc.intent, scenario: sc };
    }

    const candidateIds = highestCandidates.map(s => s.id);
    const candidateIntents = highestCandidates.map(s => s.intent);

    return {
      status: 'AMBIGUOUS_INTENT',
      candidateScenarioIds: candidateIds,
      candidateIntents: candidateIntents,
      clarificationPrompt: highestCandidates[0].ambiguityPrompt?.template
    };
  }

  public extractSlotsDeterministically(text: string, extractors?: Record<string, SlotExtractorDefinition>, scenarioId: string = 'sc'): SlotExtractionResult {
    if (!extractors || Object.keys(extractors).length === 0) {
      return { status: 'RESOLVED', slots: {} };
    }

    const candidates: Array<{ slotName: string; value: any; priority: number; scenarioId: string }> = [];

    for (const [slotKey, extractor] of Object.entries(extractors)) {
      if (extractor.type === 'integer' && extractor.pattern) {
        const regex = new RegExp(extractor.pattern);
        const match = text.match(regex);
        if (match) {
          candidates.push({
            slotName: slotKey,
            value: parseInt(match[0], 10),
            priority: extractor.priority ?? 0,
            scenarioId
          });
        }
      } else if (extractor.type === 'enum' && extractor.mapping) {
        for (const [enumValue, synonyms] of Object.entries(extractor.mapping)) {
          if (synonyms.some(synonym => text.includes(synonym.toLowerCase()))) {
            candidates.push({
              slotName: slotKey,
              value: enumValue,
              priority: extractor.priority ?? 0,
              scenarioId
            });
            break;
          }
        }
      } else if (extractor.type === 'string' && extractor.pattern) {
        const match = text.match(new RegExp(extractor.pattern));
        if (match) {
          candidates.push({
            slotName: slotKey,
            value: match[0],
            priority: extractor.priority ?? 0,
            scenarioId
          });
        }
      }
    }

    if (candidates.length === 0) {
      return { status: 'NO_MATCH' };
    }

    if (candidates.length === 1) {
      return { status: 'RESOLVED', slots: { [candidates[0].slotName]: candidates[0].value } };
    }

    // Check for Slot Ambiguity across candidates
    const maxPrio = Math.max(...candidates.map(c => c.priority));
    const highest = candidates.filter(c => c.priority === maxPrio);

    if (highest.length === 1) {
      return { status: 'RESOLVED', slots: { [highest[0].slotName]: highest[0].value } };
    }

    return {
      status: 'AMBIGUOUS_SLOT',
      candidates: highest.map(h => ({ slotName: h.slotName, value: h.value, scenarioId: h.scenarioId }))
    };
  }

  public async handleIncomingVoice(phrase: string, identity: SessionIdentity): Promise<any> {
    if (!identity || !identity.ownerId || !identity.sessionId) {
      throw new Error('CONTRACT_VIOLATION: SessionIdentity is strictly required for handleIncomingVoice');
    }

    const text = phrase.trim().toLowerCase();
    const tokens = text.split(/\s+/);

    // 1. Strict Cancellation Flow
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
          const matchingScenario = this.getDeterministicScenarioForIntent(candidateIntent);
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

    // 2. Intent Resolution
    const intentRes = this.resolveIntent(text);

    if (intentRes.status === 'AMBIGUOUS_INTENT') {
      return {
        status: 'AMBIGUOUS_INTENT',
        candidateScenarioIds: intentRes.candidateScenarioIds,
        candidateIntents: intentRes.candidateIntents
      };
    }

    if (intentRes.status === 'RESOLVED') {
      const sc = intentRes.scenario;
      const emitStep = sc.steps.find(st => st.kind === 'emit');
      const actionType = emitStep?.event?.type || '';
      const requiredSlots = sc.requiredSlots || [];
      const prompts = sc.clarificationPrompts || {};

      const slotRes = this.extractSlotsDeterministically(text, sc.slotExtractors, sc.id);
      if (slotRes.status === 'AMBIGUOUS_SLOT') {
        return {
          status: 'AMBIGUOUS_SLOT',
          candidates: slotRes.candidates
        };
      }

      const initialSlots = slotRes.status === 'RESOLVED' ? slotRes.slots : {};

      return this.dialogueManager.createContext(
        sc.intent,
        initialSlots,
        requiredSlots,
        actionType,
        prompts,
        identity
      );
    }

    // 3. Extract slots scoped to active contexts of the current session
    const activeContexts = this.dialogueManager.listContexts(identity).filter(c => c.status === 'WAITING_FOR_SLOT');
    if (activeContexts.length === 0) {
      return { status: 'NO_MATCH' };
    }

    const allSlotCandidates: Array<{ slotName: string; value: any; priority: number; scenarioId: string }> = [];

    for (const ctx of activeContexts) {
      const scenario = this.getDeterministicScenarioForIntent(ctx.intent);
      if (scenario && scenario.slotExtractors) {
        const slotRes = this.extractSlotsDeterministically(text, scenario.slotExtractors, scenario.id);
        if (slotRes.status === 'AMBIGUOUS_SLOT') {
          return {
            status: 'AMBIGUOUS_SLOT',
            candidates: slotRes.candidates
          };
        }
        if (slotRes.status === 'RESOLVED') {
          for (const [slotKey, slotVal] of Object.entries(slotRes.slots)) {
            const extPrio = scenario.slotExtractors[slotKey]?.priority ?? 0;
            allSlotCandidates.push({ slotName: slotKey, value: slotVal, priority: extPrio, scenarioId: scenario.id });
          }
        }
      }
    }

    if (allSlotCandidates.length === 0) {
      return { status: 'NO_MATCH' };
    }

    // Check for cross-context slot ambiguity
    const extractedSlots: Record<string, any> = {};
    if (allSlotCandidates.length === 1) {
      extractedSlots[allSlotCandidates[0].slotName] = allSlotCandidates[0].value;
    } else {
      const maxSlotPrio = Math.max(...allSlotCandidates.map(c => c.priority));
      const highestSlots = allSlotCandidates.filter(c => c.priority === maxSlotPrio);
      if (highestSlots.length === 1) {
        extractedSlots[highestSlots[0].slotName] = highestSlots[0].value;
      } else {
        const distinctSlots = new Set(highestSlots.map(h => h.slotName));
        if (distinctSlots.size > 1) {
          return {
            status: 'AMBIGUOUS_SLOT',
            candidates: highestSlots.map(h => ({ slotName: h.slotName, value: h.value, scenarioId: h.scenarioId }))
          };
        }
        extractedSlots[highestSlots[0].slotName] = highestSlots[0].value;
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
      const matchingScenario = this.getDeterministicScenarioForIntent(candidateIntent);
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
