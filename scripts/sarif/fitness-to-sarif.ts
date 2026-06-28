/**
 * Converts the fitness scorecard into SARIF 2.1.0.
 *
 * Re-evaluates the ratchet against the committed baseline so each regression
 * becomes a SARIF result. Module-level drifts surface as warnings; absolute
 * invariants (new circular dependency, duplication/bundle/sheriff ceilings)
 * surface as errors. Falls back to flagging any module whose distance exceeds
 * the configured ceiling when no baseline exists.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  makeLog,
  makeResult,
  makeRun,
  type SarifResult,
  type SarifRule,
} from './lib/sarif';
import { DEFAULT_THRESHOLDS, evaluateRatchet } from '../fitness/lib/scorecard';
import type { Baseline, Scorecard, Thresholds } from '../fitness/lib/types';

const SCORECARD = 'test-results/fitness/fitness-scorecard.json';
const BASELINE = 'fitness/baseline.json';
const THRESHOLDS = 'fitness/thresholds.json';
const OUTPUT = 'test-results/sarif/fitness.sarif';

const readJson = <T>(filePath: string): T | undefined =>
  existsSync(filePath)
    ? (JSON.parse(readFileSync(filePath, 'utf8')) as T)
    : undefined;

const RULES: SarifRule[] = [
  {
    id: 'fitness/distance',
    shortDescription: {
      text: 'Distance from the main sequence rose or crossed the ceiling',
    },
  },
  {
    id: 'fitness/cognitive_p90',
    shortDescription: { text: 'Cognitive complexity p90 regressed' },
  },
  {
    id: 'fitness/cyclomatic_p90',
    shortDescription: { text: 'Cyclomatic complexity p90 regressed' },
  },
  {
    id: 'fitness/circular',
    shortDescription: { text: 'New circular dependencies introduced' },
  },
  {
    id: 'fitness/duplication',
    shortDescription: { text: 'Code duplication exceeded its ceiling' },
  },
  {
    id: 'fitness/sheriff',
    shortDescription: { text: 'New Sheriff boundary violations' },
  },
  {
    id: 'fitness/bundle',
    shortDescription: { text: 'Bundle size grew beyond its budget' },
  },
  {
    id: 'fitness/baseline-coverage',
    shortDescription: { text: 'Module missing from the fitness baseline' },
  },
];

const moduleFile = (cwd: string, moduleName: string): string => {
  const candidate = path.resolve(cwd, 'src/modules', moduleName, 'index.ts');
  return existsSync(candidate)
    ? `src/modules/${moduleName}/index.ts`
    : `src/modules/${moduleName}`;
};

export const convert = (cwd = process.cwd()): { results: number } => {
  const scorecard = readJson<Scorecard>(path.resolve(cwd, SCORECARD));
  const results: SarifResult[] = [];

  if (scorecard) {
    const baseline = readJson<Baseline>(path.resolve(cwd, BASELINE));
    const thresholds =
      readJson<Thresholds>(path.resolve(cwd, THRESHOLDS)) ?? DEFAULT_THRESHOLDS;

    if (baseline) {
      // Empty changed-set => module drifts are warnings, invariants stay errors.
      const ratchet = evaluateRatchet(
        scorecard,
        baseline,
        thresholds,
        new Set<string>()
      );
      for (const regression of ratchet.regressions) {
        results.push(
          makeResult({
            ruleId: `fitness/${regression.metric}`,
            level: regression.severity === 'fail' ? 'error' : 'warning',
            message: `${regression.message} (baseline ${regression.baseline} → ${regression.current})`,
            file: regression.module
              ? moduleFile(cwd, regression.module)
              : SCORECARD,
            fingerprint: `${regression.metric}:${regression.module ?? 'repo'}`,
          })
        );
      }
    } else {
      for (const [moduleName, metrics] of Object.entries(scorecard.modules)) {
        if (metrics.coupling.distance > thresholds.distance.ceiling) {
          results.push(
            makeResult({
              ruleId: 'fitness/distance',
              level: 'warning',
              message: `distance D=${metrics.coupling.distance} exceeds ceiling ${thresholds.distance.ceiling}`,
              file: moduleFile(cwd, moduleName),
              fingerprint: `distance:${moduleName}`,
            })
          );
        }
      }
    }
  }

  const log = makeLog([
    makeRun({
      name: 'fitness-scorecard',
      informationUri: 'https://github.com/hbmartin/start-ui-web',
      rules: RULES,
      results,
    }),
  ]);

  const outputPath = path.resolve(cwd, OUTPUT);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(log, null, 2)}\n`, 'utf8');
  return { results: results.length };
};

const entryPointPath = process.argv[1]
  ? path.resolve(process.argv[1])
  : undefined;
if (entryPointPath === fileURLToPath(import.meta.url)) {
  const { results } = convert();
  process.stdout.write(`fitness SARIF: ${results} result(s) → ${OUTPUT}\n`);
}
