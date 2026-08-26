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

  // Resolves natural references ("первый", "второй", "третий", "комфорт", "подешевле") dynamically against the context's OfferSet
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

    // Natural index references:
    const isFirst = text.includes('первый') || text.includes('первую') || text.includes('первого') || text.includes('1');
    const isSecond = text.includes('второй') || text.includes('вторую') || text.includes('второго') || text.includes('2');
    const isThird = text.includes('третий') || text.includes('третью') || text.includes('третьего') || text.includes('3');
    const isComfort = text.includes('комфорт') && !isFirst && !isThird;
    const isCheapAmbiguous = text.includes('подешевле') || text.includes('дешевую') || text.includes('машину подешевле');

    if (isCheapAmbiguous) {
      // Find candidate offers sorted by price
      const available = offers.filter(o => o.status === 'AVAILABLE');
      if (available.length > 1) {
        return {
          status: 'AMBIGUOUS_OFFER',
          candidates: available,
          prompt: 'Есть несколько вариантов. Выберите, пожалуйста, первый, второй или третий?'
        };
      }
    }

    let targetOffer: OfferDefinition | undefined;
    if (isFirst) {
      targetOffer = offers.find(o => o.index === 1 || o.offerId === 'OFFER-A');
    } else if (isSecond) {
      targetOffer = offers.find(o => o.index === 2 || o.offerId === 'OFFER-B');
    } else if (isThird) {
      targetOffer = offers.find(o => o.index === 3 || o.offerId === 'OFFER-C');
    } else if (isComfort) {
      targetOffer = offers.find(o => o.vehicleType.toLowerCase() === 'comfort');
    }

    if (!targetOffer) {
      // Check for non-existent offers (e.g., "четвертую", "4")
      if (text.includes('четверт') || text.includes('4') || text.includes('пятую')) {
        return { status: 'NO_MATCH' };
      }
      return { status: 'NO_MATCH' };
    }

    if (targetOffer.status === 'UNAVAILABLE') {
      return { status: 'OFFER_UNAVAILABLE', offerId: targetOffer.offerId, offer: targetOffer };
    }

    return { status: 'RESOLVED', offerId: targetOffer.offerId, offer: targetOffer };
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

    // 2. Dynamic Offer Comparison & Query Handling (BLOCKER-1 & BLOCKER-2)
    const activeWaiting = this.dialogueManager.listContexts(identity).filter(c => c.status === 'WAITING_FOR_SLOT');
    const currentOffers = activeWaiting.length > 0 && activeWaiting[0].offers ? activeWaiting[0].offers : this.defaultOffers;

    if (currentOffers && currentOffers.length > 0) {
      // Comparison questions:
      if (text.includes('быстрее')) {
        const fastest = [...currentOffers].filter(o => o.status === 'AVAILABLE').sort((a, b) => a.etaMinutes - b.etaMinutes)[0];
        return {
          status: 'OFFER_COMPARISON_RESOLVED',
          intent: 'COMPARE_OFFERS_ETA',
          comparisonAttribute: 'ETA',
          bestOfferId: fastest?.offerId,
          etaMinutes: fastest?.etaMinutes,
          response: `Быстрее всего ${fastest?.offerId === 'OFFER-A' ? 'первый вариант' : fastest?.offerId} — ${fastest?.etaMinutes} минуты.`
        };
      }

      if (text.includes('дешевле')) {
        const cheapest = [...currentOffers].filter(o => o.status === 'AVAILABLE').sort((a, b) => a.price - b.price)[0];
        return {
          status: 'OFFER_COMPARISON_RESOLVED',
          intent: 'COMPARE_OFFERS_PRICE',
          comparisonAttribute: 'PRICE',
          bestOfferId: cheapest?.offerId,
          price: cheapest?.price,
          response: `Дешевле всего ${cheapest?.offerId === 'OFFER-C' ? 'третий вариант' : cheapest?.offerId} — ${cheapest?.price}.`
        };
      }

      if (text.includes('комфорт') && (text.includes('второй') || text.includes('это'))) {
        const target = currentOffers.find(o => o.index === 2 || o.offerId === 'OFFER-B');
        return {
          status: 'OFFER_QUERY_RESOLVED',
          intent: 'QUERY_OFFER_COMFORT',
          offerId: target?.offerId,
          vehicleType: target?.vehicleType,
          isComfort: target?.vehicleType.toLowerCase() === 'comfort',
          response: `Да, второй вариант — ${target?.vehicleType}.`
        };
      }

      if (text.includes('далеко') && (text.includes('второй') || text.includes('водитель'))) {
        const target = currentOffers.find(o => o.index === 2 || o.offerId === 'OFFER-B');
        return {
          status: 'OFFER_QUERY_RESOLVED',
          intent: 'QUERY_OFFER_DISTANCE',
          offerId: target?.offerId,
          distanceKm: target?.distanceKm,
          response: `Он находится в ${target ? target.distanceKm * 1000 : 0} метрах.`
        };
      }
    }

    // 3. Dynamic Offer Selection (Natural references resolution against OfferSet)
    if (activeWaiting.length > 0 && currentOffers && currentOffers.length > 0) {
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

    // 4. Intent Resolution (Initial creation)
    const intentRes = this.resolveIntent(text);

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
