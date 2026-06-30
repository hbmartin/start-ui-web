/* eslint-disable security/detect-non-literal-fs-filename -- Fitness collectors intentionally read repo-local tool artifacts discovered from configured paths. */

import { cruise } from 'dependency-cruiser';
import extractDepcruiseOptions from 'dependency-cruiser/config-utl/extract-depcruise-options';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import {
  type EvolvabilityMetrics,
  FITNESS_SCHEMA_VERSION,
  type FitnessArtifactInput,
  type FitnessFinding,
  type FitnessGitMetadata,
  type FitnessMetrics,
  type FitnessReport,
  type FitnessScores,
  type OperationsMetrics,
  type PolicyMetrics,
  type TestStrengthMetrics,
} from './report-schema';
import { findAffectedTests } from '../affected-tests';
import {
  buildModuleLayerGraph,
  type DependencyCruiserReport,
} from '../generate-module-dependency-graph';
import { resolveTrustedTool } from '../trusted-tool';

const PUBLIC_GATE_BASENAMES = new Set([
  'backend.ts',
  'backend.tsx',
  'client.ts',
  'client.tsx',
  'index.ts',
  'index.tsx',
  'presentation.ts',
  'presentation.tsx',
  'server.ts',
  'server.tsx',
  'testing.ts',
  'testing.tsx',
]);

const FITNESS_INPUT_CANDIDATES = {
  eslint: [
    'test-results/fitness-inputs/eslint.json',
    'test-results/eslint/eslint.json',
    'eslint.json',
  ],
  semgrep: [
    'test-results/fitness-inputs/semgrep.sarif',
    'test-results/semgrep/semgrep.sarif',
    'semgrep.sarif',
  ],
  coverage: ['coverage/coverage-summary.json', 'coverage/lcov.info'],
  buildLog: ['test-results/build/build.log'],
} as const;

type DependencyCruiserViolation = {
  comment?: string;
  from?: string;
  name?: string;
  rule?: {
    comment?: string;
    name?: string;
    severity?: string;
  };
  severity?: string;
  to?: string;
};

type DependencyCruiserReportWithSummary = DependencyCruiserReport & {
  summary?: {
    error?: number;
    violations?: DependencyCruiserViolation[];
    warn?: number;
  };
};

type CollectFitnessReportOptions = {
  affectedBase?: string;
  cwd?: string;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const roundScore = (value: number) => Number(value.toFixed(1));

const normalizePath = (filePath: string) =>
  path.posix.normalize(filePath.replaceAll('\\', '/')).replace(/^\.\//, '');

const runGit = (cwd: string, args: string[]) => {
  const result = spawnSync(resolveTrustedTool('git'), args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0 || result.error) return undefined;
  return result.stdout.trim();
};

const getGitMetadata = (cwd: string): FitnessGitMetadata => {
  const status = runGit(cwd, ['status', '--porcelain']);

  return {
    branch: runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']),
    commit: runGit(cwd, ['rev-parse', 'HEAD']),
    dirty: Boolean(status),
  };
};

const pathExists = (cwd: string, candidate: string) =>
  fs.existsSync(path.resolve(cwd, candidate));

const findFirstExistingPath = (cwd: string, candidates: readonly string[]) =>
  candidates.find((candidate) => pathExists(cwd, candidate));

const listFilesRecursive = (
  root: string,
  predicate: (filePath: string) => boolean
) => {
  if (!fs.existsSync(root)) return [];

  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (entry.isFile() && predicate(entryPath)) {
        files.push(entryPath);
      }
    }
  };

  visit(root);
  return files.sort((left, right) => left.localeCompare(right));
};

const readJsonFile = (filePath: string): unknown => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const asNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const collectDependencyCruiserReport = async (cwd: string) => {
  const options = await extractDepcruiseOptions(
    path.resolve(cwd, '.dependency-cruiser.cjs')
  );
  const result = await cruise(['src'], options);
  const output = result.output as
    | DependencyCruiserReportWithSummary
    | undefined;

  if (!output?.modules) {
    throw new Error('dependency-cruiser returned no module graph.');
  }

  return {
    exitCode: result.exitCode,
    report: output,
  };
};

