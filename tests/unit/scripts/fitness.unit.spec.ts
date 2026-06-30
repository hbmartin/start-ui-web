import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  calculateEvolvabilityScore,
  calculatePolicyScore,
  collectFitnessReport,
} from '../../../scripts/fitness/collect-fitness-report';
import { evaluateRatchet } from '../../../scripts/fitness/evaluate-ratchet';
import {
  isCliEntrypoint,
  parseCliArguments,
} from '../../../scripts/fitness/fitness-cli';
import { formatFitnessMarkdown } from '../../../scripts/fitness/format-fitness-report';
import {
  FITNESS_SCHEMA_VERSION,
  type FitnessFinding,
  type FitnessReport,
} from '../../../scripts/fitness/report-schema';
import {
  resolveFitnessOutputDir,
  writeFitnessArtifacts,
} from '../../../scripts/fitness/write-fitness-artifacts';

const tempDirectories: string[] = [];

const makeTempCwd = () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fitness-'));
  tempDirectories.push(cwd);
  return cwd;
};

const writeFixture = (cwd: string, filePath: string, content: string) => {
  const absolutePath = path.join(cwd, filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf8');
};

const makeFinding = (
  overrides: Partial<FitnessFinding> = {}
): FitnessFinding => ({
  id: 'dependency-cruiser/no-circular',
  level: 'error',
  message: 'No circular dependencies.',
  source: 'dependency-cruiser',
  zeroTolerance: true,
  ...overrides,
});

const makeReport = (overrides: Partial<FitnessReport> = {}): FitnessReport => ({
  artifactInputs: [],
  cwd: process.cwd(),
  findings: [],
  generatedAt: '2026-06-30T00:00:00.000Z',
  git: {
    branch: 'main',
    commit: 'abc123',
    dirty: false,
  },
  metrics: {
    evolvability: {
      averageFanOut: 1,
      churnedFiles: 0,
      churnedLines: 0,
      dependencyEdgeCount: 4,
      eslintWarningCount: 0,
      graphDensity: 0.1,
      maxChurnShare: 0,
      maxFanIn: 2,
      maxFanOut: 2,
      moduleCount: 2,
      moduleLayerNodeCount: 4,
      publicGateExportCount: 8,
      publicGateFileCount: 2,
      sonarWarningCount: 0,
    },
    operations: {
      artifactCount: 0,
    },
    policy: {
      circularDependencyCount: 0,
      codeqlErrorCount: 0,
      dependencyCruiserErrorCount: 0,
      forbiddenDependencyCount: 0,
      productionTestingGateImportCount: 0,
      routeDeepImportCount: 0,
      semgrepErrorCount: 0,
      unresolvedImportCount: 0,
    },
    testStrength: {
      artifactCount: 0,
    },
  },
  schemaVersion: FITNESS_SCHEMA_VERSION,
  scores: {
    evolvabilityScore: 90,
    operationsScore: 100,
    policyScore: 100,
    testStrengthScore: 100,
  },
  ...overrides,
});

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

describe('fitness CLI argument parsing', () => {
  it('parses commands and command-specific options', () => {
    expect(
      parseCliArguments([
        'ratchet',
        '--base',
        'origin/main',
        '--affected-base',
        'HEAD^',
        '--output-dir',
        'test-results/fitness/custom',
        '--summary-file',
        'test-results/fitness/summary.md',
      ])
    ).toEqual({
      ok: true,
      options: {
        affectedBase: 'HEAD^',
        base: 'origin/main',
        command: 'ratchet',
        help: false,
        outputDir: 'test-results/fitness/custom',
        summaryFile: 'test-results/fitness/summary.md',
      },
    });
  });

  it('rejects missing commands and missing ratchet base revisions', () => {
    expect(parseCliArguments([])).toEqual({
      error: 'Missing command.',
      ok: false,
    });
    expect(parseCliArguments(['ratchet'])).toEqual({
      error: 'ratchet requires --base <sha>.',
      ok: false,
    });
  });

  it('detects the CLI entrypoint path', () => {
    expect(isCliEntrypoint('/tmp/a.ts', '/tmp/a.ts')).toBe(true);
    expect(isCliEntrypoint('/tmp/a.ts', '/tmp/b.ts')).toBe(false);
  });
});

describe('fitness scoring', () => {
  it('keeps policy perfect when there are no zero-tolerance errors', () => {
    expect(calculatePolicyScore([])).toBe(100);
    expect(
      calculatePolicyScore([
        makeFinding({ level: 'warning', zeroTolerance: false }),
      ])
    ).toBe(100);
  });

  it('penalizes zero-tolerance errors', () => {
    expect(
      calculatePolicyScore([
        makeFinding(),
        makeFinding({ id: 'semgrep/no-token' }),
      ])
    ).toBe(80);
  });

  it('scores evolvability from graph, public API, lint, affected, and churn metrics', () => {
    const strong = calculateEvolvabilityScore(
      makeReport().metrics.evolvability
    );
    const weak = calculateEvolvabilityScore({
      ...makeReport().metrics.evolvability,
      affectedTestAmplification: 12,
      dependencyEdgeCount: 100,
      eslintWarningCount: 20,
      graphDensity: 0.5,
      maxChurnShare: 0.9,
      maxFanOut: 20,
      publicGateExportCount: 300,
      sonarWarningCount: 10,
    });

    expect(strong).toBeGreaterThan(weak);
  });
});

describe('fitness collector artifact ingestion', () => {
  it('ingests optional SARIF, ESLint, coverage, and Stryker artifacts when present', async () => {
    const cwd = makeTempCwd();
    writeFixture(
      cwd,
      'semgrep.sarif',
      JSON.stringify({
        version: '2.1.0',
        runs: [
          {
            results: [
              {
                ruleId: 'no-secret',
                level: 'error',
                message: { text: 'Secret-like value.' },
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: 'src/a.ts' },
                      region: { startLine: 3, startColumn: 5 },
                    },
                  },
                ],
              },
            ],
          },
        ],
      })
    );
    writeFixture(
      cwd,
      'eslint.json',
      JSON.stringify([
        {
          messages: [
            { ruleId: 'sonarjs/cognitive-complexity', severity: 1 },
            { ruleId: 'security/detect-object-injection', severity: 1 },
          ],
        },
      ])
    );
    writeFixture(cwd, 'coverage/lcov.info', 'LF:10\nLH:8\n');
    writeFixture(
      cwd,
      'reports/mutation/auth/mutation.json',
      JSON.stringify({ metrics: { mutationScore: 75 } })
    );

    const report = await collectFitnessReport({ cwd });

    expect(report.metrics.policy.semgrepErrorCount).toBe(1);
    expect(report.metrics.evolvability.eslintWarningCount).toBe(2);
    expect(report.metrics.evolvability.sonarWarningCount).toBe(1);
    expect(report.metrics.testStrength.coveragePercent).toBe(80);
    expect(report.metrics.testStrength.mutationScore).toBe(75);
    expect(
      report.findings.some((finding) => finding.id === 'semgrep/no-secret')
    ).toBe(true);
  });
});

