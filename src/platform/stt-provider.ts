export interface STTOptions {
  language?: string;
  sampleRate?: number;
  format?: 'ogg' | 'mp3' | 'wav';
}

export interface STTResult {
  text: string;
  language?: string;
  confidence?: number;
}

export interface SpeechToTextProvider {
  transcribe(audio: Buffer, options?: STTOptions): Promise<STTResult>;
}

export class MockSTTProvider implements SpeechToTextProvider {
  private transcript: string;
  private confidence: number;
  private shouldFail: boolean;
  private failureError: Error;

  constructor(transcript: string = '', confidence: number = 1.0) {
    this.transcript = transcript;
    this.confidence = confidence;
    this.shouldFail = false;
    this.failureError = new Error('STT_UNAVAILABLE');
  }

  public setTranscript(transcript: string, confidence: number = 1.0): void {
    this.transcript = transcript;
    this.confidence = confidence;
    this.shouldFail = false;
  }

  public setFailure(err?: Error): void {
    this.shouldFail = true;
    if (err) this.failureError = err;
  }

  public async transcribe(audio: Buffer, options?: STTOptions): Promise<STTResult> {
    if (this.shouldFail) {
      throw this.failureError;
    }
    return {
      text: this.transcript,
      language: options?.language || 'ru',
      confidence: this.confidence
    };
  }
}