const violationRuleName = (violation: DependencyCruiserViolation) =>
  violation.rule?.name ?? violation.name ?? 'dependency-cruiser-violation';

const violationSeverity = (violation: DependencyCruiserViolation) => {
  const severity = violation.rule?.severity ?? violation.severity;
  return severity === 'warn' || severity === 'warning' ? 'warning' : 'error';
};

const buildDependencyCruiserFindings = (
  report: DependencyCruiserReportWithSummary
): FitnessFinding[] =>
  (report.summary?.violations ?? []).map((violation) => {
    const ruleName = violationRuleName(violation);
    const from = violation.from ? normalizePath(violation.from) : undefined;
    const to = violation.to ? normalizePath(violation.to) : undefined;
    const messageParts = [
      violation.rule?.comment ?? violation.comment ?? ruleName,
      from && to ? `${from} -> ${to}` : undefined,
    ].filter(Boolean);

    return {
      id: `dependency-cruiser/${ruleName}`,
      level: violationSeverity(violation),
      message: messageParts.join(': '),
      source: 'dependency-cruiser',
      zeroTolerance: violationSeverity(violation) === 'error',
      ...(from ? { location: { file: from } } : {}),
    };
  });

const countDependencyFacts = (report?: DependencyCruiserReportWithSummary) => {
  if (!report) {
    return {
      circularDependencyCount: 0,
      unresolvedImportCount: 0,
    };
  }

  let circularDependencyCount = 0;
  let unresolvedImportCount = 0;

  for (const moduleInfo of report.modules) {
    for (const dependency of moduleInfo.dependencies ?? []) {
      const dependencyFacts = dependency as {
        circular?: boolean;
        couldNotResolve?: boolean;
      };
      if (dependencyFacts.circular) circularDependencyCount += 1;
      if (dependencyFacts.couldNotResolve) unresolvedImportCount += 1;
    }
  }

  return { circularDependencyCount, unresolvedImportCount };
};

const dependencyCruiserMetricCounts = (
  report: DependencyCruiserReportWithSummary | undefined,
  findings: FitnessFinding[]
): PolicyMetrics => {
  const { circularDependencyCount, unresolvedImportCount } =
    countDependencyFacts(report);

  const ruleCount = (ruleId: string) =>
    findings.filter((finding) => finding.id.endsWith(`/${ruleId}`)).length;

  return {
    circularDependencyCount: circularDependencyCount + ruleCount('no-circular'),
    codeqlErrorCount: 0,
    dependencyCruiserErrorCount: report?.summary?.error ?? 0,
    forbiddenDependencyCount: findings.filter(
      (finding) =>
        finding.source === 'dependency-cruiser' &&
        finding.level === 'error' &&
        !finding.id.endsWith('/no-circular')
    ).length,
    productionTestingGateImportCount: ruleCount('testing-gates-only-for-tests'),
    routeDeepImportCount: ruleCount('routes-use-module-public-api'),
    semgrepErrorCount: 0,
    unresolvedImportCount,
  };
};

const countExportDeclaration = (statement: ts.ExportDeclaration) => {
  if (!statement.exportClause) return 1;
  if (ts.isNamedExports(statement.exportClause)) {
    return statement.exportClause.elements.length;
  }

  return 0;
};

const isExportedStatement = (statement: ts.Statement) => {
  const modifiers = ts.canHaveModifiers(statement)
    ? ts.getModifiers(statement)
    : undefined;

  return Boolean(
    modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  );
};

const countStatementExports = (statement: ts.Statement) => {
  if (ts.isExportDeclaration(statement))
    return countExportDeclaration(statement);
  if (ts.isExportAssignment(statement)) return 1;
  if (!isExportedStatement(statement)) return 0;

  return ts.isVariableStatement(statement)
    ? statement.declarationList.declarations.length
    : 1;
};

const countExportedDeclarations = (filePath: string) => {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );
  return sourceFile.statements.reduce(
    (count, statement) => count + countStatementExports(statement),
    0
  );
};

