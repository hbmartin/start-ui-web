/* eslint-disable security/detect-non-literal-fs-filename -- Fitness CLI writes validated repo-local reports and creates temporary git worktrees. */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectFitnessReport } from './collect-fitness-report';
import { evaluateRatchet } from './evaluate-ratchet';
import { formatRatchetMarkdown } from './format-fitness-report';
import type { FitnessReport } from './report-schema';
import {
  writeFitnessArtifacts,
  writeRatchetArtifacts,
} from './write-fitness-artifacts';
import { resolveTrustedTool } from '../trusted-tool';

type Command = 'agent' | 'collect' | 'quick' | 'ratchet';
type ValueOption =
  | '--affected-base'
  | '--base'
  | '--output-dir'
  | '--summary-file';

type CliOptions = {
  affectedBase?: string;
  base?: string;
  command?: Command;
  help: boolean;
  outputDir?: string;
  summaryFile?: string;
};

type ParseResult =
  | { ok: true; options: CliOptions }
  | { error: string; ok: false };
type ParseArgumentResult = { ok: true } | { error: string; ok: false };

export const USAGE = `Usage: pnpm exec tsx scripts/fitness/fitness-cli.ts <command> [options]

Commands:
  collect              Write JSON, Markdown, and SARIF fitness reports
  quick                Write reports and fail on zero-tolerance findings
  ratchet --base <sha> Compare current metrics against a base revision
  agent                Emit a blocking/approval JSON object for agent hooks

Options:
  --base <sha>         Base revision for ratchet mode
  --affected-base <sha> Base revision used for affected-test amplification
  --output-dir <path>  Output directory under test-results/fitness
  --summary-file <path> Append ratchet Markdown summary to this file
  --help              Show this help message`;

const COMMANDS = new Set<Command>(['agent', 'collect', 'quick', 'ratchet']);

const isCommand = (value: string): value is Command =>
  COMMANDS.has(value as Command);

const parseValueOption = (remainingArgs: string[], optionName: string) => {
  const value = remainingArgs.shift();
  if (!value || value === '--' || value.startsWith('--')) {
    return { error: `Missing value for ${optionName}.`, ok: false as const };
  }

  return { ok: true as const, value };
};

const isValueOption = (value: string): value is ValueOption =>
  value === '--base' ||
  value === '--affected-base' ||
  value === '--output-dir' ||
  value === '--summary-file';

const applyValueOption = (
  options: CliOptions,
  optionName: ValueOption,
  value: string
) => {
  switch (optionName) {
    case '--affected-base':
      options.affectedBase = value;
      break;
    case '--base':
      options.base = value;
      break;
    case '--output-dir':
      options.outputDir = value;
      break;
    case '--summary-file':
      options.summaryFile = value;
      break;
  }
};

const parseNextArgument = (
  arg: string,
  remainingArgs: string[],
  options: CliOptions
): ParseArgumentResult => {
  if (arg === '--') return { ok: true };

  if (isCommand(arg) && !options.command) {
    options.command = arg;
    return { ok: true };
  }

  if (arg === '--help') {
    options.help = true;
    return { ok: true };
  }

  if (!isValueOption(arg)) {
    return { error: `Unknown option or command: ${arg}`, ok: false };
  }

  const parsed = parseValueOption(remainingArgs, arg);
  if (!parsed.ok) return { error: parsed.error, ok: false };

  applyValueOption(options, arg, parsed.value);
  return { ok: true };
};

export const parseCliArguments = (args: string[]): ParseResult => {
  const options: CliOptions = { help: false };
  const remainingArgs = [...args];

  while (remainingArgs.length > 0) {
    const arg = remainingArgs.shift();
    if (!arg) continue;

    const parsed = parseNextArgument(arg, remainingArgs, options);
    if (!parsed.ok) return parsed;
  }

  if (!options.command && !options.help) {
    return { error: 'Missing command.', ok: false };
  }

  if (options.command === 'ratchet' && !options.base) {
    return { error: 'ratchet requires --base <sha>.', ok: false };
  }

  return { ok: true, options };
};

const hasBlockingFindings = (report: FitnessReport) =>
  report.findings.some(
    (finding) => finding.zeroTolerance && finding.level === 'error'
  ) || report.scores.policyScore < 100;

const defaultOutputDirForCommand = (command: Command) =>
  path.join('test-results', 'fitness', command);

const collectAndWrite = async ({
  affectedBase,
  cwd,
  outputDir,
}: {
  affectedBase?: string;
  cwd: string;
  outputDir: string;
}) => {
  const report = await collectFitnessReport({ affectedBase, cwd });
  const artifacts = writeFitnessArtifacts({ cwd, outputDir, report });
  return { artifacts, report };
};

