import { type SpeechToTextProvider, type STTResult, type STTOptions } from './stt-provider';

export interface TelegramFileMetadata {
  fileId: string;
  filePath: string;
  mimeType?: string;
  fileSize?: number;
}

export interface TelegramFileProvider {
  getFile(fileId: string): Promise<TelegramFileMetadata>;
  downloadFile(filePath: string): Promise<Buffer>;
}

export interface TelegramVoiceMessage {
  fileId?: string;
  fileBuffer?: Buffer;
  mimeType?: string;
  durationSeconds?: number;
}

export interface VoiceTransportResult {
  status: 'TRANSCRIPTION_SUCCESS' | 'IGNORED_EMPTY_TRANSCRIPT' | 'TRANSPORT_ERROR';
  transcript?: string;
  confidence?: number;
  error?: string;
  mimeType?: string;
  format?: 'ogg' | 'mp3' | 'wav';
  normalizedInput?: {
    channel: 'voice';
    transcript: string;
  };
}

export class TelegramVoiceTransport {
  private sttProvider: SpeechToTextProvider;
  private fileProvider?: TelegramFileProvider;

  constructor(sttProvider: SpeechToTextProvider, fileProvider?: TelegramFileProvider) {
    this.sttProvider = sttProvider;
    this.fileProvider = fileProvider;
  }

  public setSTTProvider(sttProvider: SpeechToTextProvider): void {
    this.sttProvider = sttProvider;
  }

  public setFileProvider(fileProvider: TelegramFileProvider): void {
    this.fileProvider = fileProvider;
  }

  public mapMimeToFormat(mimeType?: string): 'ogg' | 'mp3' | 'wav' {
    if (!mimeType) return 'ogg';
    const lower = mimeType.toLowerCase();
    if (lower.includes('ogg') || lower.includes('opus')) return 'ogg';
    if (lower.includes('mp3') || lower.includes('mpeg')) return 'mp3';
    if (lower.includes('wav')) return 'wav';
    return 'ogg';
  }

  public async processVoiceMessage(message: TelegramVoiceMessage): Promise<VoiceTransportResult> {
    try {
      let audioBuffer: Buffer;
      let effectiveMime = message.mimeType;

      // 1. Resolve & Download Telegram file if fileId is provided
      if (message.fileId) {
        if (!this.fileProvider) {
          return {
            status: 'TRANSPORT_ERROR',
            error: 'TELEGRAM_FILE_PROVIDER_NOT_CONFIGURED'
          };
        }

        const fileMeta = await this.fileProvider.getFile(message.fileId);
        effectiveMime = fileMeta.mimeType || effectiveMime || 'audio/ogg';

        audioBuffer = await this.fileProvider.downloadFile(fileMeta.filePath);
      } else if (message.fileBuffer) {
        audioBuffer = message.fileBuffer;
      } else {
        return {
          status: 'TRANSPORT_ERROR',
          error: 'MISSING_VOICE_FILE_PAYLOAD'
        };
      }

      // 2. Normalize audio MIME into STT format
      const targetFormat = this.mapMimeToFormat(effectiveMime);

      // 3. Delegate pure audio to STT Provider
      const sttResult: STTResult = await this.sttProvider.transcribe(audioBuffer, {
        format: targetFormat
      });

      const trimmedText = sttResult.text ? sttResult.text.trim() : '';

      if (!trimmedText) {
        return {
          status: 'IGNORED_EMPTY_TRANSCRIPT',
          transcript: '',
          confidence: sttResult.confidence ?? 0,
          mimeType: effectiveMime,
          format: targetFormat
        };
      }

      return {
        status: 'TRANSCRIPTION_SUCCESS',
        transcript: trimmedText,
        confidence: sttResult.confidence ?? 1.0,
        mimeType: effectiveMime,
        format: targetFormat,
        normalizedInput: {
          channel: 'voice',
          transcript: trimmedText
        }
      };
    } catch (err: any) {
      return {
        status: 'TRANSPORT_ERROR',
        error: err?.message || 'TELEGRAM_VOICE_TRANSPORT_FAILED'
      };
    }
  }
}