const collectPublicGateMetrics = (cwd: string) => {
  const moduleRoot = path.resolve(cwd, 'src/modules');
  const publicGateFiles = listFilesRecursive(
    moduleRoot,
    (filePath) =>
      path.dirname(path.dirname(filePath)) === moduleRoot &&
      PUBLIC_GATE_BASENAMES.has(path.basename(filePath))
  );

  return {
    publicGateExportCount: publicGateFiles.reduce(
      (total, filePath) => total + countExportedDeclarations(filePath),
      0
    ),
    publicGateFileCount: publicGateFiles.length,
  };
};

const collectGitChurnMetrics = (cwd: string) => {
  const output = runGit(cwd, [
    'log',
    '--since=90 days ago',
    '--numstat',
    '--pretty=format:',
    '--',
    'src',
    'scripts',
    'tests',
  ]);
  if (!output) {
    return {
      churnedFiles: 0,
      churnedLines: 0,
      maxChurnShare: 0,
    };
  }

  const churnByFile = new Map<string, number>();
  const churnByModule = new Map<string, number>();
  let churnedLines = 0;

  for (const line of output.split('\n')) {
    const [added, deleted, filePath] = line.split('\t');
    if (!added || !deleted || !filePath || added === '-' || deleted === '-') {
      continue;
    }

    const lineChurn = Number(added) + Number(deleted);
    if (!Number.isFinite(lineChurn)) continue;

    const normalizedFile = normalizePath(filePath);
    churnedLines += lineChurn;
    churnByFile.set(
      normalizedFile,
      (churnByFile.get(normalizedFile) ?? 0) + lineChurn
    );

    const moduleMatch = /^src\/modules\/([^/]+)/.exec(normalizedFile);
    if (moduleMatch?.[1]) {
      churnByModule.set(
        moduleMatch[1],
        (churnByModule.get(moduleMatch[1]) ?? 0) + lineChurn
      );
    }
  }

  const maxModuleChurn = Math.max(0, ...churnByModule.values());

  return {
    churnedFiles: churnByFile.size,
    churnedLines,
    maxChurnShare: churnedLines === 0 ? 0 : maxModuleChurn / churnedLines,
  };
};

const collectAffectedTestAmplification = async (
  cwd: string,
  affectedBase?: string
) => {
  if (!affectedBase) return undefined;

  try {
    const result = await findAffectedTests({ base: affectedBase, cwd });
    const changedSourceCount = Math.max(result.consideredSourceFiles.length, 1);
    return Number((result.testFiles.length / changedSourceCount).toFixed(2));
  } catch {
    return undefined;
  }
};

const collectEvolvabilityMetrics = async ({
  affectedBase,
  cwd,
  dependencyReport,
  eslintWarningCount,
  sonarWarningCount,
}: {
  affectedBase?: string;
  cwd: string;
  dependencyReport?: DependencyCruiserReportWithSummary;
  eslintWarningCount: number;
  sonarWarningCount: number;
}): Promise<EvolvabilityMetrics> => {
  const graph = dependencyReport
    ? buildModuleLayerGraph(dependencyReport)
    : { edges: [], nodes: [] };
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();

  for (const node of graph.nodes) {
    fanIn.set(node.id, 0);
    fanOut.set(node.id, 0);
  }

  for (const edge of graph.edges) {
    fanOut.set(edge.from, (fanOut.get(edge.from) ?? 0) + 1);
    fanIn.set(edge.to, (fanIn.get(edge.to) ?? 0) + 1);
  }

  const moduleNames = new Set(graph.nodes.map((node) => node.moduleName));
  const nodeCount = graph.nodes.length;
  const possibleEdges = nodeCount * Math.max(nodeCount - 1, 1);
  const publicGateMetrics = collectPublicGateMetrics(cwd);
  const churnMetrics = collectGitChurnMetrics(cwd);

  return {
    affectedTestAmplification: await collectAffectedTestAmplification(
      cwd,
      affectedBase
    ),
    averageFanOut:
      nodeCount === 0
        ? 0
        : Number(
            (
              [...fanOut.values()].reduce((total, value) => total + value, 0) /
              nodeCount
            ).toFixed(2)
          ),
    churnedFiles: churnMetrics.churnedFiles,
    churnedLines: churnMetrics.churnedLines,
    dependencyEdgeCount: graph.edges.length,
    eslintWarningCount,
    graphDensity:
      possibleEdges === 0
        ? 0
        : Number((graph.edges.length / possibleEdges).toFixed(4)),
    maxChurnShare: Number(churnMetrics.maxChurnShare.toFixed(4)),
    maxFanIn: Math.max(0, ...fanIn.values()),
    maxFanOut: Math.max(0, ...fanOut.values()),
    moduleCount: moduleNames.size,
    moduleLayerNodeCount: graph.nodes.length,
    publicGateExportCount: publicGateMetrics.publicGateExportCount,
    publicGateFileCount: publicGateMetrics.publicGateFileCount,
    sonarWarningCount,
  };
};

