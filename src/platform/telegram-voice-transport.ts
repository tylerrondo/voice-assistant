import { type SpeechToTextProvider, type STTResult } from './stt-provider';

export interface TelegramVoiceMessage {
  fileId?: string;
  fileBuffer: Buffer;
  mimeType?: string;
  durationSeconds?: number;
}

export interface VoiceTransportResult {
  status: 'TRANSCRIPTION_SUCCESS' | 'IGNORED_EMPTY_TRANSCRIPT' | 'TRANSPORT_ERROR';
  transcript?: string;
  confidence?: number;
  error?: string;
  normalizedInput?: {
    channel: 'voice';
    transcript: string;
  };
}

export class TelegramVoiceTransport {
  private sttProvider: SpeechToTextProvider;

  constructor(sttProvider: SpeechToTextProvider) {
    this.sttProvider = sttProvider;
  }

  public setSTTProvider(sttProvider: SpeechToTextProvider): void {
    this.sttProvider = sttProvider;
  }

  public async processVoiceMessage(message: TelegramVoiceMessage): Promise<VoiceTransportResult> {
    try {
      const sttResult: STTResult = await this.sttProvider.transcribe(message.fileBuffer, {
        format: 'ogg'
      });

      const trimmedText = sttResult.text ? sttResult.text.trim() : '';

      if (!trimmedText) {
        return {
          status: 'IGNORED_EMPTY_TRANSCRIPT',
          transcript: '',
          confidence: sttResult.confidence ?? 0
        };
      }

      return {
        status: 'TRANSCRIPTION_SUCCESS',
        transcript: trimmedText,
        confidence: sttResult.confidence ?? 1.0,
        normalizedInput: {
          channel: 'voice',
          transcript: trimmedText
        }
      };
    } catch (err: any) {
      return {
        status: 'TRANSPORT_ERROR',
        error: err?.message || 'STT_TRANSLATION_FAILED'
      };
    }
  }
}
