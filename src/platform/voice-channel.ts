import {
  DialogueStateManager,
  ActionDispatcher,
  type SessionIdentity,
  type OfferDefinition,
  type DialogueContext,
  type RoutingResult
} from './dialogue-manager';

export interface SlotRule {
  pattern: string;
  value: any;
}

export interface SlotExtractorDefinition {
  type: 'integer' | 'enum' | 'string';
  pattern?: string;
  values?: string[];
  patterns?: string[];
  rules?: SlotRule[];
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
  kind: 'compare' | 'query_attribute';
  attribute?: string;
  order?: 'min' | 'max';
  targetIndex?: number;
  responseTemplate?: string;
}

export interface ScenarioDefinition {
  id: string;
  name?: string;
  activation?: {
    type: 'voice';
    value: string;
  };
  triggerPhrases?: string[];
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
  query?: {
    attribute: string;
    mode: 'min' | 'max';
  };
  responseTemplate?: string;
  steps?: ScenarioStep[];
}

export interface ScenarioSet {
  version: number;
  id: string;
  name?: string;
  description?: string;
  scenarios: ScenarioDefinition[];
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

  constructor(dialogueManager: DialogueStateManager) {
    this.dialogueManager = dialogueManager;
  }

  public registerScenarioSet(scenarioSet: ScenarioSet): void {
    if (!scenarioSet || !Array.isArray(scenarioSet.scenarios)) {
      throw new Error('CONTRACT_VIOLATION: Invalid ScenarioSet structure');
    }

    const seenIds = new Set<string>();

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
    }

    for (const sc of scenarioSet.scenarios) {
      const idx = this.scenarioRegistry.findIndex(s => s.id === sc.id);
      if (idx >= 0) {
        this.scenarioRegistry[idx] = sc;
      } else {
        this.scenarioRegistry.push(sc);
      }
    }
    this.activeScenarioSetId = scenarioSet.id;
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
      const triggers: string[] = [];
      if (sc.activation?.value) triggers.push(sc.activation.value);
      if (Array.isArray(sc.triggerPhrases)) triggers.push(...sc.triggerPhrases);
      if (Array.isArray(sc.aliases)) triggers.push(...sc.aliases);