const collectSarifFindings = ({
  cwd,
  filePath,
  source,
  zeroTolerance,
}: {
  cwd: string;
  filePath: string;
  source: string;
  zeroTolerance: boolean;
}): FitnessFinding[] => {
  const sarif = asRecord(readJsonFile(path.resolve(cwd, filePath)));
  return asArray(sarif?.runs).flatMap((run) =>
    asArray(asRecord(run)?.results).map((result) =>
      sarifResultToFinding({ result, source, zeroTolerance })
    )
  );
};

const sarifResultToFinding = ({
  result,
  source,
  zeroTolerance,
}: {
  result: unknown;
  source: string;
  zeroTolerance: boolean;
}): FitnessFinding => {
  const resultRecord = asRecord(result);
  const ruleId =
    typeof resultRecord?.ruleId === 'string'
      ? resultRecord.ruleId
      : `${source}/finding`;
  const level =
    resultRecord?.level === 'warning' || resultRecord?.level === 'note'
      ? resultRecord.level
      : 'error';
  const messageRecord = asRecord(resultRecord?.message);
  const locationRecord = asRecord(
    asRecord(asArray(resultRecord?.locations)[0])?.physicalLocation
  );
  const artifactRecord = asRecord(locationRecord?.artifactLocation);
  const regionRecord = asRecord(locationRecord?.region);
  const uri =
    typeof artifactRecord?.uri === 'string' ? artifactRecord.uri : undefined;

  return {
    id: `${source}/${ruleId}`,
    level,
    message:
      typeof messageRecord?.text === 'string' ? messageRecord.text : ruleId,
    source,
    zeroTolerance: zeroTolerance && level === 'error',
    ...(uri
      ? {
          location: {
            file: normalizePath(uri),
            line: asNumber(regionRecord?.startLine),
            column: asNumber(regionRecord?.startColumn),
          },
        }
      : {}),
  };
};

const collectEslintWarningCounts = (cwd: string) => {
  const eslintPath = findFirstExistingPath(
    cwd,
    FITNESS_INPUT_CANDIDATES.eslint
  );
  if (!eslintPath) {
    return {
      artifact: {
        found: false,
        name: 'eslint-json',
        path: FITNESS_INPUT_CANDIDATES.eslint[0],
      },
      eslintWarningCount: 0,
      sonarWarningCount: 0,
    };
  }

  const eslintReport = asArray(readJsonFile(path.resolve(cwd, eslintPath)));
  let eslintWarningCount = 0;
  let sonarWarningCount = 0;

  for (const fileResult of eslintReport) {
    const fileRecord = asRecord(fileResult);
    for (const message of asArray(fileRecord?.messages)) {
      const messageRecord = asRecord(message);
      if (messageRecord?.severity === 1) eslintWarningCount += 1;
      if (
        messageRecord?.severity === 1 &&
        typeof messageRecord.ruleId === 'string' &&
        messageRecord.ruleId.startsWith('sonarjs/')
      ) {
        sonarWarningCount += 1;
      }
    }
  }

  return {
    artifact: {
      found: true,
      name: 'eslint-json',
      path: eslintPath,
    },
    eslintWarningCount,
    sonarWarningCount,
  };
};

