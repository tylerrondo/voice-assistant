import { DialogueStateManager } from '../../../src/platform/dialogue-manager';
import { VoiceChannel } from '../../../src/platform/voice-channel';

export interface AppRuntimeContext {
  dialogueManager: DialogueStateManager;
  voiceChannel: VoiceChannel;
  emulator: any;
}

export function createProductionRuntime(emulatorInstance?: any): AppRuntimeContext {
  // 1. Create production DialogueStateManager with Action Dispatch connected to Emulator / FSM
  const dialogueManager = new DialogueStateManager({
    defaultTtlMs: 300000,
    enableAutoExpiryScheduler: true,
    onActionDispatch: (event, ctx) => {
      console.log(`[ACTION_DISPATCH] Dispatching event "${event.type}" for context ${ctx.contextId}:`, event.payload);
      if (emulatorInstance && typeof emulatorInstance.dispatch === 'function') {
        emulatorInstance.dispatch(event.type, event.payload);
      } else if (emulatorInstance && typeof emulatorInstance.emit === 'function') {
        emulatorInstance.emit(event.type, event.payload);
      }
    }
  });

  // 2. Create production VoiceChannel wrapping DialogueStateManager
  const voiceChannel = new VoiceChannel(dialogueManager);

  // 3. Expose strictly identical production instances on window for UI and E2E access
  if (typeof window !== 'undefined') {
    (window as any).__DIALOGUE_MANAGER__ = dialogueManager;
    (window as any).__VOICE_CHANNEL__ = voiceChannel;
    (window as any).__SCENARIO_ENGINE__ = {
      getActiveScenarioSetId: () => voiceChannel.getActiveScenarioSetId(),
      registerScenarioSet: (set: any) => voiceChannel.registerScenarioSet(set)
    };
  }

  return {
    dialogueManager,
    voiceChannel,
    emulator: emulatorInstance
  };
}