const runGit = (cwd: string, args: string[]) =>
  spawnSync(resolveTrustedTool('git'), args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const ensureNodeModulesLink = (sourceCwd: string, targetCwd: string) => {
  const source = path.join(sourceCwd, 'node_modules');
  const target = path.join(targetCwd, 'node_modules');
  if (!fs.existsSync(source) || fs.existsSync(target)) return;

  fs.symlinkSync(source, target, 'dir');
};

const withBaseWorktree = async <T>({
  base,
  cwd,
  run,
}: {
  base: string;
  cwd: string;
  run: (baseCwd: string) => Promise<T>;
}) => {
  const tempParent = fs.mkdtempSync(path.join(os.tmpdir(), 'fitness-base-'));
  const baseCwd = path.join(tempParent, 'worktree');
  const addResult = runGit(cwd, [
    'worktree',
    'add',
    '--detach',
    '--quiet',
    baseCwd,
    base,
  ]);

  if (addResult.status !== 0 || addResult.error) {
    fs.rmSync(tempParent, { force: true, recursive: true });
    throw new Error(
      `Unable to create base worktree for ${base}: ${
        addResult.stderr.trim() || addResult.error?.message || 'unknown error'
      }`
    );
  }

  try {
    ensureNodeModulesLink(cwd, baseCwd);
    return await run(baseCwd);
  } finally {
    runGit(cwd, ['worktree', 'remove', '--force', baseCwd]);
    fs.rmSync(tempParent, { force: true, recursive: true });
  }
};

const appendSummaryFile = (
  summaryFile: string | undefined,
  content: string
) => {
  if (!summaryFile) return;

  fs.mkdirSync(path.dirname(path.resolve(summaryFile)), { recursive: true });
  fs.appendFileSync(summaryFile, `${content}\n`, 'utf8');
};

type MainIo = {
  stderr: (message: string) => void;
  stdout: (message: string) => void;
};

const runRatchetCommand = async ({
  cwd,
  options,
  stderr,
  stdout,
}: {
  cwd: string;
  options: CliOptions;
} & MainIo) => {
  const outputDir = options.outputDir ?? defaultOutputDirForCommand('ratchet');
  const base = options.base;

  if (!base) {
    stderr('ratchet requires --base <sha>.\n');
    return 2;
  }

  try {
    const current = await collectAndWrite({
      affectedBase: options.affectedBase ?? base,
      cwd,
      outputDir: path.join(outputDir, 'current'),
    });
    const baseResult = await withBaseWorktree({
      base,
      cwd,
      run: async (baseCwd) => {
        const report = await collectFitnessReport({ cwd: baseCwd });
        const artifacts = writeFitnessArtifacts({
          cwd,
          outputDir: path.join(outputDir, 'base'),
          report,
        });
        return { artifacts, report };
      },
    });
    const ratchetReport = evaluateRatchet({
      base: baseResult.report,
      current: current.report,
    });
    const ratchetArtifacts = writeRatchetArtifacts({
      cwd,
      outputDir,
      report: ratchetReport,
    });

    appendSummaryFile(
      options.summaryFile,
      formatRatchetMarkdown(ratchetReport)
    );
    stdout(`Fitness ratchet report: ${ratchetArtifacts.markdownPath}\n`);

    return ratchetReport.decisions.some((decision) => decision.blocked) ? 1 : 0;
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
};

const writeAgentDecision = ({
  artifacts,
  blocked,
  report,
  stdout,
}: {
  artifacts: ReturnType<typeof writeFitnessArtifacts>;
  blocked: boolean;
  report: FitnessReport;
  stdout: (message: string) => void;
}) => {
  stdout(
    `${JSON.stringify({
      decision: blocked ? 'block' : 'approve',
      reason: blocked
        ? `Fitness policy failed with score ${report.scores.policyScore}. See ${artifacts.markdownPath}.`
        : `Fitness policy passed. See ${artifacts.markdownPath}.`,
      reportPath: artifacts.jsonPath,
    })}\n`
  );
};

const runReportCommand = async ({
  command,
  cwd,
  options,
  stdout,
}: {
  command: Exclude<Command, 'ratchet'>;
  cwd: string;
  options: CliOptions;
  stdout: (message: string) => void;
}) => {
  const outputDir = options.outputDir ?? defaultOutputDirForCommand(command);
  const { artifacts, report } = await collectAndWrite({
    affectedBase: options.affectedBase,
    cwd,
    outputDir,
  });
  const blocked = hasBlockingFindings(report);

  if (command === 'agent') {
    writeAgentDecision({ artifacts, blocked, report, stdout });
    return blocked ? 1 : 0;
  }

  stdout(`Fitness report: ${artifacts.markdownPath}\n`);
  return command === 'quick' && blocked ? 1 : 0;
};

export const main = async (
  args = process.argv.slice(2),
  {
    cwd = process.cwd(),
    stderr = (message) => process.stderr.write(message),
    stdout = (message) => process.stdout.write(message),
  }: {
    cwd?: string;
    stderr?: (message: string) => void;
    stdout?: (message: string) => void;
  } = {}
) => {
  const parsed = parseCliArguments(args);
  if (!parsed.ok) {
    stderr(`${parsed.error}\n${USAGE}\n`);
    return 2;
  }

  if (parsed.options.help) {
    stdout(`${USAGE}\n`);
    return 0;
  }

  const command = parsed.options.command;
  if (!command) {
    stderr(`Missing command.\n${USAGE}\n`);
    return 2;
  }

  return command === 'ratchet'
    ? runRatchetCommand({ cwd, options: parsed.options, stderr, stdout })
    : runReportCommand({ command, cwd, options: parsed.options, stdout });
};

const entryPointPath = process.argv[1]
  ? path.resolve(process.argv[1])
  : undefined;
const modulePath = fileURLToPath(import.meta.url);

export const isCliEntrypoint = (
  entryPoint: string | undefined,
  currentModule: string,
  platform: typeof process.platform = process.platform
) => {
  if (!entryPoint) return false;

  return platform === 'win32'
    ? entryPoint.toLowerCase() === currentModule.toLowerCase()
    : entryPoint === currentModule;
};

if (isCliEntrypoint(entryPointPath, modulePath)) {
  process.exitCode = await main();
}