const collectCoveragePercent = (cwd: string) => {
  const coveragePath = findFirstExistingPath(
    cwd,
    FITNESS_INPUT_CANDIDATES.coverage
  );
  const artifact = {
    found: Boolean(coveragePath),
    name: 'coverage',
    path: coveragePath ?? FITNESS_INPUT_CANDIDATES.coverage[0],
  };

  if (!coveragePath) return { artifact, coveragePercent: undefined };

  if (coveragePath.endsWith('.json')) {
    const coverage = asRecord(readJsonFile(path.resolve(cwd, coveragePath)));
    const total = asRecord(coverage?.total);
    const lines = asRecord(total?.lines);
    return {
      artifact,
      coveragePercent: asNumber(lines?.pct),
    };
  }

  const lcov = fs.readFileSync(path.resolve(cwd, coveragePath), 'utf8');
  let foundLines = 0;
  let hitLines = 0;
  for (const line of lcov.split('\n')) {
    if (line.startsWith('LF:')) foundLines += Number(line.slice(3));
    if (line.startsWith('LH:')) hitLines += Number(line.slice(3));
  }

  return {
    artifact,
    coveragePercent:
      foundLines === 0
        ? undefined
        : Number(((hitLines / foundLines) * 100).toFixed(2)),
  };
};

const findNumericValueByKey = (
  value: unknown,
  keyName: 'mutationScore'
): number | undefined => {
  const record = asRecord(value);
  if (!record) return undefined;

  const direct = asNumber(record.mutationScore);
  if (direct !== undefined) return direct;

  for (const child of Object.values(record)) {
    const nested = findNumericValueByKey(child, keyName);
    if (nested !== undefined) return nested;
  }

  return undefined;
};

const collectMutationScore = (cwd: string) => {
  const mutationReports = listFilesRecursive(
    path.resolve(cwd, 'reports/mutation'),
    (filePath) => path.basename(filePath) === 'mutation.json'
  );
  const scores = mutationReports
    .map((filePath) =>
      findNumericValueByKey(readJsonFile(filePath), 'mutationScore')
    )
    .filter((score): score is number => score !== undefined);

  if (scores.length === 0) {
    return {
      artifact: {
        found: false,
        name: 'stryker-json',
        path: 'reports/mutation/**/mutation.json',
      },
      mutationScore: undefined,
    };
  }

  return {
    artifact: {
      found: true,
      name: 'stryker-json',
      path: 'reports/mutation/**/mutation.json',
      details: `${scores.length} report(s)`,
    },
    mutationScore: Number(
      (
        scores.reduce((total, score) => total + score, 0) / scores.length
      ).toFixed(2)
    ),
  };
};

const directorySize = (directory: string): number | undefined => {
  if (!fs.existsSync(directory)) return undefined;

  let total = 0;
  const visit = (entryPath: string) => {
    const stat = fs.statSync(entryPath);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(entryPath)) {
        visit(path.join(entryPath, entry));
      }
    } else if (stat.isFile()) {
      total += stat.size;
    }
  };

  visit(directory);
  return total;
};

const collectOperationsMetrics = (
  cwd: string
): {
  artifactInputs: FitnessArtifactInput[];
  metrics: OperationsMetrics;
} => {
  const buildLogPath = findFirstExistingPath(
    cwd,
    FITNESS_INPUT_CANDIDATES.buildLog
  );
  const artifactInputs: FitnessArtifactInput[] = [
    {
      found: Boolean(buildLogPath),
      name: 'build-log',
      path: buildLogPath ?? FITNESS_INPUT_CANDIDATES.buildLog[0],
    },
  ];
  const buildLog = buildLogPath
    ? fs.readFileSync(path.resolve(cwd, buildLogPath), 'utf8')
    : '';
  const durationMatch = /durationMs=(\d+)/.exec(buildLog);
  const playwrightReports = listFilesRecursive(
    path.resolve(cwd, 'test-results'),
    (filePath) => filePath.endsWith('.xml')
  );
  let playwrightFailureCount = 0;

  for (const reportPath of playwrightReports) {
    const xml = fs.readFileSync(reportPath, 'utf8');
    const failureMatches = xml.matchAll(/\bfailures="(\d+)"/g);
    for (const match of failureMatches) {
      playwrightFailureCount += Number(match[1] ?? 0);
    }
  }

  const buildOutputBytes = directorySize(path.resolve(cwd, '.output'));

  return {
    artifactInputs,
    metrics: {
      artifactCount:
        (buildLogPath ? 1 : 0) +
        playwrightReports.length +
        (buildOutputBytes === undefined ? 0 : 1),
      buildDurationMs: durationMatch?.[1]
        ? Number(durationMatch[1])
        : undefined,
      buildOutputBytes,
      playwrightFailureCount:
        playwrightReports.length === 0 ? undefined : playwrightFailureCount,
    },
  };
};

