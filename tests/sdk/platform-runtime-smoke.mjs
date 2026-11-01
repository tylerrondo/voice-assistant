import assert from 'node:assert/strict';
import { DialogueStateManager, VoiceChannel } from '../../packages/platform-runtime/dist/packages/platform-runtime/index.js';

const manager = new DialogueStateManager({ enableAutoExpiryScheduler: false });
const channel = new VoiceChannel(manager);
assert.equal(typeof manager.getExecutionLogs, 'function');
assert.equal(typeof channel.registerScenarioSet, 'function');
assert.equal(typeof channel.handleIncomingVoice, 'function');
console.log('platform-runtime SDK smoke: PASS');
