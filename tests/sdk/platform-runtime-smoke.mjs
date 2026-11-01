import assert from 'node:assert/strict';
import { DialogueStateManager, VoiceChannel } from '../../packages/platform-runtime/dist/packages/platform-runtime/index.js';
import { BrowserRecognitionProvider } from '../../packages/voice/dist/browser/index.js';
import { VoiceChannel as TransportVoiceChannel } from '../../packages/voice/dist/channel/index.js';

const manager = new DialogueStateManager({ enableAutoExpiryScheduler: false });
const channel = new VoiceChannel(manager);
assert.equal(typeof manager.getExecutionLogs, 'function');
assert.equal(typeof channel.registerScenarioSet, 'function');
assert.equal(typeof channel.handleIncomingVoice, 'function');
assert.equal(typeof BrowserRecognitionProvider, 'function');
assert.equal(typeof TransportVoiceChannel, 'function');
console.log('platform-runtime SDK smoke: PASS');
