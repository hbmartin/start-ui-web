/**
 * Ingests artifacts already produced by existing Layer-1 tooling. Nothing here
 * RE-RUNS a heavy tool; it only reads JSON/XML the CI jobs (or local `check`)
 * have written. A missing artifact yields `available: false` and never throws,
 * so the collector works locally before CI has produced everything.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { BundleEntry, Scorecard } from './types';

const readJson = (filePath: string): unknown => {
  if (!existsSync(filePath)) return undefined;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return undefined;
  }
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export const readDependencyCruiserSignal = (
  cwd: string
): Scorecard['signals']['dependencyCruiser'] => {
  const report = readJson(
    path.resolve(cwd, 'test-results/dependency-cruiser/dependency-cruiser.json')
  );
  if (report === undefined) {
    return { available: false, errors: 0, warnings: 0, circular: 0 };
  }
  const summary = asRecord(asRecord(report).summary);
  const violations = Array.isArray(summary.violations)
    ? summary.violations
    : [];
  const circular = violations.filter((violation) => {
    const rule = asRecord(asRecord(violation).rule);
    return rule.name === 'no-circular';
  }).length;
  return {
    available: true,
    errors: asNumber(summary.error),
    warnings: asNumber(summary.warn),
    circular,
  };
};

export const readArchitectureSuiteSignal = (
  cwd: string
): Scorecard['signals']['architectureSuite'] => {
  const junitPath = path.resolve(cwd, 'test-results/architecture/junit.xml');
  if (!existsSync(junitPath)) {
    return { available: false, tests: 0, passed: 0, failed: 0 };
  }
  const xml = readFileSync(junitPath, 'utf8');
  const header = xml.match(/<testsuites\b[^>]*>/)?.[0] ?? '';
  const attr = (name: string): number =>
    asNumber(
      Number.parseInt(
        header.match(new RegExp(`${name}="(\\d+)"`))?.[1] ?? '0',
        10
      )
    );
  const tests = attr('tests');
  const failed = attr('failures') + attr('errors');
  return {
    available: true,
    tests,
    passed: Math.max(tests - failed, 0),
    failed,
  };
};

export const readDuplicationSignal = (
  cwd: string
): Scorecard['signals']['duplication'] => {
  const report = readJson(
    path.resolve(cwd, 'test-results/jscpd/jscpd-report.json')
  );
  if (report === undefined) {
    return { available: false, percentage: 0, clones: 0 };
  }
  const total = asRecord(asRecord(asRecord(report).statistics).total);
  return {
    available: true,
    percentage: asNumber(total.percentage),
    clones: asNumber(total.clones),
  };
};

export const readBundleSignal = (
  cwd: string
): Scorecard['signals']['bundle'] => {
  const report = readJson(
    path.resolve(cwd, 'test-results/fitness/size-limit.json')
  );
  const buildTime = asRecord(
    readJson(path.resolve(cwd, 'test-results/fitness/build-time.json'))
  );
  const buildTimeMs =
    typeof buildTime.buildTimeMs === 'number' ? buildTime.buildTimeMs : null;

  if (!Array.isArray(report)) {
    return { available: false, entries: [], buildTimeMs };
  }
  const entries: BundleEntry[] = report.map((raw) => {
    const entry = asRecord(raw);
    return {
      name: typeof entry.name === 'string' ? entry.name : 'unknown',
      passed: entry.passed !== false,
      size: asNumber(entry.size),
      sizeLimit:
        typeof entry.sizeLimit === 'number'
          ? entry.sizeLimit
          : typeof entry.limit === 'number'
            ? entry.limit
            : null,
    };
  });
  return { available: true, entries, buildTimeMs };
};

export const readSheriffSignal = (
  cwd: string
): Scorecard['signals']['sheriff'] => {
  const report = readJson(
    path.resolve(cwd, 'test-results/fitness/sheriff.json')
  );
  if (report === undefined) {
    return { available: false, violations: 0 };
  }
  return { available: true, violations: asNumber(asRecord(report).violations) };
};