describe('fitness ratchet evaluator', () => {
  it('allows missing optional score artifacts without blocking', () => {
    const report = evaluateRatchet({
      base: makeReport(),
      current: makeReport(),
    });

    expect(report.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blocked: false,
          id: 'testStrengthScore/missing-optional-artifacts',
        }),
        expect.objectContaining({
          blocked: false,
          id: 'operationsScore/missing-optional-artifacts',
        }),
      ])
    );
    expect(report.decisions.some((decision) => decision.blocked)).toBe(false);
  });

  it('blocks new zero-tolerance findings and imperfect policy scores', () => {
    const report = evaluateRatchet({
      base: makeReport(),
      current: makeReport({
        findings: [makeFinding()],
        scores: {
          ...makeReport().scores,
          policyScore: 90,
        },
      }),
    });

    expect(report.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blocked: true,
          id: 'zero-tolerance-findings-increased',
        }),
        expect.objectContaining({
          blocked: true,
          id: 'policy-score-below-perfect',
        }),
      ])
    );
  });

  it('blocks evolvability score drops and deterministic metric regressions', () => {
    const report = evaluateRatchet({
      base: makeReport(),
      current: makeReport({
        metrics: {
          ...makeReport().metrics,
          evolvability: {
            ...makeReport().metrics.evolvability,
            dependencyEdgeCount: 20,
          },
        },
        scores: {
          ...makeReport().scores,
          evolvabilityScore: 80,
        },
      }),
    });

    expect(report.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blocked: true,
          id: 'evolvability-score-regressed',
        }),
        expect.objectContaining({
          blocked: true,
          id: 'deterministic-regression/dependency-edge-count',
        }),
      ])
    );
  });

  it('does not block when an evolvability drop is only a current-only affected-test amplification penalty', () => {
    const report = evaluateRatchet({
      base: makeReport(),
      current: makeReport({
        metrics: {
          ...makeReport().metrics,
          evolvability: {
            ...makeReport().metrics.evolvability,
            affectedTestAmplification: 162,
          },
        },
        scores: {
          ...makeReport().scores,
          evolvabilityScore: 80,
        },
      }),
    });

    expect(
      report.decisions.some(
        (decision) => decision.id === 'evolvability-score-regressed'
      )
    ).toBe(false);
    expect(report.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          blocked: false,
          id: 'evolvabilityScore/affected-test-amplification-not-comparable',
        }),
      ])
    );
  });
});

describe('fitness artifact writing', () => {
  it('writes reports only under test-results/fitness', () => {
    const cwd = makeTempCwd();
    const report = makeReport({ cwd });

    expect(() =>
      resolveFitnessOutputDir(cwd, 'test-results/not-fitness')
    ).toThrow('Fitness reports must be written under test-results/fitness');

    const artifacts = writeFitnessArtifacts({
      cwd,
      outputDir: 'test-results/fitness/unit',
      report,
    });

    expect(fs.existsSync(artifacts.jsonPath)).toBe(true);
    expect(fs.existsSync(artifacts.markdownPath)).toBe(true);
    expect(fs.existsSync(artifacts.sarifPath)).toBe(true);
    expect(formatFitnessMarkdown(report)).toContain('# Fitness Report');
  });
});
