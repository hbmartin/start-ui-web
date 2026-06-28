/**
 * Fitness evaluator CLI.
 *
 * Computes per-module evolvability metrics (coupling/abstractness/distance,
 * complexity, churn/hotspots), ingests existing Layer-1 signals, and aggregates
 * everything into `test-results/fitness/fitness-scorecard.{json,md}`.
 *
 * Modes (mirroring `architecture:graph:check`):
 *   (no flag)           compute + write the scorecard (report-only, exit 0)
 *   --check             compare against the committed baseline; exit 1 on a
 *                       hard regression (the CI gate). Implies --no-churn.
 *   --update-baseline   rewrite fitness/baseline.json from the current scorecard
 *
 * Other flags: --no-churn, --since <window>, --base <sha>, --help
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createModuleProject, groupSourceFilesByModule } from './lib/ast';
import { collectChurn } from './lib/churn';
import {
  computeModuleComplexity,
  computePerFileCognitive,
} from './lib/complexity';
import {
  computeCoupling,
  countModuleAbstractness,
  loadDependencyCruiserReportWithMetrics,
} from './lib/coupling';
import {
  readArchitectureSuiteSignal,
  readBundleSignal,
  readDependencyCruiserSignal,
  readDuplicationSignal,
  readSheriffSignal,
} from './lib/layer1';
import { discoverModules, groupModulePath } from './lib/module-classify';
import {
  assembleScorecard,
  DEFAULT_THRESHOLDS,
  evaluateRatchet,
  formatMarkdown,
  projectBaseline,
} from './lib/scorecard';
import type {
  Baseline,
  ComplexityMetrics,
  ModuleMetrics,
  Thresholds,
} from './lib/types';
import { listChangedFiles, resolveBase, runGit } from '../lib/git-utils.mjs';

const SCORECARD_DIR = 'test-results/fitness';
const BASELINE_FILE = 'fitness/baseline.json';
const THRESHOLDS_FILE = 'fitness/thresholds.json';
const DEFAULT_CHURN_WINDOW = '12 months ago';

const USAGE = `Usage: pnpm exec tsx scripts/fitness/collect-metrics.ts [options]

Options:
  --check              Compare against the committed baseline and gate on regressions
  --update-baseline    Rewrite fitness/baseline.json from the current metrics
  --no-churn           Skip git churn/hotspot collection (default under --check)
  --since <window>     Churn window (default: "12 months ago")
  --base <sha>         Base ref for new-code regression scoping
  --help               Show this help message`;

type CliOptions = {
  check: boolean;
  updateBaseline: boolean;
  noChurn: boolean;
  since: string;
  base: string | null;
  help: boolean;
};

const parseArgs = (args: string[]): CliOptions | { error: string } => {
  const options: CliOptions = {
    check: false,
    updateBaseline: false,
    noChurn: false,
    since: DEFAULT_CHURN_WINDOW,
    base: null,
    help: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === '--') continue;
    switch (arg) {
      case '--check':
        options.check = true;
        options.noChurn = true;
        break;
      case '--update-baseline':
        options.updateBaseline = true;
        break;
      case '--no-churn':
        options.noChurn = true;
        break;
      case '--help':
        options.help = true;
        break;
      case '--since': {
        const value = args[index + 1];
        if (!value || value.startsWith('--'))
          return { error: 'Missing value for --since.' };
        options.since = value;
        index += 1;
        break;
      }
      case '--base': {
        const value = args[index + 1];
        if (!value || value.startsWith('--'))
          return { error: 'Missing value for --base.' };
        options.base = value;
        index += 1;
        break;
      }
      default:
        return { error: `Unknown option: ${arg}` };
    }
  }
  return options;
};

const readDepcruiseVersion = (cwd: string): string => {
  try {
    const pkg = JSON.parse(
      readFileSync(
        path.resolve(cwd, 'node_modules/dependency-cruiser/package.json'),
        'utf8'
      )
    ) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
};

const emptyComplexity = (): ComplexityMetrics => ({
  cyclomatic: { max: 0, mean: 0, p90: 0 },
  cognitive: { max: 0, mean: 0, p90: 0 },
  files: 0,
  functions: 0,
});

const loadJsonFile = <T>(filePath: string): T | undefined => {
  if (!existsSync(filePath)) return undefined;
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
};

export const main = async (
  args = process.argv.slice(2),
  {
    cwd = process.cwd(),
    stdout = (message: string) => process.stdout.write(message),
    stderr = (message: string) => process.stderr.write(message),
    now = () => new Date().toISOString(),
  }: {
    cwd?: string;
    stdout?: (message: string) => void;
    stderr?: (message: string) => void;
    now?: () => string;
  } = {}
): Promise<number> => {
  const parsed = parseArgs(args);
  if ('error' in parsed) {
    stderr(`${parsed.error}\n${USAGE}\n`);
    return 2;
  }
  if (parsed.help) {
    stdout(`${USAGE}\n`);
    return 0;
  }

  const warnings: string[] = [];
  const modules = discoverModules(cwd);

  // --- coupling + abstractness ---
  const output = await loadDependencyCruiserReportWithMetrics(cwd);
  const project = createModuleProject(cwd);
  const abstractnessGroups = groupSourceFilesByModule(project, cwd, {
    includePresentationTsx: false,
  });
  const allGroups = groupSourceFilesByModule(project, cwd, {
    includePresentationTsx: true,
  });

  const abstractnessByModule = new Map<
    string,
    { abstractTypes: number; concreteTypes: number }
  >();
  for (const moduleName of modules) {
    abstractnessByModule.set(
      moduleName,
      countModuleAbstractness(abstractnessGroups.get(moduleName) ?? [])
    );
  }

  const coupling = computeCoupling(output, abstractnessByModule, modules);
  warnings.push(...coupling.warnings);

  // --- complexity (over all module files incl. presentation) ---
  const complexityByModule = new Map<string, ComplexityMetrics>();
  for (const moduleName of modules) {
    const files = allGroups.get(moduleName) ?? [];
    complexityByModule.set(
      moduleName,
      files.length > 0 ? computeModuleComplexity(files) : emptyComplexity()
    );
  }

  // --- churn / hotspots ---
  let churnMetrics = new Map<string, import('./lib/types').ChurnMetrics>();
  if (!parsed.noChurn) {
    const cognitiveByFile = computePerFileCognitive(
      [...allGroups.values()].flat(),
      cwd
    );
    const churn = collectChurn({
      window: parsed.since,
      modules,
      cognitiveByFile,
    });
    churnMetrics = churn.metrics;
    warnings.push(...churn.warnings);
  }

  const moduleMetrics: Record<string, ModuleMetrics> = {};
  for (const moduleName of modules) {
    const couplingMetrics = coupling.metrics.get(moduleName);
    if (!couplingMetrics) continue;
    const churn = churnMetrics.get(moduleName);
    moduleMetrics[moduleName] = {
      coupling: couplingMetrics,
      complexity: complexityByModule.get(moduleName) ?? emptyComplexity(),
      ...(churn ? { churn } : {}),
    };
  }

  // --- Layer-1 signals ---
  const signals = {
    dependencyCruiser: readDependencyCruiserSignal(cwd),
    architectureSuite: readArchitectureSuiteSignal(cwd),
    duplication: readDuplicationSignal(cwd),
    bundle: readBundleSignal(cwd),
    sheriff: readSheriffSignal(cwd),
  };

  const base = parsed.base ?? (parsed.check ? resolveBase() : null);
  const scorecard = assembleScorecard({
    modules: moduleMetrics,
    signals,
    warnings,
    commit: runGit(['rev-parse', 'HEAD']),
    base: base === 'HEAD' ? null : base,
    dependencyCruiserVersion: readDepcruiseVersion(cwd),
    generatedAt: now(),
  });

  // --- update-baseline mode ---
  if (parsed.updateBaseline) {
    mkdirSync(path.resolve(cwd, 'fitness'), { recursive: true });
    writeFileSync(
      path.resolve(cwd, BASELINE_FILE),
      `${JSON.stringify(projectBaseline(scorecard), null, 2)}\n`,
      'utf8'
    );
    if (!existsSync(path.resolve(cwd, THRESHOLDS_FILE))) {
      writeFileSync(
        path.resolve(cwd, THRESHOLDS_FILE),
        `${JSON.stringify(DEFAULT_THRESHOLDS, null, 2)}\n`,
        'utf8'
      );
    }
    stdout(`Updated fitness baseline at ${BASELINE_FILE}.\n`);
    return 0;
  }

  // --- check mode: evaluate ratchet ---
  let exitCode = 0;
  let ratchet: ReturnType<typeof evaluateRatchet> | undefined;
  if (parsed.check) {
    const baseline = loadJsonFile<Baseline>(path.resolve(cwd, BASELINE_FILE));
    if (!baseline) {
      stderr(
        `No baseline found at ${BASELINE_FILE}. Run \`pnpm fitness:baseline\` first.\n`
      );
      return 2;
    }
    const thresholds =
      loadJsonFile<Thresholds>(path.resolve(cwd, THRESHOLDS_FILE)) ??
      DEFAULT_THRESHOLDS;

    const changedModules = computeChangedModules(base);
    ratchet = evaluateRatchet(scorecard, baseline, thresholds, changedModules);
    scorecard.summary.overallStatus = ratchet.status;
    exitCode = ratchet.status === 'fail' ? 1 : 0;
  }

  writeScorecard(cwd, scorecard, ratchet);

  if (ratchet) {
    if (ratchet.regressions.length === 0) {
      stdout('Fitness ratchet: no regressions. ✅\n');
    } else {
      for (const regression of ratchet.regressions) {
        const scope = regression.module ?? 'repo';
        stderr(
          `[${regression.severity.toUpperCase()}] ${scope} ${regression.metric}: ${regression.message}\n`
        );
      }
    }
  } else {
    stdout(
      `Wrote fitness scorecard to ${SCORECARD_DIR}/fitness-scorecard.json\n`
    );
  }

  return exitCode;
};

const computeChangedModules = (base: string | null): Set<string> | null => {
  if (!base || base === 'HEAD') return null;
  const changed = listChangedFiles(base);
  if (changed.size === 0) return null;
  const moduleNames = new Set<string>();
  for (const file of changed) {
    const node = groupModulePath(file);
    if (node) moduleNames.add(node.moduleName);
  }
  return moduleNames;
};

const writeScorecard = (
  cwd: string,
  scorecard: ReturnType<typeof assembleScorecard>,
  ratchet: ReturnType<typeof evaluateRatchet> | undefined
): void => {
  const dir = path.resolve(cwd, SCORECARD_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, 'fitness-scorecard.json'),
    `${JSON.stringify(scorecard, null, 2)}\n`,
    'utf8'
  );
  const baseline = loadJsonFile<Baseline>(path.resolve(cwd, BASELINE_FILE));
  writeFileSync(
    path.join(dir, 'fitness-scorecard.md'),
    formatMarkdown(scorecard, baseline, ratchet),
    'utf8'
  );
};

const entryPointPath = process.argv[1]
  ? path.resolve(process.argv[1])
  : undefined;
const modulePath = fileURLToPath(import.meta.url);
if (entryPointPath === modulePath) {
  process.exitCode = await main();
}
