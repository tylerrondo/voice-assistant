import { createProductionRuntime, AppRuntimeContext } from './Bootstrap';

export class VoiceDemoApp {
  public runtime: AppRuntimeContext;
  private container: HTMLElement;

  constructor(container: HTMLElement, emulatorInstance?: any) {
    this.container = container;
    this.runtime = createProductionRuntime(emulatorInstance);
    this.initUI();
  }

  public loadScenarioSet(scenarioSet: any): void {
    this.runtime.voiceChannel.registerScenarioSet(scenarioSet);
  }

  public async processVoiceInput(text: string): Promise<any> {
    return this.runtime.voiceChannel.handleIncomingVoice(text);
  }

  private initUI(): void {
    if (!this.container) return;
    this.container.innerHTML = `
      <div id="voice-demo-root" class="voice-app-container">
        <h2>Voice Assistant Production Runtime</h2>
        <div id="status-indicator">Ready</div>
        <input type="file" id="scenario-loader" accept=".json" />
      </div>
    `;

    const fileInput = this.container.querySelector('#scenario-loader') as HTMLInputElement;
    if (fileInput) {
      fileInput.addEventListener('change', async (e: any) => {
        const file = e.target.files?.[0];
        if (file) {
          const text = await file.text();
          try {
            const scenarioSet = JSON.parse(text);
            this.loadScenarioSet(scenarioSet);
          } catch (err) {
            console.error('Failed to parse ScenarioSet JSON:', err);
          }
        }
      });
    }
  }
}
