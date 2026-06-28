/* oxlint-disable vitest/no-conditional-in-test -- Baseline guardrails branch over discovered modules to produce precise assertions. */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Baseline, Thresholds } from '../../scripts/fitness/lib/types';
import { SCORECARD_SCHEMA_VERSION } from '../../scripts/fitness/lib/types';

const root = process.cwd();

const readJson = <T>(relativePath: string): T =>
  JSON.parse(readFileSync(path.resolve(root, relativePath), 'utf8')) as T;

const baseline = readJson<Baseline>('fitness/baseline.json');
const thresholds = readJson<Thresholds>('fitness/thresholds.json');

const REQUIRED_MODULE_KEYS: Array<keyof Baseline['modules'][string]> = [
  'instability',
  'abstractness',
  'distance',
  'cyclomatic_p90',
  'cognitive_p90',
  'afferent',
  'efferent',
];

describe('fitness ratchet baseline', () => {
  it('keeps every module distance under the configured ceiling', () => {
    const offenders = Object.entries(baseline.modules)
      .filter(([, metrics]) => metrics.distance > thresholds.distance.ceiling)
      .map(([moduleName, metrics]) => `${moduleName}: D=${metrics.distance}`);

    expect(offenders).toEqual([]);
  });

  it('covers every src/modules directory with a complete baseline entry', () => {
    const moduleDirs = readdirSync(path.resolve(root, 'src/modules'), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    for (const moduleName of moduleDirs) {
      const entry = baseline.modules[moduleName];
      expect(entry, `baseline missing module "${moduleName}"`).toBeDefined();
      if (!entry) continue;
      for (const key of REQUIRED_MODULE_KEYS) {
        expect(
          typeof entry[key],
          `baseline.${moduleName}.${String(key)} should be a number`
        ).toBe('number');
      }
    }
  });

  it('keeps the circular-dependency baseline at zero', () => {
    expect(baseline.signals.circular).toBe(0);
  });

  it('aligns the baseline and scorecard schema versions', () => {
    expect(baseline.schemaVersion).toBe(SCORECARD_SCHEMA_VERSION);
  });

  it('keeps thresholds within sane bounds', () => {
    expect(thresholds.distance.ceiling).toBeGreaterThan(0);
    expect(thresholds.distance.ceiling).toBeLessThanOrEqual(1);
    expect(thresholds.distance.regressionTolerance).toBeGreaterThanOrEqual(0);
    expect(thresholds.circular.ceiling).toBeGreaterThanOrEqual(0);
    expect(thresholds.duplication.ceiling_percentage).toBeGreaterThanOrEqual(0);
  });
});
