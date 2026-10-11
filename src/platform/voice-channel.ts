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

function compileSlotPattern(pattern: string): RegExp {
  const unicodePattern = pattern.replace(/\\b/g, (boundary, offset, source) => {
    const next = source.slice(offset + boundary.length).trimStart()[0];
    const isRightBoundary = next === undefined || next === '|' || next === ')' || next === '*' || next === '+' || next === '?';
    return isRightBoundary
      ? '(?![\\p{L}\\p{N}_])'
      : '(?<![\\p{L}\\p{N}_])';
  });
  return new RegExp(unicodePattern, 'iu');
}

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

      if (sc.priority !== undefined && !Number.isFinite(sc.priority)) {
        throw new Error(`CONTRACT_VIOLATION: Scenario "${sc.id}" has invalid priority`);
      }
    }

    const triggerOwners = new Map<string, string>();
    for (const sc of scenarioSet.scenarios) {
      const triggers = [
        ...(sc.activation?.value ? [sc.activation.value] : []),
        ...(Array.isArray(sc.aliases) ? sc.aliases : [])
      ];
      for (const trigger of triggers) {
        const normalized = trigger.replace(/^voice\./, '').replace(/[-_]/g, ' ').toLowerCase().trim();
        const owner = triggerOwners.get(normalized);
        if (owner && owner !== sc.id) {
          throw new Error(`CONTRACT_VIOLATION: Trigger or alias collision "${normalized}" between "${owner}" and "${sc.id}"`);
        }
        triggerOwners.set(normalized, sc.id);
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
    const text = phrase.trim().toLowerCase().replace(/[-_]/g, ' ');
    const matchingScenarios: ScenarioDefinition[] = [];

    for (const sc of this.scenarioRegistry) {
      const triggers: string[] = [];
      if (sc.activation?.value) triggers.push(sc.activation.value);
      if (Array.isArray(sc.triggerPhrases)) triggers.push(...sc.triggerPhrases);
      if (Array.isArray(sc.aliases)) triggers.push(...sc.aliases);

      const matches = triggers.some(trig => {
        const clean = trig.replace(/^voice\./, '').replace(/[-_]/g, ' ').toLowerCase().trim();
        return text === clean || text.startsWith(clean) || (text.length >= 3 && clean.startsWith(text)) || clean.split(/\s+/).every(w => text.includes(w));
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

    const normalizedText = text.toLowerCase();
    const candidates: Array<{ slotName: string; value: any; scenarioId: string; priority: number; matchedText: string }> = [];

    for (const [slotName, extractor] of Object.entries(extractors)) {
      let value: any;
      let matchedText: string | undefined;
      let matched = false;

      if (extractor.rules && Array.isArray(extractor.rules)) {
        for (const rule of extractor.rules) {
          const match = normalizedText.match(compileSlotPattern(rule.pattern));
          if (match) {
            value = rule.value;
            matchedText = match[0].toLowerCase();
            matched = true;
            break;
          }
        }
      } else if (extractor.type === 'enum') {
        if (extractor.patterns && Array.isArray(extractor.patterns)) {
          for (const pattern of extractor.patterns) {
            const match = normalizedText.match(compileSlotPattern(pattern));
            if (match) {
              value = 'CONFIRMED';
              matchedText = match[0].toLowerCase();
              matched = true;
              break;
            }
          }
        } else if (extractor.mapping) {
          const mappingMatches: Array<{ enumValue: string; synonym: string }> = [];
          for (const [enumValue, synonyms] of Object.entries(extractor.mapping)) {
            const synonym = synonyms.find(item => normalizedText.includes(item.toLowerCase()));
            if (synonym !== undefined) {
              mappingMatches.push({ enumValue, synonym: synonym.toLowerCase() });
            }
          }

          if (mappingMatches.length > 1) {
            for (const mappingMatch of mappingMatches) {
              candidates.push({
                slotName,
                value: mappingMatch.enumValue,
                scenarioId,
                priority: Number.isFinite(extractor.priority) ? extractor.priority! : 0,
                matchedText: `enum-ambiguity:${slotName}`
              });
            }
            continue;
          }

          if (mappingMatches.length === 1) {
            value = mappingMatches[0].enumValue;
            matchedText = mappingMatches[0].synonym;
            matched = true;
          }
        }
      } else if (extractor.type === 'integer' && extractor.pattern) {
        const match = normalizedText.match(compileSlotPattern(extractor.pattern));
        if (match) {
          value = parseInt(match[0], 10);
          matchedText = match[0].toLowerCase();
          matched = true;
        }
      } else if (extractor.type === 'string' && extractor.pattern) {
        const match = normalizedText.match(compileSlotPattern(extractor.pattern));
        if (match) {
          value = match[0];
          matchedText = match[0].toLowerCase();
          matched = true;
        }
      }

      if (matched && matchedText !== undefined) {
        candidates.push({
          slotName,
          value,
          scenarioId,
          priority: Number.isFinite(extractor.priority) ? extractor.priority! : 0,
          matchedText
        });
      }
    }

    if (candidates.length === 0) {
      return { status: 'NO_MATCH' };
    }

    const resolvedSlots: Record<string, any> = {};
    const processed = new Set<string>();

    for (const candidate of candidates) {
      if (processed.has(candidate.slotName)) continue;
      const sameMatch = candidates.filter(item => item.matchedText === candidate.matchedText);
      const maxPriority = Math.max(...sameMatch.map(item => item.priority));
      const top = sameMatch.filter(item => item.priority === maxPriority);

      for (const item of sameMatch) processed.add(item.slotName);

      if (top.length > 1) {
        return {
          status: 'AMBIGUOUS_SLOT',
          candidates: top.map(item => ({
            slotName: item.slotName,
            value: item.value,
            scenarioId: item.scenarioId
          })),
          clarificationPrompt: ambiguityPromptTemplate
        };
      }

      resolvedSlots[top[0].slotName] = top[0].value;
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

        return this.evaluateScenarioQuery(sc, currentCtx.offers as unknown as CandidateItem[], extractedIdx);
      }
    }

    // Ambiguous new intents must not be silently routed into an existing context.
    if (intentRes.status === 'AMBIGUOUS_INTENT') {
      return intentRes;
    }

    // 3. Declarative Active Context Processing
    const activeWaiting = this.dialogueManager.listContexts(identity).filter(c => c.status === 'WAITING_FOR_SLOT');
    const isCandidateSelectionIntent = intentRes.status === 'RESOLVED' && !!intentRes.scenario.candidateBinding;

    if (isCandidateSelectionIntent && activeWaiting.length > 1) {
      return {
        status: 'AMBIGUOUS_CONTEXT',
        candidateContextIds: activeWaiting.map(ctx => ctx.contextId)
      };
    }

    // A resolved activation starts a new context, except when it is an explicit
    // candidate-selection intent for the one active context that owns the offers.
    const isSelectionForActiveContext =
      isCandidateSelectionIntent && activeWaiting.length === 1 && !!activeWaiting[0].offers?.length;
    if (activeWaiting.length === 1 && (intentRes.status === 'NO_MATCH' || isSelectionForActiveContext)) {
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
                if (fillRes.success && fillRes.data) {
                  if (fillRes.data.missingSlots.length === 0 && !fillRes.data.requiredSlots?.includes('confirmation')) {
                    const execution = this.dialogueManager.createExecution(fillRes.data, identity);
                    const dispatchRes = await this.dialogueManager.dispatchAction(execution.executionId, fillRes.data.slots, identity);
                    return {
                      status: dispatchRes.status,
                      contextId: fillRes.data.contextId,
                      executionId: execution.executionId,
                      attempt: dispatchRes.attempt,
                      context: this.dialogueManager.getContext(fillRes.data.contextId, identity)
                    };
                  }
                  return fillRes.data;
                }
              }
            }
          }

          let updatedCtxState: any = null;
          for (const [slotKey, slotVal] of Object.entries(extracted)) {
            if (slotKey !== 'confirmation' && (activeCtx.requiredSlots?.includes(slotKey) || activeCtx.slots[slotKey] !== undefined)) {
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

          const latestCtx = this.dialogueManager.getContext(activeCtx.contextId, identity) || activeCtx;
          if (updatedCtxState && latestCtx.missingSlots.length === 0 && !latestCtx.requiredSlots?.includes('confirmation')) {
            const execution = this.dialogueManager.createExecution(latestCtx, identity);
            const dispatchRes = await this.dialogueManager.dispatchAction(execution.executionId, latestCtx.slots, identity);
            return {
              status: dispatchRes.status,
              contextId: latestCtx.contextId,
              executionId: execution.executionId,
              attempt: dispatchRes.attempt,
              context: this.dialogueManager.getContext(latestCtx.contextId, identity)
            };
          }
          return updatedCtxState || latestCtx;
        }
      }
    } else if (activeWaiting.length > 1 && intentRes.status === 'NO_MATCH') {
      const slotMatches: Array<{ contextId: string; slotName: string; value: any; scenarioId: string }> = [];

      for (const activeCtx of activeWaiting) {
        const scenario = this.scenarioRegistry.find(s => s.id === activeCtx.scenarioId)
          || this.getDeterministicScenarioForIntent(activeCtx.intent);
        if (!scenario?.slotExtractors) continue;

        const slotResult = this.extractSlotsDeterministically(
          text,
          scenario.slotExtractors,
          scenario.id,
          scenario.ambiguityPrompt?.template
        );

        if (slotResult.status === 'AMBIGUOUS_SLOT') {
          return slotResult;
        }

        if (slotResult.status === 'RESOLVED') {
          for (const [slotName, value] of Object.entries(slotResult.slots)) {
            if (activeCtx.missingSlots.includes(slotName) || activeCtx.slots[slotName] !== undefined) {
              slotMatches.push({ contextId: activeCtx.contextId, slotName, value, scenarioId: scenario.id });
            }
          }
        }
      }

      const matchedContextIds = [...new Set(slotMatches.map(match => match.contextId))];
      if (matchedContextIds.length > 1) {
        const distinctSlots = [...new Set(slotMatches.map(match => match.slotName))];
        if (distinctSlots.length > 1) {
          return {
            status: 'AMBIGUOUS_SLOT',
            candidates: slotMatches.map(({ slotName, value, scenarioId }) => ({ slotName, value, scenarioId }))
          };
        }
        return {
          status: 'AMBIGUOUS_CONTEXT',
          candidateContextIds: matchedContextIds
        };
      }

      if (matchedContextIds.length === 1) {
        const targetContextId = matchedContextIds[0];
        let updatedContext: DialogueContext | null = null;

        for (const match of slotMatches.filter(item => item.contextId === targetContextId)) {
          const fillResult = await this.dialogueManager.fillSlot(
            match.slotName,
            match.value,
            targetContextId,
            identity
          );
          if (fillResult.success && fillResult.data) updatedContext = fillResult.data;
        }

        const latestContext = this.dialogueManager.getContext(targetContextId, identity);
        if (updatedContext && latestContext && latestContext.missingSlots.length === 0 && !latestContext.requiredSlots?.includes('confirmation')) {
          const execution = this.dialogueManager.createExecution(latestContext, identity);
          const dispatchResult = await this.dialogueManager.dispatchAction(execution.executionId, latestContext.slots, identity);
          return {
            status: dispatchResult.status,
            contextId: latestContext.contextId,
            executionId: execution.executionId,
            attempt: dispatchResult.attempt,
            context: this.dialogueManager.getContext(latestContext.contextId, identity)
          };
        }

        return latestContext || updatedContext;
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
