import {
  DialogueStateManager,
  type SessionIdentity,
  type DialogueContext
} from './dialogue-manager';
import { VoiceChannel, type ScenarioDefinition } from './voice-channel';

export interface TelegramInputMessage {
  channel: 'button' | 'text' | 'voice';
  raw_input?: string;
  transcript?: string;
  button_payload?: {
    slotName?: string;
    slotValue?: any;
    action?: string;
  };
}

export interface DialogueInstrumentation {
  channel: 'button' | 'text' | 'voice';
  raw_input: string | null;
  transcript: string | null;
  intent: string | null;
  extracted_slots: Record<string, any>;
  previous_state: Record<string, any>;
  new_state: Record<string, any>;
  next_question: string | null;
  confidence: number;
}

export class TelegramDialogueAdapter {
  private dm: DialogueStateManager;
  private vc: VoiceChannel;
  private lastInstrumentation: DialogueInstrumentation | null = null;

  constructor(dm: DialogueStateManager, vc: VoiceChannel) {
    this.dm = dm;
    this.vc = vc;
  }

  public getLastInstrumentation(): DialogueInstrumentation | null {
    return this.lastInstrumentation;
  }

  public async handleMessage(
    input: TelegramInputMessage,
    identity: SessionIdentity,
    activeScenario: ScenarioDefinition
  ): Promise<any> {
    const activeCtxBefore = this.dm.getActiveState(identity);
    const prevState = activeCtxBefore ? { ...activeCtxBefore.slots } : {};

    let extractedSlots: Record<string, any> = {};
    let rawText = '';
    let transcript: string | null = null;
    let intent: string | null = activeCtxBefore?.intent || activeScenario.intent;

    // 1. Channel Input Normalization (Button, Text, Voice STT)
    if (input.channel === 'button') {
      rawText = input.raw_input || '';
      if (input.button_payload?.slotName && input.button_payload?.slotValue !== undefined) {
        extractedSlots[input.button_payload.slotName] = input.button_payload.slotValue;
      } else if (rawText) {
        const extracted = this.vc.extractSlotsDeterministically(rawText, activeScenario.slotExtractors, activeScenario.id);
        if (extracted.status === 'RESOLVED') {
          extractedSlots = extracted.slots;
        }
      }
    } else if (input.channel === 'voice') {
      transcript = input.transcript || input.raw_input || '';
      rawText = transcript;
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

    // 3. True Cancellation: only when pure cancellation and no other productive slot values present
    const nonConfirmSlots = Object.keys(extractedSlots).filter(k => k !== 'confirmation');
    const isPureCancel = (extractedSlots.confirmation === 'REJECTED' || rawText.toLowerCase().trim() === 'отмена' || rawText.toLowerCase().trim() === 'отменяю')
      && nonConfirmSlots.length === 0;

    if (isPureCancel) {
      this.dm.cancelContext(ctx.contextId, identity);
      this.recordInstrumentation(input, rawText, transcript, intent, extractedSlots, prevState, {}, null);
      return { status: 'CANCELLED', message: 'Диалог отменен' };
    }

    // 4. Fill or Replace Extracted Slots in the Unified DialogueContext
    for (const [slotKey, slotVal] of Object.entries(extractedSlots)) {
      if (slotKey !== 'confirmation') {
        await this.dm.fillSlot(slotKey, slotVal, ctx.contextId, identity);
      }
    }

    ctx = this.dm.getContext(ctx.contextId, identity)!;

    // 5. Candidate Resolution if candidates are attached to context
    if (ctx.offers && ctx.offers.length > 0 && extractedSlots.selected_nanny === undefined) {
      const resolution = this.vc.resolveCandidate(
        extractedSlots,
        ctx.offers as any,
        activeScenario.candidateBinding,
        activeScenario.id,
        'selected_nanny'
      );
      if (resolution.status === 'RESOLVED') {
        await this.dm.fillSlot('selected_nanny', resolution.targetId, ctx.contextId, identity);
        ctx = this.dm.getContext(ctx.contextId, identity)!;
      }
    }

    // 6. Handle Confirmation through ActionDispatcher ONLY (Single Action Owner)
    if (extractedSlots.confirmation === 'CONFIRMED') {
      const remainingNonConfirm = ctx.missingSlots.filter(s => s !== 'confirmation');
      if (remainingNonConfirm.length === 0) {
        await this.dm.fillSlot('confirmation', 'CONFIRMED', ctx.contextId, identity);
        ctx = this.dm.getContext(ctx.contextId, identity)!;
        const exec = this.dm.createExecution(ctx, identity);
        const dispatchRes = await this.dm.dispatchAction(exec.executionId, ctx.slots, identity);

        this.recordInstrumentation(input, rawText, transcript, intent, extractedSlots, prevState, ctx.slots, null);
        return {
          status: 'ORDER_CONFIRMED',
          contextId: ctx.contextId,
          executionId: exec.executionId,
          dispatchStatus: dispatchRes.status,
          slots: ctx.slots
        };
      }
    }

    // 7. Determine Next Prompt
    const nextMissing = ctx.missingSlots.find(s => s !== 'confirmation');
    const nextQuestion = nextMissing && activeScenario.clarificationPrompts?.[nextMissing]
      ? activeScenario.clarificationPrompts[nextMissing]
      : (ctx.missingSlots.includes('confirmation') ? activeScenario.clarificationPrompts?.confirmation || 'Подтверждаете?' : null);

    this.recordInstrumentation(input, rawText, transcript, intent, extractedSlots, prevState, ctx.slots, nextQuestion);

    return {
      status: ctx.status,
      contextId: ctx.contextId,
      slots: ctx.slots,
      missingSlots: ctx.missingSlots,
      nextQuestion,
      offers: ctx.offers
    };
  }

  private recordInstrumentation(
    input: TelegramInputMessage,
    rawText: string,
    transcript: string | null,
    intent: string | null,
    extractedSlots: Record<string, any>,
    prevState: Record<string, any>,
    newState: Record<string, any>,
    nextQuestion: string | null
  ) {
    this.lastInstrumentation = {
      channel: input.channel,
      raw_input: input.raw_input || null,
      transcript: transcript,
      intent: intent,
      extracted_slots: extractedSlots,
      previous_state: prevState,
      new_state: newState,
      next_question: nextQuestion,
      confidence: 1.0 // deterministic rule-based baseline confidence
    };
  }
}
