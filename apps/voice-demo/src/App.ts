import { SessionIdentity } from '../../../src/platform/dialogue-manager';

export class VoiceDemoApp {
  public runtime: any;
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

export function mountApp(root: HTMLElement, runtime: any) {
  const app = new VoiceDemoApp(runtime);
  if (root) {
    root.innerHTML = `<div id="voice-app-ready" style="padding: 16px; font-family: sans-serif;">
      <h2>Voice Platform Production Runtime Ready</h2>
      <input type="file" id="scenario-file-input" style="display: block; margin: 8px 0;" />
    </div>`;
  }
  if (typeof window !== 'undefined') {
    (window as any).__VOICE_DEMO_APP__ = app;
  }
  return app;
}
