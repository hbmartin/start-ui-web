#!/usr/bin/env node
/**
 * Runs `sheriff verify` and records a machine-readable violation count to
 * test-results/fitness/sheriff.json, which the fitness collector ingests as a
 * Layer-1 signal. Read-only; always exits 0 (the fitness ratchet decides
 * whether NEW violations should fail CI). Run `sheriff verify` directly for the
 * hard, human-facing gate.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { resolveTrustedProjectBin } from '../lib/trusted-tool.mjs';

const cwd = process.cwd();
const result = spawnSync(resolveTrustedProjectBin('sheriff', cwd), ['verify'], {
  cwd,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
const passed = result.status === 0;
const matched =
  output.match(/not allowed|is forbidden|violation/gi)?.length ?? 0;
const violations = passed ? 0 : Math.max(matched, 1);

mkdirSync(path.resolve(cwd, 'test-results/fitness'), { recursive: true });
writeFileSync(
  path.resolve(cwd, 'test-results/fitness/sheriff.json'),
  `${JSON.stringify({ passed, violations, exitCode: result.status ?? null }, null, 2)}\n`,
  'utf8'
);
process.stdout.write(
  `Sheriff: ${violations} violation(s) (passed=${passed}).\n`
);
process.exit(0);
