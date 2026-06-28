#!/usr/bin/env node
/**
 * Claude Code architecture guardrail hook (read-only).
 *
 * Wired in `.claude/settings.json` as a PostToolUse (Write|Edit) and Stop hook.
 * Instruction files (AGENTS.md / CLAUDE.md) are advisory; this hook makes the
 * hexagonal boundaries mechanically enforced for coding agents: on failure it
 * prints `{"decision":"block","reason":...}` so the agent iterates until clean.
 *
 * - PostToolUse: only acts on *.ts/*.tsx edits under src/; runs dependency-cruiser
 *   (the authoritative, fast boundary check).
 * - Stop: runs dependency-cruiser + the Vitest architecture suite.
 *
 * Always exits 0; blocking is signalled purely via the JSON `decision` field.
 * Fails OPEN (never blocks) if a tool cannot be spawned, to avoid wedging the
 * agent on an environment problem.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { resolveTrustedProjectBin } from '../lib/trusted-tool.mjs';

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return chunks.join('');
};

const getEvent = (argv, payload) => {
  const flagIndex = argv.indexOf('--event');
  if (flagIndex !== -1 && argv[flagIndex + 1]) return argv[flagIndex + 1];
  return (payload.hook_event_name ?? '').toLowerCase().includes('stop')
    ? 'stop'
    : 'post-tool-use';
};

const block = (reason) => {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
};

const runTool = (bin, args, cwd) => {
  try {
    const command = resolveTrustedProjectBin(bin, cwd);
    const result = spawnSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.error) return { ok: true, output: '' }; // fail open
    return {
      ok: result.status === 0,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
    };
  } catch {
    return { ok: true, output: '' }; // fail open
  }
};

const truncate = (text, max = 4000) =>
  text.length > max ? `${text.slice(0, max)}\n…(truncated)` : text;

const main = async () => {
  const cwd = process.cwd();
  let payload = {};
  try {
    payload = JSON.parse((await readStdin()) || '{}');
  } catch {
    payload = {};
  }

  const event = getEvent(process.argv.slice(2), payload);

  if (event === 'post-tool-use') {
    const filePath = payload.tool_input?.file_path ?? '';
    const relative = filePath.startsWith(cwd)
      ? path.relative(cwd, filePath)
      : filePath;
    const isModuleTs = /^src\/.*\.(ts|tsx)$/.test(
      relative.replaceAll('\\', '/')
    );
    if (!isModuleTs) process.exit(0);

    const depcruise = runTool(
      'depcruise',
      ['--config', '.dependency-cruiser.cjs', '--output-type', 'err', 'src'],
      cwd
    );
    if (!depcruise.ok) {
      block(
        `Architecture boundary violations detected by dependency-cruiser after editing ${relative}. Fix the flagged imports (use module public gates / invert the dependency through a port) before continuing:\n\n${truncate(depcruise.output)}`
      );
    }
    process.exit(0);
  }

  // Stop event: full architecture gate at end of turn.
  const failures = [];
  const depcruise = runTool(
    'depcruise',
    ['--config', '.dependency-cruiser.cjs', '--output-type', 'err', 'src'],
    cwd
  );
  if (!depcruise.ok)
    failures.push(`dependency-cruiser:\n${truncate(depcruise.output)}`);

  const vitest = runTool(
    'vitest',
    ['run', '--project=unit', 'tests/architecture', '--reporter=dot'],
    cwd
  );
  if (!vitest.ok)
    failures.push(`architecture tests:\n${truncate(vitest.output)}`);

  if (failures.length > 0) {
    block(
      `Architecture checks are failing. Resolve these before finishing:\n\n${failures.join('\n\n')}`
    );
  }
  process.exit(0);
};

main().catch(() => process.exit(0));
