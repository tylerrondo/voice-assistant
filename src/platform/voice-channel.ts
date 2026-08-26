import { DialogueStateManager, RoutingResult, ActionDispatcher, SessionIdentity, OfferDefinition } from './dialogue-manager';

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

export interface ScenarioQueryEvaluation {
  kind: 'compare' | 'query_attribute' | 'select_reference';
  attribute?: string;
  order?: 'min' | 'max';
  targetIndex?: number;
  responseTemplate?: string;
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
  evaluation?: ScenarioQueryEvaluation;
  steps: ScenarioStep[];
}

export interface ScenarioSet {
  version: number;
  id: string;
  name: string;
  scenarios: ScenarioDefinition[];
  defaultOffers?: OfferDefinition[];
}

export type IntentResolutionResult =
  | { status: 'RESOLVED'; scenarioId: string; intent: string; scenario: ScenarioDefinition }
  | { status: 'AMBIGUOUS_INTENT'; candidateScenarioIds: string[]; candidateIntents: string[]; clarificationPrompt?: string }
  | { status: 'NO_MATCH' };

export type SlotExtractionResult =
  | { status: 'RESOLVED'; slots: Record<string, any> }
  | { status: 'AMBIGUOUS_SLOT'; candidates: Array<{ slotName: string; value: any; scenarioId: string }>; clarificationPrompt?: string }
  | { status: 'NO_MATCH' };

export class VoiceChannel {
  private dialogueManager: DialogueStateManager;
  private scenarioRegistry: ScenarioDefinition[] = [];
  private activeScenarioSetId: string = '';
  private defaultOffers?: OfferDefinition[];

  constructor(dialogueManager: DialogueStateManager) {
    this.dialogueManager = dialogueManager;
  }

  public registerScenarioSet(scenarioSet: ScenarioSet): void {
    if (!scenarioSet || !Array.isArray(scenarioSet.scenarios)) {
      throw new Error('CONTRACT_VIOLATION: Invalid ScenarioSet structure');
    }

    const seenIds = new Set<string>();
    const seenTriggers = new Set<string>();

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

      const allTriggers = [sc.activation.value, ...(sc.aliases || [])];
      for (const trig of allTriggers) {
        const norm = trig.trim().toLowerCase();
        if (seenTriggers.has(norm)) {
          throw new Error(`CONTRACT_VIOLATION: Trigger collision detected for "${norm}" in scenario "${sc.id}"`);
        }
        seenTriggers.add(norm);
      }
    }

