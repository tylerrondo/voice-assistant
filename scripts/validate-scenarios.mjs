import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = fs.readdirSync(root).filter((name) => /^scenario-.*\\.json$/.test(name));
const errors = [];
for (const name of files) {
  const fullPath = path.join(root, name);
  try {
    const value = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('root must be a JSON object');
    if (Array.isArray(value.scenarios)) {
      if (typeof value.id !== 'string' || !value.id) throw new Error('ScenarioSet.id is required');
      const ids = new Set();
      for (const [index, scenario] of value.scenarios.entries()) {
        if (!scenario || typeof scenario.id !== 'string' || !scenario.id) throw new Error(`scenarios[${index}].id is required`);
        if (ids.has(scenario.id)) throw new Error(`duplicate scenario id: ${scenario.id}`);
        ids.add(scenario.id);
        if (typeof scenario.intent !== 'string' || !scenario.intent) throw new Error(`scenarios[${index}].intent is required`);
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
