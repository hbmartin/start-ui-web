/**
 * Merges every `*.sarif` under test-results/sarif/ (eslint, dependency-cruiser,
 * fitness, plus any natively-emitted Semgrep/CodeQL reports copied in) into a
 * single `combined.sarif` for upload to GitHub code-scanning or for an agent
 * to consume in one pass. Concatenates `runs[]`; never throws on a bad file.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeLog, type SarifRun } from './lib/sarif';

const SARIF_DIR = 'test-results/sarif';
const OUTPUT = 'combined.sarif';

export const merge = (cwd = process.cwd()): { runs: number; files: number } => {
  const dir = path.resolve(cwd, SARIF_DIR);
  mkdirSync(dir, { recursive: true });

  const runs: SarifRun[] = [];
  let files = 0;
  const entries = existsSync(dir)
    ? readdirSync(dir).filter(
        (name) => name.endsWith('.sarif') && name !== OUTPUT
      )
    : [];

  for (const name of entries.sort()) {
    try {
      const log = JSON.parse(readFileSync(path.join(dir, name), 'utf8')) as {
        runs?: SarifRun[];
      };
      if (Array.isArray(log.runs)) {
        runs.push(...log.runs);
        files += 1;
      }
    } catch {
      // Skip unreadable/invalid SARIF files rather than failing the merge.
    }
  }

  writeFileSync(
    path.join(dir, OUTPUT),
    `${JSON.stringify(makeLog(runs), null, 2)}\n`,
    'utf8'
  );
  return { runs: runs.length, files };
};

const entryPointPath = process.argv[1]
  ? path.resolve(process.argv[1])
  : undefined;
if (entryPointPath === fileURLToPath(import.meta.url)) {
  const { runs, files } = merge();
  process.stdout.write(
    `combined SARIF: ${runs} run(s) from ${files} file(s) → ${SARIF_DIR}/${OUTPUT}\n`
  );
}
