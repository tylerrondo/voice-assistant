import { DialogueStateManager, ActionDispatcher } from '../../../src/platform/dialogue-manager';
import { VoiceChannel } from '../../../src/platform/voice-channel';

export function initializeVoicePlatform(dispatcher?: ActionDispatcher) {
  const dialogueManager = new DialogueStateManager({
    maxActiveContexts: 50,
    defaultTtlMs: 300000,
    actionDispatcher: dispatcher || (async (event, ctx, exec) => {
      return { status: 'SUCCEEDED', executionId: exec.executionId, attempt: exec.attempt };
    })
  });

  const voiceChannel = new VoiceChannel(dialogueManager);

  if (typeof window !== 'undefined') {
    (window as any).__DIALOGUE_MANAGER__ = dialogueManager;
    (window as any).__VOICE_CHANNEL__ = voiceChannel;
  }

  return { dialogueManager, voiceChannel };
}
