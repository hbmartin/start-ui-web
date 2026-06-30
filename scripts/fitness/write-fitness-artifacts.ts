/* eslint-disable security/detect-non-literal-fs-filename -- Report paths are resolved and constrained to test-results/fitness before writes. */

import fs from 'node:fs';
import path from 'node:path';

import {
  createFitnessSarif,
  formatFitnessMarkdown,
  formatRatchetMarkdown,
} from './format-fitness-report';
import type { FitnessReport, RatchetReport } from './report-schema';

const FITNESS_OUTPUT_ROOT = path.join('test-results', 'fitness');

export const resolveFitnessOutputDir = (cwd: string, outputDir: string) => {
  const absoluteOutputDir = path.resolve(cwd, outputDir);
  const absoluteFitnessRoot = path.resolve(cwd, FITNESS_OUTPUT_ROOT);
  const relative = path.relative(absoluteFitnessRoot, absoluteOutputDir);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(
      `Fitness reports must be written under ${FITNESS_OUTPUT_ROOT}. Received ${outputDir}.`
    );
  }

  return absoluteOutputDir;
};

const writeJson = (filePath: string, value: unknown) => {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

export const writeFitnessArtifacts = ({
  cwd,
  outputDir,
  report,
}: {
  cwd: string;
  outputDir: string;
  report: FitnessReport;
}) => {
  const absoluteOutputDir = resolveFitnessOutputDir(cwd, outputDir);
  fs.mkdirSync(absoluteOutputDir, { recursive: true });

  const jsonPath = path.join(absoluteOutputDir, 'fitness-report.json');
  const markdownPath = path.join(absoluteOutputDir, 'fitness-report.md');
  const sarifPath = path.join(absoluteOutputDir, 'fitness.sarif');

  writeJson(jsonPath, report);
  fs.writeFileSync(markdownPath, formatFitnessMarkdown(report), 'utf8');
  writeJson(sarifPath, createFitnessSarif(report));

  return { jsonPath, markdownPath, sarifPath };
};

export const writeRatchetArtifacts = ({
  cwd,
  outputDir,
  report,
}: {
  cwd: string;
  outputDir: string;
  report: RatchetReport;
}) => {
  const absoluteOutputDir = resolveFitnessOutputDir(cwd, outputDir);
  fs.mkdirSync(absoluteOutputDir, { recursive: true });

  const jsonPath = path.join(absoluteOutputDir, 'ratchet-report.json');
  const markdownPath = path.join(absoluteOutputDir, 'ratchet-report.md');

  writeJson(jsonPath, report);
  fs.writeFileSync(markdownPath, formatRatchetMarkdown(report), 'utf8');

  return { jsonPath, markdownPath };
};
