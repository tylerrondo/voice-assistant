import { DialogueStateManager } from './dialogue-manager.js';
import type { ActionDispatcher, SessionIdentity } from './dialogue-manager.js';
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
    expectedPhrase?: string;
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
export type CandidateResolutionResult = {
    status: 'RESOLVED';
    targetId: string;
    targetItem: CandidateItem;
} | {
    status: 'CANDIDATE_UNAVAILABLE';
    targetId: string;
    targetItem: CandidateItem;
    message: string;
} | {
    status: 'AMBIGUOUS_SLOT';
    candidates: Array<{
        slotName: string;
        value: any;
        scenarioId: string;
    }>;
    clarificationPrompt?: string;
} | {
    status: 'NO_MATCH';
};
export type IntentResolutionResult = {
    status: 'RESOLVED';
    scenarioId: string;
    intent: string;
    scenario: ScenarioDefinition;
} | {
    status: 'AMBIGUOUS_INTENT';
    candidateScenarioIds: string[];
    candidateIntents: string[];
    clarificationPrompt?: string;
} | {
    status: 'NO_MATCH';
};
export type SlotExtractionResult = {
    status: 'RESOLVED';
    slots: Record<string, any>;
} | {
    status: 'AMBIGUOUS_SLOT';
    candidates: Array<{
        slotName: string;
        value: any;
        scenarioId: string;
    }>;
    clarificationPrompt?: string;
} | {
    status: 'NO_MATCH';
};
export declare class VoiceChannel {
    private dialogueManager;
    private scenarioRegistry;
    private activeScenarioSetId;
    private activeScenarioIds;
    private explicitContextSelections;
    constructor(dialogueManager: DialogueStateManager);
    /**
     * Resolve declarative event payload templates against the authoritative dialogue slots.
     * A full-slot template preserves the slot's runtime type (for example, orderId stays a
     * number); embedded templates are interpolated as strings. Nested payloads are supported.
     */
    private resolveEventPayload;
    registerScenarioSet(scenarioSet: ScenarioSet): void;
    getActiveScenarioSetId(): string;
    setActionDispatcher(dispatcher: ActionDispatcher): void;
    getDeterministicScenarioForIntent(intent: string): ScenarioDefinition | undefined;
    resolveIntent(phrase: string): IntentResolutionResult;
    extractSlotsDeterministically(text: string, extractors?: Record<string, SlotExtractorDefinition>, scenarioId?: string, ambiguityPromptTemplate?: string): SlotExtractionResult;
    private evaluateScenarioQuery;
    resolveCandidate(extractedSlots: Record<string, unknown>, candidates: CandidateItem[], binding: CandidateBindingDefinition | undefined, scenarioId: string, targetSlotName: string, ambiguityPrompt?: string): CandidateResolutionResult;
    handleIncomingVoice(phrase: string, identity: SessionIdentity): Promise<any>;
    getScenarioById(id: string): ScenarioDefinition | undefined;
    getScenarioRegistry(): ScenarioDefinition[];
}
