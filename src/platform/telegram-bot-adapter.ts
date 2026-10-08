import { type ScenarioDefinition } from './voice-channel';
import { type TelegramDialogueAdapter, type TelegramInputMessage } from './telegram-dialogue-adapter';
import { type TelegramVoiceTransport } from './telegram-voice-transport';
import { type SessionIdentity } from './dialogue-manager';

export interface TelegramInlineButton {
  text: string;
  callback_data: string;
}

export interface TelegramSendOptions {
  reply_markup?: {
    inline_keyboard: TelegramInlineButton[][];
  };
}

export interface TelegramClient {
  sendMessage(chatId: string, text: string, options?: TelegramSendOptions): Promise<void>;
  answerCallbackQuery(callbackQueryId: string): Promise<void>;
}

export interface TelegramUser {
  id: number | string;
  username?: string;
}

export interface TelegramChat {
  id: number | string;
}

export interface TelegramMessage {
  message_id?: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  voice?: {
    file_id: string;
    mime_type?: string;
    duration?: number;
  };
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export class MockTelegramClient implements TelegramClient {
  public sentMessages: Array<{ chatId: string; text: string; options?: TelegramSendOptions }> = [];
  public answeredCallbacks: string[] = [];

  public async sendMessage(chatId: string, text: string, options?: TelegramSendOptions): Promise<void> {
    this.sentMessages.push({ chatId, text, options });
  }

  public async answerCallbackQuery(callbackQueryId: string): Promise<void> {
    this.answeredCallbacks.push(callbackQueryId);
  }

  public getLastMessage(): { chatId: string; text: string; options?: TelegramSendOptions } | undefined {
    return this.sentMessages[this.sentMessages.length - 1];
  }
}

export class TelegramBotAdapter {
  private dialogueAdapter: TelegramDialogueAdapter;
  private voiceTransport: TelegramVoiceTransport;
  private telegramClient: TelegramClient;

  constructor(
    dialogueAdapter: TelegramDialogueAdapter,
    voiceTransport: TelegramVoiceTransport,
    telegramClient: TelegramClient
  ) {
    this.dialogueAdapter = dialogueAdapter;
    this.voiceTransport = voiceTransport;
    this.telegramClient = telegramClient;
  }

  public extractIdentity(update: TelegramUpdate): { identity: SessionIdentity; chatId: string } {
    if (update.callback_query) {
      const fromId = String(update.callback_query.from.id);
      const chatId = String(update.callback_query.message?.chat.id || fromId);
      return {
        identity: { ownerId: fromId, sessionId: chatId },
        chatId
      };
    }

    if (update.message) {
      const fromId = String(update.message.from?.id || update.message.chat.id);
      const chatId = String(update.message.chat.id);
      return {
        identity: { ownerId: fromId, sessionId: chatId },
        chatId
      };
    }

    throw new Error('INVALID_TELEGRAM_UPDATE: Missing message or callback_query');
  }

  public async handleUpdate(update: TelegramUpdate, activeScenario: ScenarioDefinition): Promise<void> {
    const { identity, chatId } = this.extractIdentity(update);

    // 1. Handle Callback Query (Button click)
    if (update.callback_query) {
      await this.telegramClient.answerCallbackQuery(update.callback_query.id);

      const data = update.callback_query.data || '';
      let inputMessage: TelegramInputMessage;

      // Protocol: dialogue:<slotName>:<slotValue>
      if (data.startsWith('dialogue:')) {
        const parts = data.split(':');
        const slotName = parts[1];
        let slotValue: any = parts.slice(2).join(':');

        // Cast boolean or numeric values
        if (slotValue === 'true') slotValue = true;
        else if (slotValue === 'false') slotValue = false;
        else if (!isNaN(Number(slotValue)) && slotValue.trim() !== '') {
          slotValue = Number(slotValue);
        }

        inputMessage = {
          channel: 'button',
          button_payload: {
            slotName,
            slotValue
          }
        };
      } else {
        inputMessage = {
          channel: 'button',
          raw_input: data
        };
      }

      const result = await this.dialogueAdapter.handleMessage(inputMessage, identity, activeScenario);
      await this.sendTelegramResponse(chatId, result);
      return;
    }

    // 2. Handle Voice Message
    if (update.message?.voice) {
      const voiceResult = await this.voiceTransport.processVoiceMessage({
        fileId: update.message.voice.file_id,
        mimeType: update.message.voice.mime_type
      });

      if (voiceResult.status === 'TRANSPORT_ERROR') {
        await this.telegramClient.sendMessage(
          chatId,
          `Ошибка голосового сообщения: ${voiceResult.error || 'не удалось распознать речь'}`
        );
        return;
      }

      if (voiceResult.status === 'IGNORED_EMPTY_TRANSCRIPT') {
        await this.telegramClient.sendMessage(chatId, 'Голосовое сообщение не содержит распознаваемой речи.');
        return;
      }

      if (voiceResult.status === 'TRANSCRIPTION_SUCCESS' && voiceResult.normalizedInput) {
        const result = await this.dialogueAdapter.handleMessage(voiceResult.normalizedInput, identity, activeScenario);
        await this.sendTelegramResponse(chatId, result);
      }
      return;
    }

    // 3. Handle Text Message
    if (update.message?.text) {
      const inputMessage: TelegramInputMessage = {
        channel: 'text',
        raw_input: update.message.text
      };

      const result = await this.dialogueAdapter.handleMessage(inputMessage, identity, activeScenario);
      await this.sendTelegramResponse(chatId, result);
      return;
    }
  }

  private async sendTelegramResponse(chatId: string, result: any): Promise<void> {
    if (!result) return;

    if (result.status === 'CANCELLED') {
      await this.telegramClient.sendMessage(chatId, 'Диалог отменён.');
      return;
    }

    if (result.status === 'ORDER_CONFIRMED') {
      await this.telegramClient.sendMessage(chatId, 'Заказ подтверждён.');
      return;
    }

    const responseText = result.nextQuestion || 'Пожалуйста, продолжите ввод:';
    const inlineKeyboard: TelegramInlineButton[][] = [];

    // Confirmation step buttons
    if (result.missingSlots && result.missingSlots.length === 1 && result.missingSlots[0] === 'confirmation') {
      inlineKeyboard.push([
        { text: 'Да', callback_data: 'dialogue:confirmation:CONFIRMED' },
        { text: 'Отмена', callback_data: 'dialogue:confirmation:REJECTED' }
      ]);
    } else if (result.offers && result.offers.length > 0 && result.missingSlots?.includes('selected_nanny')) {
      // Dynamic Candidate presentation buttons
      const candidateRow: TelegramInlineButton[] = result.offers.map((cand: any) => ({
        text: cand.name || String(cand.id),
        callback_data: `dialogue:selected_nanny:${cand.id}`
      }));
      inlineKeyboard.push(candidateRow);
    }

    const options: TelegramSendOptions | undefined = inlineKeyboard.length > 0
      ? { reply_markup: { inline_keyboard: inlineKeyboard } }
      : undefined;

    await this.telegramClient.sendMessage(chatId, responseText, options);
  }
}
