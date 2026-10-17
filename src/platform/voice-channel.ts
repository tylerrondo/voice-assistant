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

  constructor(dialogueManager: DialogueStateManager) {
    this.dialogueManager = dialogueManager;
  }

  public registerScenarioSet(scenarioSet: ScenarioSet): void {
    if (!scenarioSet || !Array.isArray(scenarioSet.scenarios)) {
      throw new Error('CONTRACT_VIOLATION: Invalid ScenarioSet structure');
    }

    const seenIds = new Set<string>();
    const seenTriggers = new Map<string, string>();

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

      // Activation keys and aliases must be unique; triggerPhrases may intentionally
      // overlap to express ambiguity resolved by priority or clarification.
      const triggers = [
        sc.activation?.value,
        ...(Array.isArray(sc.aliases) ? sc.aliases : [])
      ].filter((trigger): trigger is string => typeof trigger === 'string' && trigger.trim().length > 0);

      for (const trigger of triggers) {
        const normalized = trigger.replace(/^voice\./, '').replace(/[-_]/g, ' ').toLowerCase().trim().replace(/\s+/g, ' ');
        const previousScenario = seenTriggers.get(normalized);
        if (previousScenario && previousScenario !== sc.id) {
          throw new Error(`CONTRACT_VIOLATION: Trigger or alias collision "${normalized}" between scenarios "${previousScenario}" and "${sc.id}"`);
        }
        seenTriggers.set(normalized, sc.id);
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
    const strongMatchingScenarios: ScenarioDefinition[] = [];

    for (const sc of this.scenarioRegistry) {
      const triggers: string[] = [];
      if (sc.activation?.value) triggers.push(sc.activation.value);
      if (Array.isArray(sc.triggerPhrases)) triggers.push(...sc.triggerPhrases);
      if (Array.isArray(sc.aliases)) triggers.push(...sc.aliases);

      const isStrongMatch = triggers.some(trig => {
        const clean = trig.replace(/^voice\./, '').replace(/[-_]/g, ' ').toLowerCase().trim();
        return text === clean || text.startsWith(clean) || clean.split(/\s+/).every(w => text.includes(w));
      });
      const isPrefixOnlyMatch = triggers.some(trig => {
        const clean = trig.replace(/^voice\./, '').replace(/[-_]/g, ' ').toLowerCase().trim();
        return clean.startsWith(`${text} `);
      });

      if (isStrongMatch) {
        matchingScenarios.push(sc);
        strongMatchingScenarios.push(sc);
      } else if (isPrefixOnlyMatch) {
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

    const infoCandidate = highestCandidates.find(
      s => s.evaluation?.kind === 'query_attribute' && strongMatchingScenarios.includes(s)
    );
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
    const matchedTextBySlot: Record<string, string> = {};

    for (const [slotKey, extractor] of Object.entries(extractors)) {
      if (extractor.rules && Array.isArray(extractor.rules)) {
        for (const rule of extractor.rules) {
          // JavaScript word boundaries do not treat Cyrillic letters as word characters.
          // Convert each boundary in alternations to Unicode-aware letter/number boundaries.
          const unicodePattern = rule.pattern.replace(/\\b/g, (_boundary, offset, pattern) => {
            const previous = pattern[offset - 1];
            return previous === undefined || previous === '|' || previous === '('
              ? '(?<![\\p{L}\\p{N}_])'
              : '(?=$|[^\\p{L}\\p{N}_])';
          });
          const match = text.match(new RegExp(unicodePattern, 'iu'));
          if (match) {
            resolvedSlots[slotKey] = rule.value;
            matchedTextBySlot[slotKey] = match[0].toLowerCase();
            break;
          }
        }
      } else if (extractor.type === 'enum') {
        if (extractor.patterns && Array.isArray(extractor.patterns)) {
          for (const pat of extractor.patterns) {
            const match = text.match(new RegExp(pat, 'i'));
            if (match) {
              resolvedSlots[slotKey] = 'CONFIRMED';
              matchedTextBySlot[slotKey] = match[0].toLowerCase();
              break;
            }
          }
        } else if (extractor.mapping) {
          const enumMatches = Object.entries(extractor.mapping)
            .map(([enumValue, synonyms]) => {
              const synonym = synonyms
                .filter(item => text.includes(item.toLowerCase()))
                .sort((a, b) => b.length - a.length)[0];
              return synonym ? { value: enumValue, synonym } : undefined;
            })
            .filter((item): item is { value: string; synonym: string } => Boolean(item));

          if (enumMatches.length > 0) {
            const longestLength = Math.max(...enumMatches.map(item => item.synonym.length));
            const bestMatches = enumMatches.filter(item => item.synonym.length === longestLength);
            const samePhraseConflict = bestMatches.length > 1
              && bestMatches.every(item => item.synonym.toLowerCase() === bestMatches[0].synonym.toLowerCase());

            if (samePhraseConflict) {
              return {
                status: 'AMBIGUOUS_SLOT',
                candidates: bestMatches.map(item => ({
                  slotName: slotKey,
                  value: item.value,
                  scenarioId
                })),
                clarificationPrompt: ambiguityPromptTemplate
              };
            }

            resolvedSlots[slotKey] = bestMatches[0].value;
            matchedTextBySlot[slotKey] = bestMatches[0].synonym.toLowerCase();
          }
        }
      } else if (extractor.type === 'integer' && extractor.pattern) {
        const match = text.match(new RegExp(extractor.pattern, 'i'));
        if (match) {
          resolvedSlots[slotKey] = parseInt(match[0], 10);
          matchedTextBySlot[slotKey] = match[0].toLowerCase();
        }
      } else if (extractor.type === 'string' && extractor.pattern) {
        const match = text.match(new RegExp(extractor.pattern, 'i'));
        if (match) {
          resolvedSlots[slotKey] = match[0];
          matchedTextBySlot[slotKey] = match[0].toLowerCase();
        }
      }
    }

    const matchingSlotsByText = new Map<string, string[]>();
    for (const [slotKey, matchedText] of Object.entries(matchedTextBySlot)) {
      const normalized = matchedText.trim().toLowerCase();
      const keys = matchingSlotsByText.get(normalized) || [];
      keys.push(slotKey);
      matchingSlotsByText.set(normalized, keys);
    }

    for (const slotKeys of matchingSlotsByText.values()) {
      if (slotKeys.length < 2) continue;
      const maxPriority = Math.max(...slotKeys.map(key => extractors[key]?.priority ?? 0));
      const highestPrioritySlots = slotKeys.filter(key => (extractors[key]?.priority ?? 0) === maxPriority);
      if (highestPrioritySlots.length > 1) {
        return {
          status: 'AMBIGUOUS_SLOT',
          candidates: highestPrioritySlots.map(slotName => ({
            slotName,
            value: resolvedSlots[slotName],
            scenarioId
          })),
          clarificationPrompt: ambiguityPromptTemplate
        };
      }
      for (const slotKey of slotKeys) {
        if (slotKey !== highestPrioritySlots[0]) {
          delete resolvedSlots[slotKey];
          delete matchedTextBySlot[slotKey];
        }
      }
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

    // 1. Cancellation Flow
    const isCancelToken = tokens.includes('отмена') || tokens.includes('отменить') || tokens.includes('cancel');
    if (isCancelToken) {
      const isPureCancel = text === 'отмена' || text === 'отменить' || text === 'cancel';
      const activeWaiting = this.dialogueManager.listContexts(identity).filter(c => c.status === 'WAITING_FOR_SLOT');

      if (isPureCancel) {
        if (activeWaiting.length === 1) {
          const contextId = activeWaiting[0].contextId;
          const cancelled = await this.dialogueManager.cancelContext(contextId, identity);
          return cancelled.success ? { status: 'CANCELLED', contextId } : { status: 'NO_MATCH' };
        }
        if (activeWaiting.length > 1) {
          const candidateContextIds = activeWaiting.map(c => c.contextId);
          const labels = activeWaiting.map(c => String(c.slots.orderId ?? c.slots.offerId ?? c.contextId));
          return {
            status: 'AMBIGUOUS_CONTEXT',
            candidateContextIds,
            clarificationPrompt: `Уточните, какой контекст отменить: ${labels.join(', ')}`
          };
        }
        return { status: 'NO_MATCH' };
      }

      const routeResult = this.dialogueManager.resolveRouting(text, [], identity);
      if (routeResult.status === 'RESOLVED') {
        const cancelled = await this.dialogueManager.cancelContext(routeResult.contextId, identity);
        return cancelled.success ? { status: 'CANCELLED', contextId: routeResult.contextId } : { status: 'NO_MATCH' };
      }
      if (routeResult.status === 'CONTEXT_ACCESS_DENIED') return { status: 'CONTEXT_ACCESS_DENIED' };
      if (routeResult.status === 'AMBIGUOUS_CONTEXT') {
        return { status: 'AMBIGUOUS_CONTEXT', candidateContextIds: routeResult.candidateContextIds };
      }
      return { status: 'NO_MATCH' };
    }

    // 2. Intent Resolution (Evaluation / Comparison Queries)
    const intentRes = this.resolveIntent(text);
    const isNewScenarioActivation = intentRes.status === 'RESOLVED' && (() => {
      const sc = intentRes.scenario;
      const activationTriggers = [
        sc.activation?.value,
        ...(Array.isArray(sc.aliases) ? sc.aliases : []),
        ...(Array.isArray(sc.triggerPhrases) ? sc.triggerPhrases : [])
      ].filter((trigger): trigger is string => Boolean(trigger));
      return activationTriggers.some(trigger => {
        const clean = trigger.replace(/^voice\./, '').replace(/[-_]/g, ' ').toLowerCase().trim();
        return text === clean || text.startsWith(clean) || clean.startsWith(`${text} `)
          || clean.split(/\s+/).every(word => text.includes(word));
      });
    })();

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

        return this.evaluateScenarioQuery(sc, currentCtx.offers as unknown as CandidateItem[], extractedIdx);
      }
    }

    // 3. Declarative Active Context Processing
    const activeWaiting = this.dialogueManager.listContexts(identity).filter(c => c.status === 'WAITING_FOR_SLOT');

    if (!isNewScenarioActivation && activeWaiting.length === 1) {
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
        if (slotRes.status === 'NO_MATCH') {
          return { status: 'NO_MATCH' };
        }

        if (slotRes.status === 'RESOLVED' && Object.keys(slotRes.slots).length > 0) {
          const extracted = slotRes.slots;

          if (activeCtx.offers && activeCtx.offers.length > 0) {
            const targetSlot = scenario.candidateBinding?.targetSlot
              || activeCtx.missingSlots.find(s => s !== 'confirmation')
              || scenario.requiredSlots?.find(s => s !== 'confirmation');

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
              if (
                candidateResolution.status === 'NO_MATCH' &&
                Object.keys(extracted).some(slotName => slotName !== 'confirmation')
              ) {
                return { status: 'NO_MATCH' };
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

          if (updatedCtxState && updatedCtxState.missingSlots.length === 0 && !scenario.confirmation && !scenario.requiredSlots?.includes('confirmation')) {
            const existingExecution = this.dialogueManager.getExecutionLogs(identity).find(execution => execution.contextId === activeCtx.contextId);
            if (!existingExecution) {
              const execution = this.dialogueManager.createExecution(updatedCtxState, identity);
              const dispatchResult = await this.dialogueManager.dispatchAction(execution.executionId, execution.payload, identity);
              return {
                status: 'COMPLETED',
                executionStatus: dispatchResult.status,
                contextId: activeCtx.contextId,
                executionId: execution.executionId,
                attempt: dispatchResult.attempt,
                context: this.dialogueManager.getContext(activeCtx.contextId, identity)
              };
            }
          }
          return updatedCtxState || this.dialogueManager.getContext(activeCtx.contextId, identity);
        }
      }
    } else if (!isNewScenarioActivation && activeWaiting.length > 1) {
      const slotCandidates: Array<{ slotName: string; value: any; scenarioId: string }> = [];
      for (const context of activeWaiting) {
        const scenario = (context.scenarioId ? this.scenarioRegistry.find(s => s.id === context.scenarioId) : undefined)
          || this.getDeterministicScenarioForIntent(context.intent);
        if (!scenario?.slotExtractors) continue;
        const slotResult = this.extractSlotsDeterministically(text, scenario.slotExtractors, scenario.id, scenario.ambiguityPrompt?.template);
        if (slotResult.status !== 'RESOLVED') continue;
        for (const [slotName, value] of Object.entries(slotResult.slots)) {
          if (context.missingSlots.includes(slotName)) slotCandidates.push({ slotName, value, scenarioId: scenario.id });
        }
      }
      const matchedContexts = new Set(slotCandidates.map(candidate => candidate.scenarioId));
      if (matchedContexts.size > 1) {
        return {
          status: 'AMBIGUOUS_SLOT',
          candidates: slotCandidates,
          clarificationPrompt: 'Уточните значение: фраза подходит нескольким ожидаемым полям.'
        };
      }
      if (slotCandidates.length > 0) {
        const labels = activeWaiting.map(c => String(c.slots.orderId ?? c.slots.offerId ?? c.contextId));
        return {
          status: 'AMBIGUOUS_CONTEXT',
          candidateContextIds: activeWaiting.map(c => c.contextId),
          clarificationPrompt: `Уточните контекст: ${labels.join(', ')}`
        };
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

  public getScenarioById(id: string): ScenarioDefinition | undefined {
      return this.scenarioRegistry.find(s => s.id === id);
    }
  
    public getScenarioRegistry(): ScenarioDefinition[] {
      return [...this.scenarioRegistry];
    }
}
