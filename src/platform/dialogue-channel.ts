import {
  DialogueStateManager,
  type SessionIdentity,
  type DialogueContext
} from './dialogue-manager';
import { VoiceChannel, type ScenarioDefinition } from './voice-channel';

export interface DialogueInputPayload {
  slotName?: string;
  slotValue?: unknown;
  action?: string;
}

export interface DialogueInput {
  channel: 'text' | 'button' | 'voice';
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
    const activeCtxBefore = this.dm.getActiveState(identity);
    let extractedSlots: Record<string, any> = {};
    let rawText = '';

    // 1. Channel Input Normalization
    if (input.channel === 'button') {
      rawText = input.raw_input || '';
      if (input.payload?.slotName && input.payload?.slotValue !== undefined) {
        extractedSlots[input.payload.slotName] = input.payload.slotValue;
      } else if (rawText) {
        const extracted = this.vc.extractSlotsDeterministically(rawText, activeScenario.slotExtractors, activeScenario.id);
        if (extracted.status === 'RESOLVED') {
          extractedSlots = extracted.slots;
        }
      }
    } else if (input.channel === 'voice') {
      rawText = input.transcript || input.raw_input || '';
      const extracted = this.vc.extractSlotsDeterministically(rawText, activeScenario.slotExtractors, activeScenario.id);
      if (extracted.status === 'RESOLVED') {
        extractedSlots = extracted.slots;
      }
    } else if (input.channel === 'text') {
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

    // 3. Generic Semantic Cancellation
    const nonConfirmSlots = Object.keys(extractedSlots).filter(k => k !== 'confirmation');
    const isPureCancel = extractedSlots.confirmation === 'REJECTED' && nonConfirmSlots.length === 0;

    if (isPureCancel) {
      this.dm.cancelContext(ctx.contextId, identity);
      return {
        status: 'CANCELLED',
        presentation: {
          text: 'Диалог отменён.'
        }
      };
    }

    // 4. Declarative Target Slot for Candidate Resolution
    const targetSlot = (activeScenario.candidateBinding as any)?.targetSlot
      || ctx.missingSlots.find(s => s !== 'confirmation')
      || 'selectedItem';

    // 5. Generic Candidate Resolution using existing SC-PLATFORM-003
    if (ctx.offers && ctx.offers.length > 0 && extractedSlots[targetSlot] === undefined) {
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
      if (slotKey !== 'confirmation' && slotKey !== 'candidate_index' && slotKey !== 'candidate_name') {
        await this.dm.fillSlot(slotKey, slotVal, ctx.contextId, identity);
      }
    }

    ctx = this.dm.getContext(ctx.contextId, identity)!;

    // 7. Generic Confirmation & Execution via ActionDispatcher
    if (extractedSlots.confirmation === 'CONFIRMED') {
      const remainingNonConfirm = ctx.missingSlots.filter(s => s !== 'confirmation');
      if (remainingNonConfirm.length === 0) {
        await this.dm.fillSlot('confirmation', 'CONFIRMED', ctx.contextId, identity);
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
            text: 'Заказ подтверждён.'
          }
        };
      }
    }

    // 8. Build Generic Presentation (text + actions)
    const nextMissing = ctx.missingSlots.find(s => s !== 'confirmation');
    const nextQuestion = nextMissing && activeScenario.clarificationPrompts?.[nextMissing]
      ? activeScenario.clarificationPrompts[nextMissing]
      : (ctx.missingSlots.includes('confirmation') ? activeScenario.clarificationPrompts?.confirmation || 'Подтверждаете?' : 'Пожалуйста, продолжите ввод:');

    const actions: DialoguePresentationAction[][] = [];

    // Generic confirmation actions
    if (ctx.missingSlots.length === 1 && ctx.missingSlots[0] === 'confirmation') {
      actions.push([
        {
          id: 'confirm',
          label: 'Да',
          payload: {
            slotName: 'confirmation',
            slotValue: 'CONFIRMED'
          }
        },
        {
          id: 'cancel',
          label: 'Отмена',
          payload: {
            slotName: 'confirmation',
            slotValue: 'REJECTED'
          }
        }
      ]);
    } else if (ctx.offers && ctx.offers.length > 0 && ctx.missingSlots.includes(targetSlot)) {
      // Generic candidate presentation actions
      const candidateRow: DialoguePresentationAction[] = ctx.offers.map((cand: any) => ({
        id: String(cand.id),
        label: cand.name || String(cand.id),
        payload: {
          slotName: targetSlot,
          slotValue: cand.id
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
