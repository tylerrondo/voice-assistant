import { type ScenarioDefinition } from './voice-channel';
import {
  type TelegramDialogueAdapter,
  type TelegramInputMessage,
  type DialoguePresentation,
  type DialoguePresentationAction,
  type DialogueAdapterResult
} from './telegram-dialogue-adapter';
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

  // Safe encoding for callback data (handles values containing colons safely)
  public encodeCallbackData(slotName: string, slotValue: unknown): string {
    const encSlot = encodeURIComponent(slotName);
    const encVal = encodeURIComponent(typeof slotValue === 'object' ? JSON.stringify(slotValue) : String(slotValue));
    return `dialogue:${encSlot}:${encVal}`;
  }

  // Safe decoding of callback data
  public decodeCallbackData(data: string): { slotName: string; slotValue: unknown } | null {
    if (!data.startsWith('dialogue:')) return null;
    const parts = data.split(':');
    if (parts.length < 3) return null;

    const encSlot = parts[1];
    const encVal = parts.slice(2).join(':');

    const slotName = decodeURIComponent(encSlot);
    const rawVal = decodeURIComponent(encVal);

    let slotValue: unknown = rawVal;
    if (rawVal === 'true') slotValue = true;
    else if (rawVal === 'false') slotValue = false;
    else if (!isNaN(Number(rawVal)) && rawVal.trim() !== '') {
      slotValue = Number(rawVal);
    } else {
      try {
        const parsed = JSON.parse(rawVal);
        if (typeof parsed === 'object') slotValue = parsed;
      } catch {
        // preserve as string
      }
    }

    return { slotName, slotValue };
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

    // 1. Handle Callback Query
    if (update.callback_query) {
      await this.telegramClient.answerCallbackQuery(update.callback_query.id);

      const data = update.callback_query.data || '';
      let inputMessage: TelegramInputMessage;

      const decoded = this.decodeCallbackData(data);
      if (decoded) {
        inputMessage = {
          channel: 'button',
          button_payload: {
            slotName: decoded.slotName,
            slotValue: decoded.slotValue
          }
        };
      } else {
        inputMessage = {
          channel: 'button',
          raw_input: data
        };
      }

      const result = await this.dialogueAdapter.handleMessage(inputMessage, identity, activeScenario);
      await this.sendTelegramResponse(chatId, result?.presentation);
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
        await this.sendTelegramResponse(chatId, result?.presentation);
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
      await this.sendTelegramResponse(chatId, result?.presentation);
      return;
    }
  }

  public async sendTelegramResponse(chatId: string, presentation?: DialoguePresentation): Promise<void> {
    if (!presentation || !presentation.text) return;

    let options: TelegramSendOptions | undefined;

    // Render actions into inline keyboard purely from presentation actions
    if (presentation.actions && presentation.actions.length > 0) {
      const inlineKeyboard: TelegramInlineButton[][] = presentation.actions.map(row =>
        row.map(action => ({
          text: action.label,
          callback_data: this.encodeCallbackData(action.payload.slotName, action.payload.slotValue)
        }))
      );

      options = {
        reply_markup: {
          inline_keyboard: inlineKeyboard
        }
      };
    }

    await this.telegramClient.sendMessage(chatId, presentation.text, options);
  }
}
