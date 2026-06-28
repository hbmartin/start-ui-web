/**
 * Converts the dependency-cruiser JSON report into SARIF 2.1.0.
 *
 * dependency-cruiser has no native SARIF reporter, so we map each
 * `summary.violations[]` entry (rule name + severity + from/to) to a SARIF
 * result an agent or GitHub code-scanning can consume. Reads the JSON the
 * `dependency-cruiser` CI job already writes; emits an empty run if absent.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  makeLog,
  makeResult,
  makeRun,
  type SarifLevel,
  type SarifResult,
  type SarifRule,
} from './lib/sarif';

const INPUT = 'test-results/dependency-cruiser/dependency-cruiser.json';
const OUTPUT = 'test-results/sarif/dependency-cruiser.sarif';

type DepcruiseViolation = {
  from?: string;
  to?: string;
  rule?: { name?: string; severity?: string };
  comment?: string;
};

const toLevel = (severity: string | undefined): SarifLevel =>
  severity === 'error' ? 'error' : severity === 'info' ? 'note' : 'warning';

export const convert = (cwd = process.cwd()): { results: number } => {
  const inputPath = path.resolve(cwd, INPUT);
  const rulesById = new Map<string, SarifRule>();
  const results: SarifResult[] = [];

  if (existsSync(inputPath)) {
    const report = JSON.parse(readFileSync(inputPath, 'utf8')) as {
      summary?: { violations?: DepcruiseViolation[] };
    };
    for (const violation of report.summary?.violations ?? []) {
      const ruleId = violation.rule?.name ?? 'unknown';
      const level = toLevel(violation.rule?.severity);
      if (!rulesById.has(ruleId)) {
        rulesById.set(ruleId, {
          id: ruleId,
          shortDescription: { text: violation.comment ?? ruleId },
          defaultConfiguration: { level },
        });
      }
      results.push(
        makeResult({
          ruleId,
          level,
          message: `${violation.comment ? `${violation.comment} ` : ''}(${violation.from} → ${violation.to})`,
          file: violation.from,
          fingerprint: `${ruleId}:${violation.from}:${violation.to}`,
        })
      );
    }
  }

  const log = makeLog([
    makeRun({
      name: 'dependency-cruiser',
      informationUri: 'https://github.com/sverweij/dependency-cruiser',
      rules: [...rulesById.values()],
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
  process.stdout.write(
    `dependency-cruiser SARIF: ${results} result(s) → ${OUTPUT}\n`
  );
}