      const matches = triggers.some(trig => {
        const clean = trig.replace(/^voice\./, '').replace(/[-_]/g, ' ').toLowerCase().trim();
        return text === clean || text.startsWith(clean) || clean.split(/\s+/).every(w => text.includes(w));
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

    const infoCandidate = highestCandidates.find(s => s.evaluation?.kind === 'query_attribute');
    if (infoCandidate) {
      return { status: 'RESOLVED', scenarioId: infoCandidate.id, intent: infoCandidate.intent, scenario: infoCandidate };
    }

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

    const resolvedSlots: Record<string, any> = {};

    for (const [slotKey, extractor] of Object.entries(extractors)) {
      if (extractor.rules && Array.isArray(extractor.rules)) {
        for (const rule of extractor.rules) {
          if (new RegExp(rule.pattern, 'i').test(text)) {
            resolvedSlots[slotKey] = rule.value;
            break;
          }
        }
      } else if (extractor.type === 'enum') {
        if (extractor.patterns && Array.isArray(extractor.patterns)) {
          for (const pat of extractor.patterns) {
            const match = text.match(new RegExp(pat, 'i'));
            if (match) {
              resolvedSlots[slotKey] = 'CONFIRMED';
              break;
            }
          }
        } else if (extractor.mapping) {
          for (const [enumValue, synonyms] of Object.entries(extractor.mapping)) {
            if (synonyms.some(synonym => text.includes(synonym.toLowerCase()))) {
              resolvedSlots[slotKey] = enumValue;
              break;
            }
          }
        }
      } else if (extractor.type === 'integer' && extractor.pattern) {
        const match = text.match(new RegExp(extractor.pattern, 'i'));
        if (match) {
          resolvedSlots[slotKey] = parseInt(match[0], 10);
        }
      } else if (extractor.type === 'string' && extractor.pattern) {
        const match = text.match(new RegExp(extractor.pattern, 'i'));
        if (match) {
          resolvedSlots[slotKey] = match[0];
        }
      }
    }

    if (Object.keys(resolvedSlots).length === 0) {
      return { status: 'NO_MATCH' };
    }

    return { status: 'RESOLVED', slots: resolvedSlots };
  }

  // Pure generic evaluation of query/comparison descriptors (100% Domain-Agnostic)
  private evaluateScenarioQuery(sc: ScenarioDefinition, offers: any[], extractedIndex?: number): any {
    const attribute = sc.evaluation?.attribute || sc.query?.attribute;
    const mode = sc.evaluation?.order || sc.query?.mode || 'min';
    const template = sc.evaluation?.responseTemplate || sc.responseTemplate || '';

    // 1. Comparison queries
    if (sc.query || sc.evaluation?.kind === 'compare') {
      const attr = attribute as string;

      const validOffers = [...offers].filter(o => {
        if (o.status && o.status !== 'AVAILABLE') return false;
        const val = o[attr];
        if (val === null || val === undefined || val === '') return false;
        const num = Number(val);
        return !isNaN(num) && isFinite(num);
      });

      if (validOffers.length === 0) {
        return {
          status: 'INVALID_OFFER_DATA',
          intent: sc.intent,
          message: `Attribute "${attribute}" is missing or invalid in available candidate offers.`
        };
      }

      validOffers.sort((a, b) => {
        const valA = Number(a[attr]);
        const valB = Number(b[attr]);
        return mode === 'max' ? valB - valA : valA - valB;
      });

      const best = validOffers[0];
      let responseText = template;
      for (const [key, value] of Object.entries(best)) {
        responseText = responseText.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      }

      return {
        status: 'OFFER_COMPARISON_RESOLVED',
        intent: sc.intent,
        comparisonAttribute: (attribute || '').toUpperCase(),
        bestOfferId: best.offerId,
        [attribute || 'value']: best[attr],
        etaMinutes: best.etaMinutes,
        price: best.price,
        response: responseText
      };
    }

    // 2. Information questions on a specific candidate
    if (sc.evaluation?.kind === 'query_attribute') {
      const targetIndex = extractedIndex !== undefined ? extractedIndex : (sc.evaluation.targetIndex ?? 2);
      const target = offers.find(o => o.index === targetIndex);
      if (!target) return { status: 'NO_MATCH' };

      const distanceMeters = target.distanceKm ? Math.round(target.distanceKm * 1000) : 0;
      let responseText = template;
      for (const [key, value] of Object.entries(target)) {
        responseText = responseText.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      }
      responseText = responseText.replace(/{{distanceMeters}}/g, String(distanceMeters));

      return {
        status: 'OFFER_QUERY_RESOLVED',
        intent: sc.intent,
        offerId: target.offerId,
        attributes: { ...target, distanceMeters },
        response: responseText
      };
    }

    return { status: 'RESOLVED', intent: sc.intent, scenarioId: sc.id };
  }

  // Generic Candidate Resolver (Zero Domain-Specific Names)
  private resolveCandidatesFromExtracted(
    extractedSlots: Record<string, any>,
    candidates: any[],
    scenarioId: string,
    targetSlotName: string,
    ambiguityPrompt?: string
  ): {
    status: 'RESOLVED' | 'OFFER_UNAVAILABLE' | 'AMBIGUOUS_SLOT' | 'NO_MATCH';
    targetId?: string;
    targetItem?: any;
    candidates?: any[];
    prompt?: string;
  } {
    // Check if any extracted slot signals relative/ambiguous criteria (e.g. cheapest, fastest)
    const hasAmbiguousCriteria = Object.values(extractedSlots).some(
      v => typeof v === 'string' && (v === 'cheapest' || v === 'fastest' || v.includes('ambiguous'))
    );

    if (hasAmbiguousCriteria) {
      const available = candidates.filter(c => !c.status || c.status === 'AVAILABLE');
      if (available.length > 1) {
        return {
          status: 'AMBIGUOUS_SLOT',
          candidates: available.map(c => ({
            slotName: targetSlotName,
            value: c.offerId || c.id,
            scenarioId
          })),
          prompt: ambiguityPrompt || 'Выберите, пожалуйста, конкретный вариант'
        };
      }
    }

    let matched: any;

    // Match by numeric index or string property across candidate objects
    for (const val of Object.values(extractedSlots)) {
      if (typeof val === 'number') {
        matched = candidates.find(c => c.index === val);
        if (matched) break;
      } else if (typeof val === 'string' && val !== 'CONFIRMED' && val !== 'REJECTED') {
        const lowerVal = val.toLowerCase();
        matched = candidates.find(c =>
          Object.values(c).some(prop => typeof prop === 'string' && prop.toLowerCase() === lowerVal)
        );
        if (matched) break;
      }
    }

    if (!matched) {
      return { status: 'NO_MATCH' };
    }

    if (matched.status === 'UNAVAILABLE') {
      return { status: 'OFFER_UNAVAILABLE', targetId: matched.offerId || matched.id, targetItem: matched };
    }

    return { status: 'RESOLVED', targetId: matched.offerId || matched.id, targetItem: matched };
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

    // 2. Intent Resolution (Evaluation / Comparison Queries)
    const intentRes = this.resolveIntent(text);

    if (intentRes.status === 'RESOLVED') {
      const sc = intentRes.scenario;

      if (sc.query || sc.evaluation) {
        const activeWaiting = this.dialogueManager.listContexts(identity).filter(c => c.status === 'WAITING_FOR_SLOT');

        if (activeWaiting.length === 0) {
          return {
            status: 'CONTEXT_REQUIRED',
            message: 'No active offer context found for query'
          };
        }

        if (activeWaiting.length > 1) {
          return {
            status: 'AMBIGUOUS_CONTEXT',
            candidateContextIds: activeWaiting.map(c => c.contextId)
          };
        }

        const currentCtx = activeWaiting[0];
        if (!currentCtx.offers || currentCtx.offers.length === 0) {
          return { status: 'NO_MATCH' };
        }

        let extractedIdx: number | undefined;
        if (sc.slotExtractors) {
          const slotRes = this.extractSlotsDeterministically(text, sc.slotExtractors, sc.id);
          if (slotRes.status === 'RESOLVED') {
            const firstNumeric = Object.values(slotRes.slots).find(v => typeof v === 'number');
            if (typeof firstNumeric === 'number') {
              extractedIdx = firstNumeric;
            }
          }
        }

        return this.evaluateScenarioQuery(sc, currentCtx.offers, extractedIdx);
      }
    }

    // 3. Declarative Active Context Processing (Strictly Generic Slot Binding)
    const activeWaiting = this.dialogueManager.listContexts(identity).filter(c => c.status === 'WAITING_FOR_SLOT');

    if (activeWaiting.length === 1) {
      const activeCtx = activeWaiting[0];
      const scenario = (activeCtx.scenarioId ? this.scenarioRegistry.find(s => s.id === activeCtx.scenarioId) : undefined)
        || this.getDeterministicScenarioForIntent(activeCtx.intent);

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
          const extracted = slotRes.slots;

          // A. If context contains candidate collection (e.g. offers)
          if (activeCtx.offers && activeCtx.offers.length > 0) {
            const targetSlot = activeCtx.missingSlots.find(s => s !== 'confirmation') 
              || Object.keys(activeCtx.slots).find(s => s !== 'confirmation' && s !== 'orderId') 
              || 'selectedOfferId';

            const candidateResolution = this.resolveCandidatesFromExtracted(
              extracted,
              activeCtx.offers,
              scenario.id,
              targetSlot,
              scenario.ambiguityPrompt?.template
            );

            if (candidateResolution.status === 'AMBIGUOUS_SLOT') {
              return {
                status: 'AMBIGUOUS_SLOT',
                candidates: candidateResolution.candidates,
                clarificationPrompt: candidateResolution.prompt
              };
            }

            if (candidateResolution.status === 'OFFER_UNAVAILABLE') {
              return {
                status: 'OFFER_UNAVAILABLE',
                offerId: candidateResolution.targetId,
                message: `Предложение ${candidateResolution.targetId} более недоступно.`
              };
            }

            if (candidateResolution.status === 'RESOLVED' && candidateResolution.targetId) {
              const fillRes = await this.dialogueManager.fillSlot(targetSlot, candidateResolution.targetId, activeCtx.contextId, identity);
              if (fillRes.success) {
                return fillRes.data;
              }
            }
          }

          // B. Generic slot binding: any slot matching requiredSlots or existing context slots
          let updatedCtxState: any = null;
          for (const [slotKey, slotVal] of Object.entries(extracted)) {
            // Only fill if it is recognized in requiredSlots or current context slots (and not confirmation)
            if (slotKey !== 'confirmation' && (activeCtx.requiredSlots?.includes(slotKey) || activeCtx.slots[slotKey] !== undefined)) {
              const fillRes = await this.dialogueManager.fillSlot(slotKey, slotVal, activeCtx.contextId, identity);
              if (fillRes.success) {
                updatedCtxState = fillRes.data;
              }
            }
          }

          // C. Rejection: "confirmation" === "REJECTED"
          if (extracted.confirmation === 'REJECTED') {
            return {
              status: 'SELECTION_REJECTED',
              contextId: activeCtx.contextId,
              slots: this.dialogueManager.getContext(activeCtx.contextId, identity)?.slots,
              message: 'Выбор не подтвержден. Вы можете выбрать другой вариант.'
            };
          }

          // D. Confirmation: "confirmation" === "CONFIRMED"
          if (extracted.confirmation === 'CONFIRMED') {
            const currentCtx = this.dialogueManager.getContext(activeCtx.contextId, identity) || activeCtx;
            const remainingNonConfirm = currentCtx.missingSlots.filter(s => s !== 'confirmation');

            if (remainingNonConfirm.length === 0) {
              const fillRes = await this.dialogueManager.fillSlot('confirmation', 'CONFIRMED', currentCtx.contextId, identity);
              if (fillRes.success) {
                const updated = fillRes.data;
                const exec = this.dialogueManager.createExecution(updated, identity);
                const dispatchRes = await this.dialogueManager.dispatchAction(exec.executionId, updated.slots, identity);
                return {
                  status: dispatchRes.status,
                  contextId: updated.contextId,
                  executionId: exec.executionId,
                  attempt: dispatchRes.attempt,
                  context: this.dialogueManager.getContext(updated.contextId, identity)
                };
              }
            }
          }

          return updatedCtxState || this.dialogueManager.getContext(activeCtx.contextId, identity);
        }
      }
    } else if (activeWaiting.length > 1) {
      const anyScenario = this.scenarioRegistry.find(s => s.slotExtractors);
      if (anyScenario?.slotExtractors) {
        const testSlot = this.extractSlotsDeterministically(text, anyScenario.slotExtractors, anyScenario.id);
        if (testSlot.status === 'RESOLVED') {
          const hasCandidateSlot = Object.values(testSlot.slots).some(v => typeof v === 'number' || v === 'cheapest' || v === 'fastest');
          if (hasCandidateSlot) {
            return {
              status: 'AMBIGUOUS_CONTEXT',
              candidateContextIds: activeWaiting.map(c => c.contextId)
            };
          }
        }
      }
    }

    // 4. Initial Context Creation from Scenario
    if (intentRes.status === 'RESOLVED') {
      const sc = intentRes.scenario;
      const emitStep = sc.steps?.find(st => st.kind === 'emit');
      const actionType = emitStep?.event?.type || `${sc.intent.toLowerCase()}.action`;
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
        sc.id
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

    return { status: 'NO_MATCH' };
  }
}
