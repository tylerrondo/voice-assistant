#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  'playwright-report',
  'test-results'
]);
const scenarioFiles = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        walk(join(directory, entry.name));
      }
    } else if (entry.isFile() && entry.name.startsWith('scenario-') && entry.name.endsWith('.json')) {
      scenarioFiles.push(join(directory, entry.name));
    }
  }
}

walk(root);

let failures = 0;
for (const file of scenarioFiles.sort()) {
  const relativePath = relative(root, file);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    failures++;
    console.error(`Invalid scenario JSON: ${relativePath}`);
    console.error(`  ${error.message}`);
    continue;
  }

  // Some scenario-*.json files are fixtures rather than scenario sets.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('scenarios' in parsed)) {
    continue;
  }

  if (!Array.isArray(parsed.scenarios)) {
    failures++;
    console.error(`Invalid scenario structure: ${relativePath}`);
    console.error('  Expected "scenarios" to be an array.');
    continue;
  }

  const firstIndexById = new Map();
  for (let index = 0; index < parsed.scenarios.length; index++) {
    const scenario = parsed.scenarios[index];
    if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) {
      failures++;
      console.error(`Invalid scenario entry: ${relativePath}`);
      console.error(`  scenarios[${index}] must be an object with a non-empty string ID.`);
      continue;
    }

    if (typeof scenario.id !== 'string' || scenario.id.trim() === '') {
      failures++;
      console.error(`Invalid scenario ID: ${relativePath}`);
      console.error(`  scenarios[${index}].id must be a non-empty string.`);
      continue;
    }

    const id = scenario.id.trim();
    const previousIndex = firstIndexById.get(id);
    if (previousIndex !== undefined) {
      failures++;
      console.error(`Duplicate scenario ID: ${relativePath}`);
      console.error(`  "${id}" at scenarios[${index}] duplicates scenarios[${previousIndex}].`);
    } else {
      firstIndexById.set(id, index);
    }
  }
}

if (failures > 0) {
  console.error(`Scenario JSON validation failed: ${failures} issue(s) across ${scenarioFiles.length} files.`);
  process.exitCode = 1;
} else {
  console.log(`Scenario JSON validation passed: ${scenarioFiles.length} files checked, including scenario structure and ID checks.`);
}
