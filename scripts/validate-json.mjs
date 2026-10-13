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
  try {
    JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    failures++;
    console.error(`Invalid scenario JSON: ${relative(root, file)}`);
    console.error(`  ${error.message}`);
  }
}

if (failures > 0) {
  console.error(`Scenario JSON validation failed: ${failures} of ${scenarioFiles.length} files are invalid.`);
  process.exitCode = 1;
} else {
  console.log(`Scenario JSON validation passed: ${scenarioFiles.length} files checked.`);
}
