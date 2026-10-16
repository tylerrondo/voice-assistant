import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = readFileSync('playwright.config.ts', 'utf8');
assert.ok(
  config.includes("testIgnore: [/(?:^|\\/)(?:contract|e2e)\\/.*\\/tests\\//]"),
  'Playwright config must explicitly ignore nested copied test trees'
);

const ignoreCopied = /(?:^|\/)(?:contract|e2e)\/.*\/tests\//;
assert.equal(
  ignoreCopied.test('/repo/tests/contract/platform/tests/e2e/platform/dialogue-state.spec.ts'),
  true,
  'nested copied contract/e2e suite must be ignored'
);
assert.equal(
  ignoreCopied.test('/repo/tests/contract/platform/dialogue-state.spec.ts'),
  false,
  'canonical contract suite must remain discoverable'
);
assert.equal(
  ignoreCopied.test('/repo/tests/e2e/scenarios/sc-002-taxi-driver.spec.ts'),
  false,
  'canonical E2E suite must remain discoverable'
);
console.log('Playwright discovery config check passed.');
