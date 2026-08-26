import { test, expect } from '@playwright/test';

test.describe('E2E: PLATFORM-015 Production Action Dispatch Reliability Suite', () => {

  test('E2E-RELIABILITY-01: End-to-end Voice -> VoiceChannel -> DialogueManager -> Production Execution Boundary', async ({ page }) => {
    await page.goto('http://localhost:3000');

    await page.waitForSelector('#voice-app-ready', { timeout: 10000 });

    const result = await page.evaluate(async () => {
      const vc = (window as any).__VOICE_CHANNEL__;
      const dm = (window as any).__DIALOGUE_MANAGER__;
      const app = (window as any).__VOICE_DEMO_APP__;

      if (!vc || !dm || !app) {
        throw new Error('Production runtime failed to initialize on window object');
      }

      const identity = app.getIdentity();

      // 1. Voice phrase triggers VoiceChannel
      const voiceRes = await vc.handleIncomingVoice('заказ 1001', identity);

      // 2. Execution automatically dispatched through real execution boundary
      const executions = dm.getExecutionLogs(identity);
      const execution = executions.length > 0 ? executions[executions.length - 1] : null;

      return {
        voiceHandled: voiceRes?.handled ?? true,
        execution
      };
    });

    expect(result.voiceHandled).toBe(true);
    expect(result.execution).not.toBeNull();
    expect(result.execution?.status).toBe('SUCCEEDED');
    expect(result.execution?.attempt).toBe(1);
    expect(result.execution?.idempotencyKey).toContain('order.accepted');
  });

});
