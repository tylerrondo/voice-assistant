import {
  DialogueStateManager,
  type SessionIdentity,
  type DialogueContext
} from './dialogue-manager';
import { VoiceChannel, type ScenarioDefinition } from './voice-channel';

export type DialogueModality = 'text' | 'button' | 'voice';

export interface DialogueInputPayload {
  slotName?: string;
  slotValue?: unknown;
  action?: string;
}

export interface DialogueInput {
  modality?: DialogueModality;
  channel?: DialogueModality | string; // backward-compatible alias
  raw_input?: string;
  transcript?: string;
  payload?: DialogueInputPayload;
}

export interface DialoguePresentationAction {
  id: string;
  label: string;
  payload: {
    slotName: string;
    slotValue: unknown;
  };
}

export interface DialoguePresentation {
  text?: string;
  actions?: DialoguePresentationAction[][];
}

export interface DialogueEngineResult {
  status: string;
  contextId?: string;
  executionId?: string;
  slots?: Record<string, unknown>;
  missingSlots?: string[];
  nextQuestion?: string | null;
  offers?: unknown[];
  dispatchStatus?: string;
  presentation: DialoguePresentation;
}

export class DialogueEngine {
  private dm: DialogueStateManager;
  private vc: VoiceChannel;

  constructor(dm: DialogueStateManager, vc: VoiceChannel) {
    this.dm = dm;
    this.vc = vc;
  }

  public getDialogueManager(): DialogueStateManager {
    return this.dm;
  }

  public getVoiceChannel(): VoiceChannel {
    return this.vc;
  }

