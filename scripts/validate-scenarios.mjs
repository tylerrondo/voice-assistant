import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = fs.readdirSync(root).filter((name) => /^scenario-.*\.json$/.test(name));
const errors = [];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

for (const name of files) {
  const fullPath = path.join(root, name);
  try {
    const value = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    if (!isRecord(value)) throw new Error('root must be a JSON object');

    // Current repository contains two supported fixture shapes:
    // 1. ScenarioSet: { id, scenarios: [{ id, activation, steps, ... }] }
    // 2. A single scenario or legacy fixture with its own fields.
    // Do not require "intent": legacy executable scenarios use activation/steps.
    if (Array.isArray(value.scenarios)) {
      if (typeof value.id !== 'string' || value.id.trim() === '') {
        throw new Error('ScenarioSet.id is required');
      }

      const ids = new Set();
      for (const [index, scenario] of value.scenarios.entries()) {
        if (!isRecord(scenario)) {
          throw new Error(`scenarios[${index}] must be an object`);
        }
        if (typeof scenario.id !== 'string' || scenario.id.trim() === '') {
          throw new Error(`scenarios[${index}].id is required`);
        }
        if (ids.has(scenario.id)) {
          throw new Error(`duplicate scenario id: ${scenario.id}`);
        }
        ids.add(scenario.id);

        if (scenario.intent !== undefined &&
            (typeof scenario.intent !== 'string' || scenario.intent.trim() === '')) {
          throw new Error(`scenarios[${index}].intent must be a non-empty string when present`);
        }
        if (scenario.steps !== undefined && !Array.isArray(scenario.steps)) {
          throw new Error(`scenarios[${index}].steps must be an array when present`);
        }
        if (scenario.activation !== undefined && !isRecord(scenario.activation)) {
          throw new Error(`scenarios[${index}].activation must be an object when present`);
        }
      }
    } else {
      // Validate common single-scenario identifiers when the fixture uses that shape,
      // without imposing the ScenarioSet schema on unrelated JSON fixtures.
      if (value.id !== undefined &&
          (typeof value.id !== 'string' || value.id.trim() === '')) {
        throw new Error('id must be a non-empty string when present');
      }
      if (value.steps !== undefined && !Array.isArray(value.steps)) {
        throw new Error('steps must be an array when present');
      }
    }
  } catch (error) {
    errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (errors.length) {
  console.error('Scenario JSON validation failed:\\n' + errors.map((error) => `- ${error}`).join('\\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${files.length} scenario JSON files.`);
}
