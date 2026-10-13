import {
  DialogueStateManager,
  type ActionDispatcher,
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

export interface CandidateBindingDefinition {
  targetSlot?: string;
  idField?: string;
  labelField?: string;
  indexField?: string;
  statusField?: string;
  unavailableValue?: string;
  unavailableTemplate?: string;
  ambiguityTriggerValues?: string[];
}

export interface ConfirmationDefinition {
  slot: string;
  confirmedValue: string;
  confirmedStatus?: string;
  rejectedValue: string;
  confirmLabel?: string;
  rejectLabel?: string;
  confirmedMessage?: string;
  cancelledMessage?: string;
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
  expectedPhrase?: string;
  requiredSlots?: string[];
  slotExtractors?: Record<string, SlotExtractorDefinition>;
  candidateBinding?: CandidateBindingDefinition;
  confirmation?: ConfirmationDefinition;
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

export type CandidateItem = Record<string, unknown>;

export type CandidateResolutionResult =
  | { status: 'RESOLVED'; targetId: string; targetItem: CandidateItem }
  | { status: 'CANDIDATE_UNAVAILABLE'; targetId: string; targetItem: CandidateItem; message: string }
  | { status: 'AMBIGUOUS_SLOT'; candidates: Array<{ slotName: string; value: any; scenarioId: string }>; clarificationPrompt?: string }
  | { status: 'NO_MATCH' };

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
  private selectedContextBySession: Map<string, string> = new Map();

  constructor(dialogueManager: DialogueStateManager) {
    this.dialogueManager = dialogueManager;
  }

  public registerScenarioSet(scenarioSet: ScenarioSet): void {
    if (!scenarioSet || !Array.isArray(scenarioSet.scenarios)) {
      throw new Error('CONTRACT_VIOLATION: Invalid ScenarioSet structure');
    }
    const inferredIntentByEvent: Record<string, string> = {
      'driver.order.accepted': 'ACCEPT_ORDER', 'driver.arrived': 'DRIVER_ARRIVED',
      'driver.trip.started': 'START_TRIP', 'driver.trip.finished': 'FINISH_TRIP',
      'driver.available': 'DRIVER_AVAILABLE', 'order.accepted': 'ACCEPT_ORDER',
      'order.dispatch.completed': 'ORDER_DISPATCH', 'order.payment.completed': 'ORDER_PAYMENT',
      'order.standard.created': 'ORDER_STANDARD', 'order.express.created': 'ORDER_EXPRESS',
      'nanny.order.confirmed': 'NANNY_ORDER_CONFIRMED', 'passenger.order.created': 'PASSENGER_ORDER_CREATED'
    };
    scenarioSet = { ...scenarioSet, scenarios: scenarioSet.scenarios.map((scenario: any) => {
      const eventType = scenario.steps?.find((step: any) => step.kind === 'emit' && step.event?.type)?.event?.type;
      const actionName = scenario.steps?.find((step: any) => step.kind === 'emit' && step.event?.payload?.action)?.event?.payload?.action;
      const intent = scenario.intent || inferredIntentByEvent[eventType] || actionName;
      if (!intent) throw new Error('CONTRACT_VIOLATION: Scenario "' + scenario.id + '" missing intent and no supported event can infer it');
      return { ...scenario, intent };
    }) };

    const seenIds = new Set<string>();
    const triggerOwners = new Map<string, Array<{ scenarioId: string; priority: number }>>();
    const normalizeTrigger = (value: string): string =>
      value.replace(/^voice\./i, '').replace(/[-_]/g, ' ').trim().toLowerCase().replace(/\s+/g, ' ');

    const validateTrigger = (value: string, scenarioId: string, priority = 0): void => {
      const normalized = normalizeTrigger(value);
      if (!normalized) return;
      const owners = triggerOwners.get(normalized) || [];
      const conflict = owners.find(owner => owner.scenarioId !== scenarioId && owner.priority === priority);
      if (conflict) {
        throw new Error(`CONTRACT_VIOLATION: Trigger or alias collision "${normalized}" between "${conflict.scenarioId}" and "${scenarioId}"`);
      }
      if (!owners.some(owner => owner.scenarioId === scenarioId)) {
        owners.push({ scenarioId, priority });
      }
      triggerOwners.set(normalized, owners);
    };

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
      if (sc.priority !== undefined && !Number.isFinite(sc.priority)) {
        throw new Error(`CONTRACT_VIOLATION: invalid priority for scenario "${sc.id}"`);
      }

      const triggers = [
        ...(sc.activation?.value ? [sc.activation.value] : []),
        ...(sc.triggerPhrases || []),
        ...(sc.aliases || []),
        ...(sc.expectedPhrase ? [sc.expectedPhrase] : [])
      ];
      for (const trigger of triggers) validateTrigger(trigger, sc.id, sc.priority ?? 0);
    }

    this.scenarioRegistry = [
      ...this.scenarioRegistry.filter(existing => !scenarioSet.scenarios.some(incoming => incoming.id === existing.id)),
      ...scenarioSet.scenarios
    ];
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
    const textWords = new Set(text.replace(/[-_]/g, ' ').split(/[^\p{L}\p{N}]+/u).filter(Boolean));
    const matchingScenarios: ScenarioDefinition[] = [];

    for (const sc of this.scenarioRegistry) {
      const triggers: string[] = [];
      if (sc.activation?.value) triggers.push(sc.activation.value);
      if (Array.isArray(sc.triggerPhrases)) triggers.push(...sc.triggerPhrases);
      if (Array.isArray(sc.aliases)) triggers.push(...sc.aliases);
      if (sc.expectedPhrase) triggers.push(sc.expectedPhrase);

      const matches = triggers.some(trig => {
        const clean = trig.replace(/^voice\./, '').replace(/[-_]/g, ' ').toLowerCase().trim();
        const phraseWords = text.replace(/[-_]/g, ' ').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
        const triggerWords = clean.split(/\s+/).filter(Boolean);
        const containsTrigger = triggerWords.some((_, start) =>
          triggerWords.every((word, offset) => phraseWords[start + offset] === word)
        );
        const phraseIsTriggerPrefix = phraseWords.length > 0
          && phraseWords.length < triggerWords.length
          && phraseWords.every((word, index) => triggerWords[index] === word);
        return containsTrigger || phraseIsTriggerPrefix;
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
    const patternMatches: Array<{ slotName: string; value: string; priority: number; matchedText: string }> = [];
    const unpatternedStringSlots: Array<{ slotName: string; priority: number }> = [];
    const unicodeWordBoundary = '(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))';
    const compilePattern = (pattern: string): RegExp =>
      new RegExp(pattern.replace(/\\b/g, unicodeWordBoundary), 'iu');

    for (const [slotKey, extractor] of Object.entries(extractors)) {
      if (extractor.rules && Array.isArray(extractor.rules)) {
        for (const rule of extractor.rules) {
          if (compilePattern(rule.pattern).test(text)) {
            resolvedSlots[slotKey] = rule.value;
            break;
          }
        }
      } else if (extractor.type === 'enum') {
        if (extractor.patterns && Array.isArray(extractor.patterns)) {
          for (const pat of extractor.patterns) {
            const match = text.match(compilePattern(pat));
            if (match) {
              resolvedSlots[slotKey] = 'CONFIRMED';
              break;
            }
          }
        } else if (extractor.mapping) {
          const matchingValues = Object.entries(extractor.mapping)
            .filter(([, synonyms]) => synonyms.some(synonym => text.includes(synonym.toLowerCase())))
            .map(([enumValue]) => enumValue);

          if (matchingValues.length > 1) {
            return {
              status: 'AMBIGUOUS_SLOT',
              candidates: matchingValues.map(value => ({ slotName: slotKey, value, scenarioId })),
              clarificationPrompt: ambiguityPromptTemplate
            };
          }

          if (matchingValues.length === 1) {
            resolvedSlots[slotKey] = matchingValues[0];
          }
        }
      } else if (extractor.type === 'integer' && extractor.pattern) {
        const match = text.match(compilePattern(extractor.pattern));
        if (match) {
          resolvedSlots[slotKey] = parseInt(match[0], 10);
        }
      } else if (extractor.type === 'string') {
        const priority = Number.isFinite(extractor.priority) ? extractor.priority as number : 0;
        if (extractor.pattern) {
          const match = text.match(compilePattern(extractor.pattern));
          if (match) {
            patternMatches.push({
              slotName: slotKey,
              value: match[0],
              matchedText: match[0].toLowerCase(),
              priority
            });
          }
        } else {
          // Legacy free-text slots consume only content left after removing
          // this scenario's trigger and values parsed by typed extractors.
          unpatternedStringSlots.push({ slotName: slotKey, priority });
        }
      }
    }

    if (unpatternedStringSlots.length > 0) {
      let residual = text.toLowerCase();
      const scenario = this.scenarioRegistry.find(candidate => candidate.id === scenarioId);
      const triggers = scenario ? [
        ...(scenario.activation?.value ? [scenario.activation.value] : []),
        ...(scenario.triggerPhrases || []),
        ...(scenario.aliases || []),
        ...(scenario.expectedPhrase ? [scenario.expectedPhrase] : [])
      ] : [];
      for (const trigger of triggers.sort((a, b) => b.length - a.length)) {
        const clean = trigger.replace(/^voice\\./i, '').replace(/[-_]/g, ' ').trim().toLowerCase();
        if (clean) residual = residual.replaceAll(clean, ' ');
      }
      for (const value of Object.values(resolvedSlots)) {
        if (value !== undefined && value !== null && String(value)) {
          residual = residual.replaceAll(String(value).toLowerCase(), ' ');
        }
      }
      for (const [slotKey, extractor] of Object.entries(extractors)) {
        if (resolvedSlots[slotKey] === undefined || !extractor.mapping) continue;
        for (const synonyms of Object.values(extractor.mapping)) {
          for (const synonym of synonyms) {
            if (synonym) residual = residual.replaceAll(synonym.toLowerCase(), ' ');
          }
        }
      }
      residual = residual.replace(/[\\p{P}\\p{S}]+/gu, ' ').replace(/\\s+/g, ' ').trim();
      if (residual) {
        for (const slot of unpatternedStringSlots) {
          patternMatches.push({
            slotName: slot.slotName,
            value: residual,
            matchedText: residual,
            priority: slot.priority
          });
        }
      }
    }

    const matchesByText = new Map<string, typeof patternMatches>();
    for (const match of patternMatches) {
      const group = matchesByText.get(match.matchedText) || [];
      group.push(match);
      matchesByText.set(match.matchedText, group);
    }
    for (const group of matchesByText.values()) {
      const maxPriority = Math.max(...group.map(match => match.priority));
      const highest = group.filter(match => match.priority === maxPriority);
      if (highest.length > 1) {
        return {
          status: 'AMBIGUOUS_SLOT',
          candidates: highest.map(match => ({
            slotName: match.slotName,
            value: match.value,
            scenarioId
          })),
          clarificationPrompt: ambiguityPromptTemplate
        };
      }
      resolvedSlots[highest[0].slotName] = highest[0].value;
    }

    if (Object.keys(resolvedSlots).length === 0) {
      return { status: 'NO_MATCH' };
    }

    return { status: 'RESOLVED', slots: resolvedSlots };
  }

  // Pure generic evaluation of query/comparison descriptors (100% Domain-Agnostic)
  private evaluateScenarioQuery(sc: ScenarioDefinition, candidates: CandidateItem[], extractedIndex?: number): any {
    const attribute = sc.evaluation?.attribute || sc.query?.attribute;
    const mode = sc.evaluation?.order || sc.query?.mode || 'min';
    const template = sc.evaluation?.responseTemplate || sc.responseTemplate || '';

    // 1. Comparison queries
    if (sc.query || sc.evaluation?.kind === 'compare') {
      const attr = attribute as string;

      const validItems = [...candidates].filter(o => {
        if (o.status && o.status !== 'AVAILABLE') return false;
        const val = o[attr];
        if (val === null || val === undefined || val === '') return false;
        const num = Number(val);
        return !isNaN(num) && isFinite(num);
      });

      if (validItems.length === 0) {
        return {
          status: 'INVALID_OFFER_DATA',
          intent: sc.intent,
          message: `Attribute "${attribute}" is missing or invalid in available candidate offers.`
        };
      }

      validItems.sort((a, b) => {
        const valA = Number(a[attr]);
        const valB = Number(b[attr]);
        return mode === 'max' ? valB - valA : valA - valB;
      });

      const best = validItems[0];
      let responseText = template;
      for (const [key, value] of Object.entries(best)) {
        responseText = responseText.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      }

      const idField = sc.candidateBinding?.idField || Object.keys(best).find(k => k.endsWith('Id') || k === 'id') || 'id';
      const bestId = String(best[idField] ?? '');

      return {
        status: 'OFFER_COMPARISON_RESOLVED',
        intent: sc.intent,
        comparisonAttribute: (attribute || '').toUpperCase(),
        bestOfferId: bestId,
        [attribute || 'value']: best[attr],
        etaMinutes: best.etaMinutes,
        price: best.price,
        response: responseText
      };
    }

    // 2. Information questions on a specific candidate
    if (sc.evaluation?.kind === 'query_attribute') {
      const indexField = sc.candidateBinding?.indexField || 'index';
      const targetIndex = extractedIndex !== undefined ? extractedIndex : (sc.evaluation.targetIndex ?? 2);
      const target = candidates.find(o => o[indexField] === targetIndex);
      if (!target) return { status: 'NO_MATCH' };

      const distanceKm = typeof target.distanceKm === 'number' ? target.distanceKm : 0;
      const distanceMeters = distanceKm ? Math.round(distanceKm * 1000) : 0;
      let responseText = template;
      for (const [key, value] of Object.entries(target)) {
        responseText = responseText.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      }
      responseText = responseText.replace(/{{distanceMeters}}/g, String(distanceMeters));

      const idField = sc.candidateBinding?.idField || Object.keys(target).find(k => k.endsWith('Id') || k === 'id') || 'id';
      const targetId = String(target[idField] ?? '');

      return {
        status: 'OFFER_QUERY_RESOLVED',
        intent: sc.intent,
        offerId: targetId,
        attributes: { ...target, distanceMeters },
        response: responseText
      };
    }

    return { status: 'RESOLVED', intent: sc.intent, scenarioId: sc.id };
  }

  // Pure Generic Candidate Resolution (Zero Domain-Specific Terms)
  public resolveCandidate(
    extractedSlots: Record<string, unknown>,
    candidates: CandidateItem[],
    binding: CandidateBindingDefinition | undefined,
    scenarioId: string,
    targetSlotName: string,
    ambiguityPrompt?: string
  ): CandidateResolutionResult {
    const idKey = binding?.idField || (candidates.length > 0 ? Object.keys(candidates[0]).find(k => k.endsWith('Id') || k === 'id') : undefined) || 'id';
    const indexKey = binding?.indexField || 'index';
    const statusKey = binding?.statusField || 'status';
    const unavailableVal = binding?.unavailableValue || 'UNAVAILABLE';
    const unavailTemplate = binding?.unavailableTemplate;
    const ambiguityTriggers = binding?.ambiguityTriggerValues || [];

    const hasAmbiguousCriteria = Object.values(extractedSlots).some(
      v => typeof v === 'string' && (ambiguityTriggers.includes(v) || v.toLowerCase().includes('ambiguous'))
    );

    if (hasAmbiguousCriteria) {
      const available = candidates.filter(c => c[statusKey] === undefined || c[statusKey] !== unavailableVal);
      if (available.length > 1) {
        return {
          status: 'AMBIGUOUS_SLOT',
          candidates: available.map(c => ({
            slotName: targetSlotName,
            value: String(c[idKey] ?? ''),
            scenarioId
          })),
          clarificationPrompt: ambiguityPrompt || 'Выберите, пожалуйста, конкретный вариант'
        };
      }
    }

    let matchedItem: CandidateItem | undefined;

    for (const val of Object.values(extractedSlots)) {
      if (typeof val === 'number') {
        matchedItem = candidates.find(c => c[indexKey] === val);
        if (matchedItem) break;
      } else if (typeof val === 'string' && val !== 'CONFIRMED' && val !== 'REJECTED') {
        const lowerVal = val.toLowerCase();
        matchedItem = candidates.find(c =>
          Object.values(c).some(prop => typeof prop === 'string' && prop.toLowerCase() === lowerVal)
        );
        if (matchedItem) break;
      }
    }

    if (!matchedItem) {
      return { status: 'NO_MATCH' };
    }

    const resolvedId = String(matchedItem[idKey] ?? '');

    if (matchedItem[statusKey] !== undefined && matchedItem[statusKey] === unavailableVal) {
      let unavailMsg = unavailTemplate || `Вариант ${resolvedId} более недоступен.`;
      unavailMsg = unavailMsg.replace(/{{targetId}}/g, resolvedId);

      return {
        status: 'CANDIDATE_UNAVAILABLE',
        targetId: resolvedId,
        targetItem: matchedItem,
        message: unavailMsg
      };
    }

    return {
      status: 'RESOLVED',
      targetId: resolvedId,
      targetItem: matchedItem
    };
  }

  public async handleIncomingVoice(phrase: string, identity: SessionIdentity): Promise<any> {
    if (!identity || !identity.ownerId || !identity.sessionId) {
      throw new Error('CONTRACT_VIOLATION: SessionIdentity is strictly required for handleIncomingVoice');
    }

    const text = phrase.trim().toLowerCase();
    const tokens = text.split(/\s+/);
    const selectionKey = identity.ownerId + ':' + identity.sessionId;

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
        this.selectedContextBySession.delete(selectionKey);
        return this.dialogueManager.cancelContext(routeResult.contextId, identity);
      }
      if (routeResult.status === 'CONTEXT_ACCESS_DENIED') return routeResult;
      return { status: 'NO_MATCH' };
    }

    // Enforce ownership before intent resolution: explicit entity references
    // must not create a new context or execute against another session's order.
    const ownershipRoute = this.dialogueManager.resolveRouting(text, [], identity);
    if (ownershipRoute.status === 'CONTEXT_ACCESS_DENIED') return ownershipRoute;

    // 2. Intent Resolution (Evaluation / Comparison Queries)
    const intentRes = this.resolveIntent(text);

    if (intentRes.status === 'RESOLVED') {
      const sc = intentRes.scenario;

      const phraseWords = text.split(/[^\p{L}\p{N}_-]+/u).filter(Boolean);
      const queryTriggers = [
        ...(sc.activation?.value ? [sc.activation.value] : []),
        ...(sc.triggerPhrases || []),
        ...(sc.aliases || []),
        ...(sc.expectedPhrase ? [sc.expectedPhrase] : [])
      ];
      const isExplicitQuery = queryTriggers.some(trigger => {
        const clean = trigger.replace(/^voice\./i, '').replace(/[-_]/g, ' ').toLowerCase().trim();
        const triggerWords = clean.split(/\s+/).filter(Boolean);
        return triggerWords.length > 0 && triggerWords.some((_, start) =>
          triggerWords.every((word, offset) => phraseWords[start + offset] === word)
        );
      });

      if ((sc.query || sc.evaluation) && isExplicitQuery) {
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

        return this.evaluateScenarioQuery(sc, currentCtx.offers as unknown as CandidateItem[], extractedIdx);
      }
    }

    if (intentRes.status === 'AMBIGUOUS_INTENT') {
      return intentRes;
    }

    if (intentRes.status === 'RESOLVED') {
      const waiting = this.dialogueManager.listContexts(identity).filter(c => c.status === 'WAITING_FOR_SLOT');
      if (waiting.length > 0 && !waiting.some(c => c.intent === intentRes.intent) && !waiting.some(c => c.offers && c.offers.length > 0)) {
        const sc = intentRes.scenario;
        const slotRes = this.extractSlotsDeterministically(text, sc.slotExtractors, sc.id, sc.ambiguityPrompt?.template);
        if (slotRes.status === 'AMBIGUOUS_SLOT') return slotRes;
        const slots = slotRes.status === 'RESOLVED' ? slotRes.slots : {};
        const firstEmit = sc.steps?.find(step => step.kind === 'emit');
        const ctx = this.dialogueManager.createContext(sc.intent, slots, sc.requiredSlots || [], firstEmit?.event?.type || (sc.intent.toLowerCase() + '.action'), sc.clarificationPrompts || {}, identity, sc.id);
        if (ctx.missingSlots.length === 0) {
          const execution = this.dialogueManager.createExecution(ctx, identity);
          const result = await this.dialogueManager.dispatchAction(execution.executionId, ctx.slots, identity);
          return { status: result.status === 'SUCCEEDED' ? 'COMPLETED' : result.status, intent: ctx.intent, contextId: ctx.contextId, executionId: execution.executionId, attempt: result.attempt, slots: ctx.slots, context: this.dialogueManager.getContext(ctx.contextId, identity) };
        }
        return ctx;
      }
    }

    // A repeated explicit order command with a different entity starts a separate context.
    // Do not overwrite the orderId in an already-open order when the user names another order.
    if (intentRes.status === 'RESOLVED' && !intentRes.scenario.query && !intentRes.scenario.evaluation) {
      const sc = intentRes.scenario;
      const slotRes = this.extractSlotsDeterministically(text, sc.slotExtractors, sc.id, sc.ambiguityPrompt?.template);
      const initialSlots = slotRes.status === 'RESOLVED' ? slotRes.slots : {};
      const activeForScenario = this.dialogueManager.listContexts(identity).filter(
        c => c.status === 'WAITING_FOR_SLOT' && c.scenarioId === sc.id
      );
      const isCandidateSelection = !!sc.candidateBinding?.targetSlot
        && initialSlots[sc.candidateBinding.targetSlot] !== undefined;
      const startsDistinctInstance = !isCandidateSelection && activeForScenario.some(ctx =>
        Object.entries(initialSlots).some(([key, value]) =>
          ctx.slots[key] !== undefined && ctx.slots[key] !== value
        )
      );
      if (startsDistinctInstance) {
        const emitStep = sc.steps?.find(st => st.kind === 'emit');
        return this.dialogueManager.createContext(
          sc.intent,
          initialSlots,
          sc.requiredSlots || [],
          emitStep?.event?.type || `${sc.intent.toLowerCase()}.action`,
          sc.clarificationPrompts || {},
          identity,
          sc.id
        );
      }
    }

    // 3. Declarative Active Context Processing
    let activeWaiting = this.dialogueManager.listContexts(identity).filter(c => c.status === 'WAITING_FOR_SLOT');

    if (activeWaiting.length > 1) {
      const explicitRoute = this.dialogueManager.resolveRouting(text, [], identity);
      if (explicitRoute.status === 'RESOLVED') {
        activeWaiting = activeWaiting.filter(ctx => ctx.contextId === explicitRoute.contextId);
        this.selectedContextBySession.set(selectionKey, explicitRoute.contextId);
      } else {
        const selectedId = this.selectedContextBySession.get(selectionKey);
        const selected = activeWaiting.find(ctx => ctx.contextId === selectedId);
        if (selected) activeWaiting = [selected];
        else this.selectedContextBySession.delete(selectionKey);
      }

      const matchingContexts = activeWaiting.map(ctx => {
        const scenario = (ctx.scenarioId ? this.scenarioRegistry.find(s => s.id === ctx.scenarioId) : undefined)
          || this.getDeterministicScenarioForIntent(ctx.intent);
        if (!scenario?.slotExtractors) return null;
        const extracted = this.extractSlotsDeterministically(
          text,
          scenario.slotExtractors,
          scenario.id,
          scenario.ambiguityPrompt?.template
        );
        if (extracted.status !== 'RESOLVED') return null;
        const relevantSlots = Object.entries(extracted.slots).filter(([key]) =>
          ctx.missingSlots.includes(key) || ctx.slots[key] !== undefined
        );
        return relevantSlots.length > 0 ? { ctx, scenario, slots: relevantSlots } : null;
      }).filter((item): item is { ctx: DialogueContext; scenario: ScenarioDefinition; slots: [string, any][] } => item !== null);

      if (matchingContexts.length > 1) {
        const slotNames = matchingContexts.flatMap(item => item.slots.map(([key]) => key));
        const uniqueSlotNames = new Set(slotNames);
        if (uniqueSlotNames.size > 1) {
          return {
            status: 'AMBIGUOUS_SLOT',
            candidates: matchingContexts.flatMap(item => item.slots.map(([slotName, value]) => ({
              slotName,
              value,
              scenarioId: item.scenario.id
            }))),
            clarificationPrompt: matchingContexts.find(item => item.scenario.ambiguityPrompt?.template)?.scenario.ambiguityPrompt?.template
          };
        }
        const promptScenario = matchingContexts.find(item => item.scenario.ambiguityPrompt?.template)?.scenario;
        const candidateEntities = matchingContexts
          .map(item => Object.values(item.ctx.slots).filter(value => value !== undefined && value !== null).join(' '))
          .filter(Boolean)
          .join(', ');
        const clarificationPrompt = promptScenario?.ambiguityPrompt?.template
          ?.replaceAll('{candidateEntities}', candidateEntities);
        return {
          status: 'AMBIGUOUS_CONTEXT',
          candidateContextIds: matchingContexts.map(item => item.ctx.contextId),
          clarificationPrompt
        };
      }

      if (matchingContexts.length === 1) {
        activeWaiting = [matchingContexts[0].ctx];
      }
    }

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

          if (activeCtx.offers && activeCtx.offers.length > 0) {
            const targetSlot = scenario.candidateBinding?.targetSlot
              || activeCtx.missingSlots.find(s => s !== 'confirmation') 
              || activeCtx.requiredSlots?.find(s => s !== 'confirmation');

            if (targetSlot) {
              const candidateResolution = this.resolveCandidate(
                extracted,
                activeCtx.offers as unknown as CandidateItem[],
                scenario.candidateBinding,
                scenario.id,
                targetSlot,
                scenario.ambiguityPrompt?.template
              );

              if (candidateResolution.status === 'AMBIGUOUS_SLOT') {
                return {
                  status: 'AMBIGUOUS_SLOT',
                  candidates: candidateResolution.candidates,
                  clarificationPrompt: candidateResolution.clarificationPrompt
                };
              }

              if (candidateResolution.status === 'CANDIDATE_UNAVAILABLE') {
                return {
                  status: 'CANDIDATE_UNAVAILABLE',
                  targetId: candidateResolution.targetId,
                  offerId: candidateResolution.targetId,
                  message: candidateResolution.message
                };
              }

              if (candidateResolution.status === 'RESOLVED' && candidateResolution.targetId) {
                const fillRes = await this.dialogueManager.fillSlot(targetSlot, candidateResolution.targetId, activeCtx.contextId, identity);
                if (fillRes.success) {
                  return fillRes.data;
                }
              }
            }
          }

          let updatedCtxState: any = null;
          for (const [slotKey, slotVal] of Object.entries(extracted)) {
            if (slotKey !== 'confirmation' && (activeCtx.missingSlots.includes(slotKey) || activeCtx.slots[slotKey] !== undefined)) {
              const fillRes = await this.dialogueManager.fillSlot(slotKey, slotVal, activeCtx.contextId, identity);
              if (fillRes.success) {
                updatedCtxState = fillRes.data;
              }
            }
          }

          if (extracted.confirmation === 'REJECTED') {
            return {
              status: 'SELECTION_REJECTED',
              contextId: activeCtx.contextId,
              slots: this.dialogueManager.getContext(activeCtx.contextId, identity)?.slots,
              message: 'Выбор не подтвержден. Вы можете выбрать другой вариант.'
            };
          }

          const latestCtx = this.dialogueManager.getContext(activeCtx.contextId, identity) || activeCtx;
          if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(latestCtx.status)) return latestCtx;
          if (latestCtx.missingSlots.length === 0 && !scenario.confirmation) {
            let exec: any;
            try {
              exec = this.dialogueManager.createExecution(latestCtx, identity);
            } catch (error) {
              const current = this.dialogueManager.getContext(latestCtx.contextId, identity);
              if (current && ['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(current.status)) return current;
              throw error;
            }
            const dispatchRes = await this.dialogueManager.dispatchAction(exec.executionId, latestCtx.slots, identity);
            return {
              status: dispatchRes.status === 'SUCCEEDED' ? 'COMPLETED' : dispatchRes.status,
              intent: latestCtx.intent,
              contextId: latestCtx.contextId,
              executionId: exec.executionId,
              attempt: dispatchRes.attempt,
              slots: latestCtx.slots,
              context: this.dialogueManager.getContext(latestCtx.contextId, identity)
            };
          }

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
                  status: dispatchRes.status === 'SUCCEEDED' ? 'COMPLETED' : dispatchRes.status,
                  intent: updated.intent,
                  contextId: updated.contextId,
                  executionId: exec.executionId,
                  attempt: dispatchRes.attempt,
                  slots: updated.slots,
                  context: this.dialogueManager.getContext(updated.contextId, identity)
                };
              }
            }
          }

          const refreshed = this.dialogueManager.getContext(activeCtx.contextId, identity) || activeCtx;
          if (['COMPLETED', 'CANCELLED', 'EXPIRED'].includes(refreshed.status)) return refreshed;
          return updatedCtxState || refreshed;
        }
      }
    }

    // 4. Initial Context Creation
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
          status: dispatchRes.status === 'SUCCEEDED' ? 'COMPLETED' : dispatchRes.status,
          intent: ctx.intent,
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

    const routingResult = this.dialogueManager.resolveRouting(text, [], identity);
    if (routingResult.status === 'CONTEXT_ACCESS_DENIED') return routingResult;
    return { status: 'NO_MATCH' };
  }

  public getScenarioById(id: string): ScenarioDefinition | undefined {
      return this.scenarioRegistry.find(s => s.id === id);
    }
  
    public getScenarioRegistry(): ScenarioDefinition[] {
      return [...this.scenarioRegistry];
    }
}