  public async processInput(
    input: DialogueInput,
    identity: SessionIdentity,
    activeScenario: ScenarioDefinition
  ): Promise<DialogueEngineResult> {
    const inputModality: DialogueModality = input.modality || (input.channel as DialogueModality) || 'text';
    let extractedSlots: Record<string, any> = {};
    let rawText = '';

    // 1. Modality Input Normalization
    if (inputModality === 'button') {
      rawText = input.raw_input || '';
      if (input.payload?.slotName && input.payload?.slotValue !== undefined) {
        extractedSlots[input.payload.slotName] = input.payload.slotValue;
      } else if (rawText) {
        const extracted = this.vc.extractSlotsDeterministically(rawText, activeScenario.slotExtractors, activeScenario.id);
        if (extracted.status === 'RESOLVED') {
          extractedSlots = extracted.slots;
        }
      }
    } else if (inputModality === 'voice') {
      rawText = input.transcript || input.raw_input || '';
      const extracted = this.vc.extractSlotsDeterministically(rawText, activeScenario.slotExtractors, activeScenario.id);
      if (extracted.status === 'RESOLVED') {
        extractedSlots = extracted.slots;
      }
    } else if (inputModality === 'text') {
      rawText = input.raw_input || '';
      const extracted = this.vc.extractSlotsDeterministically(rawText, activeScenario.slotExtractors, activeScenario.id);
      if (extracted.status === 'RESOLVED') {
        extractedSlots = extracted.slots;
      }
    }

    // 2. Ensure Context exists
    let ctx = this.dm.getActiveState(identity);
    if (!ctx) {
      ctx = this.dm.createContext(
        activeScenario.intent,
        {},
        activeScenario.requiredSlots || [],
        activeScenario.steps?.[0]?.event?.type || `${activeScenario.intent.toLowerCase()}.action`,
        activeScenario.clarificationPrompts || {},
        identity,
        activeScenario.id
      );
    }

    // 3. Declarative Cancellation check (strictly driven by Scenario definition)
    const confirmationConfig = activeScenario.confirmation;
    if (confirmationConfig) {
      const confirmSlot = confirmationConfig.slot;
      const rejectedVal = confirmationConfig.rejectedValue;
      const nonConfirmSlots = Object.keys(extractedSlots).filter(k => k !== confirmSlot);

      if (extractedSlots[confirmSlot] === rejectedVal && nonConfirmSlots.length === 0) {
        this.dm.cancelContext(ctx.contextId, identity);
        return {
          status: 'CANCELLED',
          presentation: {
            text: confirmationConfig.cancelledMessage || 'Cancelled'
          }
        };
      }
    }

    // 4. Declarative Target Slot for Candidate Resolution
    const targetSlot = activeScenario.candidateBinding?.targetSlot;

    // 5. Generic Candidate Resolution using existing SC-PLATFORM-003
    if (targetSlot && ctx.offers && ctx.offers.length > 0 && extractedSlots[targetSlot] === undefined) {
      const resolution = this.vc.resolveCandidate(
        extractedSlots,
        ctx.offers as any,
        activeScenario.candidateBinding,
        activeScenario.id,
        targetSlot
      );
      if (resolution.status === 'RESOLVED') {
        extractedSlots[targetSlot] = resolution.targetId;
      }
    }

    // 6. Fill or Replace Slots in Unified DialogueContext
    for (const [slotKey, slotVal] of Object.entries(extractedSlots)) {
      if (
        (!confirmationConfig || slotKey !== confirmationConfig.slot) &&
        slotKey !== 'candidate_index' &&
        slotKey !== 'candidate_name'
      ) {
        await this.dm.fillSlot(slotKey, slotVal, ctx.contextId, identity);
      }
    }

    ctx = this.dm.getContext(ctx.contextId, identity)!;

    // 7. Generic Confirmation & Execution via ActionDispatcher
    if (confirmationConfig && extractedSlots[confirmationConfig.slot] === confirmationConfig.confirmedValue) {
      const confirmSlot = confirmationConfig.slot;
      const remainingNonConfirm = ctx.missingSlots.filter(s => s !== confirmSlot);

      if (remainingNonConfirm.length === 0) {
        await this.dm.fillSlot(confirmSlot, confirmationConfig.confirmedValue, ctx.contextId, identity);
        ctx = this.dm.getContext(ctx.contextId, identity)!;
        const exec = this.dm.createExecution(ctx, identity);
        const dispatchRes = await this.dm.dispatchAction(exec.executionId, ctx.slots, identity);

        return {
          status: 'CONFIRMED',
          contextId: ctx.contextId,
          executionId: exec.executionId,
          dispatchStatus: dispatchRes.status,
          slots: ctx.slots,
          presentation: {
            text: confirmationConfig.confirmedMessage || 'Operation confirmed'
          }
        };
      }
    }

    // 8. Build Generic Presentation (text + actions)
    const confirmSlot = confirmationConfig?.slot;
    const nextMissing = ctx.missingSlots.find(s => s !== confirmSlot);
    const nextQuestion = nextMissing && activeScenario.clarificationPrompts?.[nextMissing]
      ? activeScenario.clarificationPrompts[nextMissing]
      : (confirmSlot && ctx.missingSlots.includes(confirmSlot)
          ? activeScenario.clarificationPrompts?.[confirmSlot] || 'Confirmation required'
          : '');

    const actions: DialoguePresentationAction[][] = [];

    // Generic confirmation actions
    if (confirmationConfig && ctx.missingSlots.length === 1 && ctx.missingSlots[0] === confirmationConfig.slot) {
      actions.push([
        {
          id: 'confirm',
          label: confirmationConfig.confirmLabel || 'Confirm',
          payload: {
            slotName: confirmationConfig.slot,
            slotValue: confirmationConfig.confirmedValue
          }
        },
        {
          id: 'cancel',
          label: confirmationConfig.rejectLabel || 'Cancel',
          payload: {
            slotName: confirmationConfig.slot,
            slotValue: confirmationConfig.rejectedValue
          }
        }
      ]);
    } else if (targetSlot && ctx.offers && ctx.offers.length > 0 && ctx.missingSlots.includes(targetSlot)) {
      // Generic candidate presentation actions using declarative idField and labelField
      const idKey = activeScenario.candidateBinding?.idField || 'id';
      const labelKey = activeScenario.candidateBinding?.labelField || idKey;

      const candidateRow: DialoguePresentationAction[] = ctx.offers.map((cand: any) => ({
        id: String(cand[idKey]),
        label: String(cand[labelKey] ?? cand[idKey]),
        payload: {
          slotName: targetSlot,
          slotValue: cand[idKey]
        }
      }));
      actions.push(candidateRow);
    }

    return {
      status: ctx.status,
      contextId: ctx.contextId,
      slots: ctx.slots,
      missingSlots: ctx.missingSlots,
      nextQuestion,
      offers: ctx.offers,
      presentation: {
        text: nextQuestion,
        actions: actions.length > 0 ? actions : undefined
      }
    };
  }
}
