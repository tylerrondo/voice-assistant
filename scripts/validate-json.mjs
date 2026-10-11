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
const jsonFiles = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        walk(join(directory, entry.name));
      }
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      jsonFiles.push(join(directory, entry.name));
    }
  }
}

walk(root);

let failures = 0;
for (const file of jsonFiles.sort()) {
  try {
    JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    failures++;
    console.error(`Invalid JSON: ${relative(root, file)}`);
    console.error(`  ${error.message}`);
  }
}

if (failures > 0) {
  console.error(`JSON validation failed: ${failures} of ${jsonFiles.length} files are invalid.`);
  process.exitCode = 1;
} else {
  console.log(`JSON validation passed: ${jsonFiles.length} files checked.`);
}