const collectExternalFindings = (cwd: string) => {
  const findings: FitnessFinding[] = [];
  const artifactInputs: FitnessArtifactInput[] = [];
  const semgrepPath = findFirstExistingPath(
    cwd,
    FITNESS_INPUT_CANDIDATES.semgrep
  );

  artifactInputs.push({
    found: Boolean(semgrepPath),
    name: 'semgrep-sarif',
    path: semgrepPath ?? FITNESS_INPUT_CANDIDATES.semgrep[0],
  });
  if (semgrepPath) {
    findings.push(
      ...collectSarifFindings({
        cwd,
        filePath: semgrepPath,
        source: 'semgrep',
        zeroTolerance: true,
      })
    );
  }

  const codeqlReports = listFilesRecursive(
    path.resolve(cwd, 'test-results/codeql'),
    (filePath) => filePath.endsWith('.sarif')
  );
  artifactInputs.push({
    found: codeqlReports.length > 0,
    name: 'codeql-sarif',
    path: 'test-results/codeql/**/*.sarif',
    details:
      codeqlReports.length > 0
        ? `${codeqlReports.length} report(s)`
        : undefined,
  });

  for (const reportPath of codeqlReports) {
    findings.push(
      ...collectSarifFindings({
        cwd,
        filePath: path.relative(cwd, reportPath),
        source: 'codeql',
        zeroTolerance: true,
      })
    );
  }

  return { artifactInputs, findings };
};

const collectTestStrengthMetrics = (
  cwd: string
): {
  artifactInputs: FitnessArtifactInput[];
  metrics: TestStrengthMetrics;
} => {
  const coverage = collectCoveragePercent(cwd);
  const mutation = collectMutationScore(cwd);

  return {
    artifactInputs: [coverage.artifact, mutation.artifact],
    metrics: {
      artifactCount:
        (coverage.artifact.found ? 1 : 0) + (mutation.artifact.found ? 1 : 0),
      coveragePercent: coverage.coveragePercent,
      mutationScore: mutation.mutationScore,
    },
  };
};

export const calculatePolicyScore = (findings: FitnessFinding[]) => {
  const hardFindingCount = findings.filter(
    (finding) => finding.zeroTolerance && finding.level === 'error'
  ).length;

  return roundScore(clamp(100 - hardFindingCount * 10, 0, 100));
};

export const calculateEvolvabilityScore = (metrics: EvolvabilityMetrics) => {
  const graphComplexityPenalty = clamp(
    metrics.moduleLayerNodeCount === 0
      ? 0
      : (metrics.dependencyEdgeCount / metrics.moduleLayerNodeCount) * 4,
    0,
    20
  );
  const fanOutPenalty = clamp(metrics.maxFanOut * 1.5, 0, 15);
  const densityPenalty = clamp(metrics.graphDensity * 100, 0, 15);
  const publicGatePenalty = clamp(
    Math.max(0, metrics.publicGateExportCount - metrics.moduleCount * 20) / 4,
    0,
    15
  );
  const lintPenalty = clamp(
    metrics.eslintWarningCount * 0.4 + metrics.sonarWarningCount * 0.6,
    0,
    15
  );
  const affectedPenalty =
    metrics.affectedTestAmplification === undefined
      ? 0
      : clamp(Math.max(0, metrics.affectedTestAmplification - 3) * 2, 0, 10);
  const churnConcentrationPenalty = clamp(metrics.maxChurnShare * 10, 0, 10);

  return roundScore(
    clamp(
      100 -
        graphComplexityPenalty -
        fanOutPenalty -
        densityPenalty -
        publicGatePenalty -
        lintPenalty -
        affectedPenalty -
        churnConcentrationPenalty,
      0,
      100
    )
  );
};