    this.scenarioRegistry = [...scenarioSet.scenarios];
    this.activeScenarioSetId = scenarioSet.id;
    this.defaultOffers = scenarioSet.defaultOffers;
  }

  public getActiveScenarioSetId(): string {
    return this.activeScenarioSetId;
  }

  public setActionDispatcher(dispatcher: ActionDispatcher): void {
    this.dialogueManager.setActionDispatcher(dispatcher);
  }

  public getDeterministicScenarioForIntent(intent: string): ScenarioDefinition | undefined {
    const matching = this.scenarioRegistry.filter(sc => sc.intent === intent);
    if (matching.length === 0) return undefined;
    if (matching.length === 1) return matching[0];

    const maxPriority = Math.max(...matching.map(s => s.priority ?? 0));
    const highest = matching.filter(s => (s.priority ?? 0) === maxPriority);
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

    const maxPriority = Math.max(...matchingScenarios.map(s => s.priority ?? 0));
    const highestCandidates = matchingScenarios.filter(s => (s.priority ?? 0) === maxPriority);

    if (highestCandidates.length === 1) {
      const sc = highestCandidates[0];
      return { status: 'RESOLVED', scenarioId: sc.id, intent: sc.intent, scenario: sc };
    }

    return {
      status: 'AMBIGUOUS_INTENT',
      candidateScenarioIds: highestCandidates.map(s => s.id),
      candidateIntents: highestCandidates.map(s => s.intent),
      clarificationPrompt: highestCandidates[0].ambiguityPrompt?.template
    };
  }

  public extractSlotsDeterministically(
    text: string,
    extractors?: Record<string, SlotExtractorDefinition>,
    scenarioId: string = 'sc',
    ambiguityPromptTemplate?: string
  ): SlotExtractionResult {
    if (!extractors || Object.keys(extractors).length === 0) {
      return { status: 'RESOLVED', slots: {} };
    }

    const candidates: Array<{ slotName: string; value: any; priority: number; scenarioId: string }> = [];

    for (const [slotKey, extractor] of Object.entries(extractors)) {
      if (extractor.type === 'integer' && extractor.pattern) {
        const match = text.match(new RegExp(extractor.pattern));
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

    if (candidates.length === 0) return { status: 'NO_MATCH' };
    if (candidates.length === 1) return { status: 'RESOLVED', slots: { [candidates[0].slotName]: candidates[0].value } };

    const maxPrio = Math.max(...candidates.map(c => c.priority));
    const highest = candidates.filter(c => c.priority === maxPrio);

    const distinctKeysOrVals = new Set(highest.map(h => `${h.slotName}:${h.value}`));
    if (distinctKeysOrVals.size > 1) {
      return {
        status: 'AMBIGUOUS_SLOT',
        candidates: highest.map(h => ({ slotName: h.slotName, value: h.value, scenarioId: h.scenarioId })),
        clarificationPrompt: ambiguityPromptTemplate
      };
    }

    return { status: 'RESOLVED', slots: { [highest[0].slotName]: highest[0].value } };
  }

  // Pure generic index/attribute resolution against OfferSet (Zero OfferId hardcode)
  private resolveOfferFromOffers(phrase: string, offers?: OfferDefinition[]): {
    status: 'RESOLVED' | 'OFFER_UNAVAILABLE' | 'AMBIGUOUS_OFFER' | 'NO_MATCH';
    offerId?: string;
    offer?: OfferDefinition;
    candidates?: OfferDefinition[];
    prompt?: string;
  } {
    if (!offers || offers.length === 0) {
      return { status: 'NO_MATCH' };
    }

    const text = phrase.trim().toLowerCase();

    // Natural index extraction
    let targetIndex: number | undefined;
    if (text.includes('перв') || text.includes('1')) targetIndex = 1;
    else if (text.includes('втор') || text.includes('2')) targetIndex = 2;
    else if (text.includes('трет') || text.includes('3')) targetIndex = 3;

    if (text.includes('подешевле') || text.includes('дешев')) {
      const available = offers.filter(o => o.status === 'AVAILABLE');
      if (available.length > 1) {
        return {
          status: 'AMBIGUOUS_OFFER',
          candidates: available,
          prompt: 'Есть несколько подходящих вариантов. Выберите, пожалуйста: первый, второй или третий?'
        };
      }
    }

    let targetOffer: OfferDefinition | undefined;
    if (targetIndex !== undefined) {
      targetOffer = offers.find(o => o.index === targetIndex);
    } else {
      // Attribute match (e.g. comfort vehicleType)
      targetOffer = offers.find(o => o.vehicleType && text.includes(o.vehicleType.toLowerCase()));
    }

    if (!targetOffer) {
      return { status: 'NO_MATCH' };
    }

    if (targetOffer.status === 'UNAVAILABLE') {
      return { status: 'OFFER_UNAVAILABLE', offerId: targetOffer.offerId, offer: targetOffer };
    }

    return { status: 'RESOLVED', offerId: targetOffer.offerId, offer: targetOffer };
  }

  // Pure generic evaluation of query/comparison scenarios based entirely on scenario.evaluation descriptor
  private evaluateScenarioQuery(sc: ScenarioDefinition, offers: OfferDefinition[]): any {
    const evalConfig = sc.evaluation;
    if (!evalConfig) {
      return { status: 'RESOLVED', intent: sc.intent, scenarioId: sc.id };
    }

    if (evalConfig.kind === 'compare' && evalConfig.attribute) {
      const attr = evalConfig.attribute as keyof OfferDefinition;
      const available = [...offers].filter(o => o.status === 'AVAILABLE');
      if (available.length === 0) return { status: 'NO_MATCH' };

      available.sort((a, b) => {
        const valA = Number(a[attr]) || 0;
        const valB = Number(b[attr]) || 0;
        return evalConfig.order === 'max' ? valB - valA : valA - valB;
      });

      const best = available[0];
      let responseText = evalConfig.responseTemplate || '';
      responseText = responseText
        .replace('{{offerId}}', best.offerId)
        .replace('{{index}}', String(best.index))
        .replace('{{value}}', String(best[attr]))
        .replace('{{etaMinutes}}', String(best.etaMinutes))
        .replace('{{price}}', String(best.price));

      return {
        status: 'OFFER_COMPARISON_RESOLVED',
        intent: sc.intent,
        comparisonAttribute: evalConfig.attribute.toUpperCase(),
        bestOfferId: best.offerId,
        [evalConfig.attribute]: best[attr],
        response: responseText
      };
    }

    if (evalConfig.kind === 'query_attribute' && evalConfig.targetIndex !== undefined) {
      const target = offers.find(o => o.index === evalConfig.targetIndex);
      if (!target) return { status: 'NO_MATCH' };

      let responseText = evalConfig.responseTemplate || '';
      responseText = responseText
        .replace('{{offerId}}', target.offerId)
        .replace('{{vehicleType}}', target.vehicleType)
        .replace('{{distanceMeters}}', String(target.distanceKm * 1000));

      return {
        status: 'OFFER_QUERY_RESOLVED',
        intent: sc.intent,
        offerId: target.offerId,
        vehicleType: target.vehicleType,
        isComfort: target.vehicleType.toLowerCase() === 'comfort',
        distanceKm: target.distanceKm,
        response: responseText
      };
    }

    return { status: 'RESOLVED', intent: sc.intent, scenarioId: sc.id };
  }

  public async handleIncomingVoice(phrase: string, identity: SessionIdentity): Promise<any> {
    if (!identity || !identity.ownerId || !identity.sessionId) {
      throw new Error('CONTRACT_VIOLATION: SessionIdentity is strictly required for handleIncomingVoice');
    }

    const text = phrase.trim().toLowerCase();
    const tokens = text.split(/\s+/);

    // 1. Cancellation Flow
    const isCancelToken = tokens.includes('отмена') || tokens.includes('отменить') || tokens.includes('cancel');
    if (isCancelToken) {
      const isPureCancel = text === 'отмена' || text === 'отменить' || text === 'cancel';
      const activeWaiting = this.dialogueManager.listContexts(identity).filter(c => c.status === 'WAITING_FOR_SLOT');

      if (isPureCancel) {
        if (activeWaiting.length === 1) {
          return this.dialogueManager.cancelContext(activeWaiting[0].contextId, identity);
        }
        if (activeWaiting.length > 1) {
          return {
            status: 'AMBIGUOUS_CONTEXT',
            candidateContextIds: activeWaiting.map(c => c.contextId)
          };
        }
        return { status: 'NO_MATCH' };
      }

      const routeResult = this.dialogueManager.resolveRouting(text, [], identity);
      if (routeResult.status === 'RESOLVED') {
        return this.dialogueManager.cancelContext(routeResult.contextId, identity);
      }
      return { status: 'NO_MATCH' };
    }

    // 2. Intent Resolution
    const intentRes = this.resolveIntent(text);

    // BLOCKER-1 & BLOCKER-2: Pure declarative comparison evaluation with Multi-Context Ambiguity Guard
    if (intentRes.status === 'RESOLVED' && intentRes.scenario.evaluation) {
      const activeWaiting = this.dialogueManager.listContexts(identity).filter(c => c.status === 'WAITING_FOR_SLOT');

      if (activeWaiting.length > 1) {
        return {
          status: 'AMBIGUOUS_CONTEXT',
          candidateContextIds: activeWaiting.map(c => c.contextId)
        };
      }

      const currentOffers = activeWaiting.length === 1 && activeWaiting[0].offers ? activeWaiting[0].offers : this.defaultOffers;
      if (currentOffers && currentOffers.length > 0) {
        return this.evaluateScenarioQuery(intentRes.scenario, currentOffers);
      }
    }

    // 3. Dynamic Offer Selection against active Context OfferSet
    const activeWaiting = this.dialogueManager.listContexts(identity).filter(c => c.status === 'WAITING_FOR_SLOT');
    if (activeWaiting.length === 1) {
      const currentOffers = activeWaiting[0].offers || this.defaultOffers;
      if (currentOffers && currentOffers.length > 0) {
        const offerResolution = this.resolveOfferFromOffers(text, currentOffers);

        if (offerResolution.status === 'AMBIGUOUS_OFFER') {
          return {
            status: 'AMBIGUOUS_SLOT',
            candidates: offerResolution.candidates?.map(c => ({ slotName: 'selectedOfferId', value: c.offerId, scenarioId: 'sc-select-passenger-offer' })),
            clarificationPrompt: offerResolution.prompt
          };
        }

        if (offerResolution.status === 'OFFER_UNAVAILABLE') {
          return {
            status: 'OFFER_UNAVAILABLE',
            offerId: offerResolution.offerId,
            message: `Предложение ${offerResolution.offerId} более недоступно.`
          };
        }

        if (offerResolution.status === 'RESOLVED' && offerResolution.offerId) {
          const activeCtx = activeWaiting[0];
          const fillRes = await this.dialogueManager.fillSlot('selectedOfferId', offerResolution.offerId, activeCtx.contextId, identity);
          if (fillRes.success) {
            return fillRes.data;
          }
        }
      }
    } else if (activeWaiting.length > 1) {
      // Check if user is referencing an offer while having multiple contexts without specifying context
      const isIndexReference = text.includes('перв') || text.includes('втор') || text.includes('трет') || text.includes('подешев');
      if (isIndexReference) {
        return {
          status: 'AMBIGUOUS_CONTEXT',
          candidateContextIds: activeWaiting.map(c => c.contextId)
        };
      }
    }

    // 4. Initial Context Creation from Scenario
    if (intentRes.status === 'RESOLVED') {
      const sc = intentRes.scenario;
      const emitStep = sc.steps.find(st => st.kind === 'emit');
      const actionType = emitStep?.event?.type || '';
      const requiredSlots = sc.requiredSlots || [];
      const prompts = sc.clarificationPrompts || {};

      const slotRes = this.extractSlotsDeterministically(text, sc.slotExtractors, sc.id, sc.ambiguityPrompt?.template);

      if (slotRes.status === 'AMBIGUOUS_SLOT') {
        return slotRes;
      }

      const initialSlots = slotRes.status === 'RESOLVED' ? slotRes.slots : {};

      const ctx = this.dialogueManager.createContext(
        sc.intent,
        initialSlots,
        requiredSlots,
        actionType,
        prompts,
        identity,
        sc.id,
        this.defaultOffers
      );

      if (ctx.missingSlots.length === 0) {
        const exec = this.dialogueManager.createExecution(ctx, identity);
        const dispatchRes = await this.dialogueManager.dispatchAction(exec.executionId, ctx.slots, identity);
        return {
          status: dispatchRes.status,
          contextId: ctx.contextId,
          executionId: exec.executionId,
          attempt: dispatchRes.attempt,
          context: this.dialogueManager.getContext(ctx.contextId, identity)
        };
      }

      return ctx;
    }

    if (intentRes.status === 'AMBIGUOUS_INTENT') {
      return intentRes;
    }

    // 5. General Slot Filling on Active Waiting Contexts (e.g. Confirmation «Да»)
    if (activeWaiting.length === 0) {
      return { status: 'NO_MATCH' };
    }

    for (const ctx of activeWaiting) {
      const scenario = this.getDeterministicScenarioForIntent(ctx.intent);
      if (scenario && scenario.slotExtractors) {
        const slotRes = this.extractSlotsDeterministically(
          text,
          scenario.slotExtractors,
          scenario.id,
          scenario.ambiguityPrompt?.template
        );

        if (slotRes.status === 'AMBIGUOUS_SLOT') {
          return slotRes;
        }

        if (slotRes.status === 'RESOLVED' && Object.keys(slotRes.slots).length > 0) {
          const extractedSlots = slotRes.slots;
          let mutationRes: any;
          for (const [slotKey, slotVal] of Object.entries(extractedSlots)) {
            mutationRes = await this.dialogueManager.fillSlot(slotKey, slotVal, ctx.contextId, identity);
          }

          if (mutationRes && mutationRes.success) {
            const updatedCtx = mutationRes.data;
            if (updatedCtx.missingSlots.length === 0) {
              const exec = this.dialogueManager.createExecution(updatedCtx, identity);
              const dispatchRes = await this.dialogueManager.dispatchAction(exec.executionId, updatedCtx.slots, identity);
              return {
                status: dispatchRes.status,
                contextId: updatedCtx.contextId,
                executionId: exec.executionId,
                attempt: dispatchRes.attempt,
                context: this.dialogueManager.getContext(updatedCtx.contextId, identity)
              };
            }
            return updatedCtx;
          }
        }
      }
    }

    return { status: 'NO_MATCH' };
  }
}
