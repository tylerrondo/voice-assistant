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

export interface NannyCandidate {
  id: string;
  name: string;
  index: number;
  status: 'AVAILABLE' | 'UNAVAILABLE';
}

export interface DomainNannyService {
  searchNannies(criteria: Record<string, any>): Promise<NannyCandidate[]>;
  confirmOrder(orderData: Record<string, any>): Promise<{ orderId: string; status: 'SUCCESS' }>;
}

export class DefaultMockDomainNannyService implements DomainNannyService {
  async searchNannies(criteria: Record<string, any>): Promise<NannyCandidate[]> {
    return [
      { id: 'nanny-1', name: 'Мария', index: 1, status: 'AVAILABLE' },
      { id: 'nanny-2', name: 'Анна', index: 2, status: 'AVAILABLE' }
    ];
  }

  async confirmOrder(orderData: Record<string, any>): Promise<{ orderId: string; status: 'SUCCESS' }> {
    return { orderId: `ord-nanny-${Date.now()}`, status: 'SUCCESS' };
  }
}

export class TelegramDialogueAdapter {
  private dm: DialogueStateManager;
  private vc: VoiceChannel;
  private nannyService: DomainNannyService;
  private lastInstrumentation: DialogueInstrumentation | null = null;

  constructor(dm: DialogueStateManager, vc: VoiceChannel, nannyService?: DomainNannyService) {
    this.dm = dm;
    this.vc = vc;
    this.nannyService = nannyService || new DefaultMockDomainNannyService();
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

    // 1. Convert Channel Input to Unified Action / Text
    if (input.channel === 'button') {
      rawText = input.raw_input || '';
      if (input.button_payload?.slotName && input.button_payload?.slotValue !== undefined) {
        extractedSlots[input.button_payload.slotName] = input.button_payload.slotValue;
      } else if (rawText) {
        // Fallback: extract slot from button text using scenario extractors
        const extracted = this.vc.extractSlotsDeterministically(rawText, activeScenario.slotExtractors, activeScenario.id);
        if (extracted.status === 'RESOLVED') {
          extractedSlots = extracted.slots;
        }
      }
    } else if (input.channel === 'voice') {
      // Voice with STT seam
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

    // 3. Handle Special Correction / Modification Token
    if (extractedSlots.confirmation === 'MODIFY' || rawText.includes('изменить время') || rawText.includes('поменять время')) {
      // Reset start_time and end_time
      delete ctx.slots.start_time;
      delete ctx.slots.end_time;
      if (!ctx.missingSlots.includes('start_time')) ctx.missingSlots.push('start_time');
      if (!ctx.missingSlots.includes('end_time')) ctx.missingSlots.push('end_time');
      ctx.missingSlots.sort((a, b) => {
        const order = activeScenario.requiredSlots || [];
        return order.indexOf(a) - order.indexOf(b);
      });
      delete extractedSlots.confirmation;
    }

    // 4. Handle Cancellation
    if (extractedSlots.confirmation === 'REJECTED' || rawText.toLowerCase().includes('отмена') || rawText.toLowerCase().includes('отменяю')) {
      this.dm.cancelContext(ctx.contextId, identity);
      this.recordInstrumentation(input, rawText, transcript, intent, extractedSlots, prevState, {}, null);
      return { status: 'CANCELLED', message: 'Заказ отменен' };
    }

    // 5. Fill extracted slots directly into the unified DialogueContext
    for (const [slotKey, slotVal] of Object.entries(extractedSlots)) {
      if (slotKey !== 'confirmation') {
        await this.dm.fillSlot(slotKey, slotVal, ctx.contextId, identity);
      }
    }

    ctx = this.dm.getContext(ctx.contextId, identity)!;

    // 6. Check if candidate search should be triggered (when base criteria are satisfied)
    const baseInfoSlots = ['date', 'start_time', 'end_time', 'children_count'];
    const hasBaseInfo = baseInfoSlots.every(slot => ctx.slots[slot] !== undefined);

    if (hasBaseInfo && (!ctx.offers || ctx.offers.length === 0)) {
      const candidates = await this.nannyService.searchNannies(ctx.slots);
      ctx.offers = candidates as any;
    }

    // 7. If candidate selection slot is extracted or candidates present
    if (ctx.offers && ctx.offers.length > 0 && (extractedSlots.selected_nanny !== undefined || extractedSlots.choice !== undefined)) {
      const targetCandidateId = extractedSlots.selected_nanny;
      if (targetCandidateId) {
        await this.dm.fillSlot('selected_nanny', targetCandidateId, ctx.contextId, identity);
      } else {
        const resolution = this.vc.resolveCandidate(
          extractedSlots,
          ctx.offers as any,
          activeScenario.candidateBinding,
          activeScenario.id,
          'selected_nanny'
        );
        if (resolution.status === 'RESOLVED') {
          await this.dm.fillSlot('selected_nanny', resolution.targetId, ctx.contextId, identity);
        }
      }
    }

    ctx = this.dm.getContext(ctx.contextId, identity)!;

    // 8. Handle Confirmation
    if (extractedSlots.confirmation === 'CONFIRMED') {
      const remainingNonConfirm = ctx.missingSlots.filter(s => s !== 'confirmation');
      if (remainingNonConfirm.length === 0) {
        await this.dm.fillSlot('confirmation', 'CONFIRMED', ctx.contextId, identity);
        ctx = this.dm.getContext(ctx.contextId, identity)!;
        const exec = this.dm.createExecution(ctx, identity);
        await this.dm.dispatchAction(exec.executionId, ctx.slots, identity);
        await this.nannyService.confirmOrder(ctx.slots);

        this.recordInstrumentation(input, rawText, transcript, intent, extractedSlots, prevState, ctx.slots, null);
        return {
          status: 'ORDER_CONFIRMED',
          contextId: ctx.contextId,
          executionId: exec.executionId,
          slots: ctx.slots
        };
      }
    }

    // 9. Determine Next Question Prompt
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
      confidence: 1.0
    };
  }
}
