import { SessionIdentity } from '../../../src/platform/dialogue-manager';

export class VoiceDemoApp {
  public runtime: any;
  private currentIdentity: SessionIdentity;

  constructor(runtime: any, initialIdentity?: SessionIdentity) {
    this.runtime = runtime;
    // Production session identity or authenticated session default
    this.currentIdentity = initialIdentity || {
      ownerId: (typeof window !== 'undefined' && (window as any).__AUTH_OWNER_ID__) || 'driver-001',
      sessionId: (typeof window !== 'undefined' && (window as any).__AUTH_SESSION_ID__) || 'session-prod-001'
    };
  }

  public async handleVoice(phrase: string, identityOverride?: SessionIdentity) {
    const identity = identityOverride || this.currentIdentity;
    return this.runtime.voiceChannel.handleIncomingVoice(phrase, identity);
  }

  public setIdentity(identity: SessionIdentity) {
    this.currentIdentity = identity;
  }

  public getIdentity(): SessionIdentity {
    return this.currentIdentity;
  }
}

export function mountApp(root: HTMLElement, runtime: any, initialIdentity?: SessionIdentity) {
  const app = new VoiceDemoApp(runtime, initialIdentity);
  if (root) {
    root.innerHTML = `<div id="voice-app-ready" style="padding: 16px; font-family: sans-serif;">
      <h2>Voice Platform Production Runtime Ready</h2>
      <div id="runtime-status">DISPATCHER: ACTIVE</div>
    </div>`;
  }
  if (typeof window !== 'undefined') {
    (window as any).__VOICE_DEMO_APP__ = app;
  }
  return app;
}