export const calculateTestStrengthScore = (metrics: TestStrengthMetrics) => {
  const scores = [metrics.coveragePercent, metrics.mutationScore].filter(
    (score): score is number => score !== undefined
  );
  if (scores.length === 0) return 100;

  return roundScore(
    clamp(
      scores.reduce((total, score) => total + score, 0) / scores.length,
      0,
      100
    )
  );
};

export const calculateOperationsScore = (metrics: OperationsMetrics) => {
  let score = 100;
  if ((metrics.playwrightFailureCount ?? 0) > 0) {
    score -= Math.min(30, (metrics.playwrightFailureCount ?? 0) * 10);
  }
  if (metrics.buildOutputBytes !== undefined) {
    score -= clamp(metrics.buildOutputBytes / (1024 * 1024 * 10), 0, 10);
  }
  if (metrics.buildDurationMs !== undefined) {
    score -= clamp(metrics.buildDurationMs / 60_000, 0, 10);
  }

  return roundScore(clamp(score, 0, 100));
};

const calculateScores = (
  findings: FitnessFinding[],
  metrics: FitnessMetrics
): FitnessScores => ({
  evolvabilityScore: calculateEvolvabilityScore(metrics.evolvability),
  operationsScore: calculateOperationsScore(metrics.operations),
  policyScore: calculatePolicyScore(findings),
  testStrengthScore: calculateTestStrengthScore(metrics.testStrength),
});

export const collectFitnessReport = async ({
  affectedBase,
  cwd = process.cwd(),
}: CollectFitnessReportOptions = {}): Promise<FitnessReport> => {
  const artifactInputs: FitnessArtifactInput[] = [];
  const findings: FitnessFinding[] = [];
  let dependencyReport: DependencyCruiserReportWithSummary | undefined;

  try {
    const { report } = await collectDependencyCruiserReport(cwd);
    dependencyReport = report;
    findings.push(...buildDependencyCruiserFindings(report));
    artifactInputs.push({
      found: true,
      name: 'dependency-cruiser',
      path: '.dependency-cruiser.cjs',
    });
  } catch (error) {
    findings.push({
      id: 'dependency-cruiser/collector-failed',
      level: 'error',
      message: error instanceof Error ? error.message : String(error),
      source: 'dependency-cruiser',
      zeroTolerance: true,
    });
    artifactInputs.push({
      found: false,
      name: 'dependency-cruiser',
      path: '.dependency-cruiser.cjs',
    });
  }

  const external = collectExternalFindings(cwd);
  findings.push(...external.findings);
  artifactInputs.push(...external.artifactInputs);

  const eslint = collectEslintWarningCounts(cwd);
  artifactInputs.push(eslint.artifact);

  const policyMetrics = dependencyCruiserMetricCounts(
    dependencyReport,
    findings
  );
  policyMetrics.semgrepErrorCount = findings.filter(
    (finding) => finding.source === 'semgrep' && finding.level === 'error'
  ).length;
  policyMetrics.codeqlErrorCount = findings.filter(
    (finding) => finding.source === 'codeql' && finding.level === 'error'
  ).length;

  const testStrength = collectTestStrengthMetrics(cwd);
  artifactInputs.push(...testStrength.artifactInputs);

  const operations = collectOperationsMetrics(cwd);
  artifactInputs.push(...operations.artifactInputs);

  const metrics: FitnessMetrics = {
    evolvability: await collectEvolvabilityMetrics({
      affectedBase,
      cwd,
      dependencyReport,
      eslintWarningCount: eslint.eslintWarningCount,
      sonarWarningCount: eslint.sonarWarningCount,
    }),
    operations: operations.metrics,
    policy: policyMetrics,
    testStrength: testStrength.metrics,
  };

  return {
    artifactInputs,
    cwd,
    findings,
    generatedAt: new Date().toISOString(),
    git: getGitMetadata(cwd),
    metrics,
    schemaVersion: FITNESS_SCHEMA_VERSION,
    scores: calculateScores(findings, metrics),
  };
};
