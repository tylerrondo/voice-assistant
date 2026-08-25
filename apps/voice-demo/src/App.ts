import { SessionIdentity } from '../../../src/platform/dialogue-manager';

export class VoiceDemoApp {
  private runtime: any;
  private currentIdentity: SessionIdentity = { ownerId: 'demo-driver-001', sessionId: 'demo-session-001' };

  constructor(runtime: any) {
    this.runtime = runtime;
  }

  public async handleVoice(phrase: string) {
    return this.runtime.voiceChannel.handleIncomingVoice(phrase, this.currentIdentity);
  }

  public setIdentity(identity: SessionIdentity) {
    this.currentIdentity = identity;
  }
}

export function mountApp(runtime: any) {
  const app = new VoiceDemoApp(runtime);
  if (typeof window !== 'undefined') {
    (window as any).__VOICE_DEMO_APP__ = app;
  }
  return app;
}
