/**
 * Git churn + hotspots per module.
 *
 * change frequency = number of commits in the window that touched a file.
 * hotspot = cognitive complexity x change frequency (Adam Tornhill).
 *
 * Churn is history-dependent: on a shallow clone (CI default) it self-detects
 * and degrades to `degraded: true` instead of emitting misleading zeros.
 */

import { MODULES_ROOT } from './module-classify';
import type { ChurnMetrics, Hotspot } from './types';
import { runGit } from '../../lib/git-utils.mjs';

const TOP_HOTSPOTS = 5;

const isShallowRepository = (): boolean =>
  runGit(['rev-parse', '--is-shallow-repository']) === 'true';

/** file -> number of commits in the window that touched it. */
const collectChangeFrequency = (window: string): Map<string, number> => {
  const output: string | null = runGit([
    'log',
    `--since=${window}`,
    '--name-only',
    '--pretty=format:',
    '--',
    MODULES_ROOT,
  ]);
  const frequency = new Map<string, number>();
  if (!output) return frequency;

  for (const rawLine of output.split('\n')) {
    const file = rawLine.trim();
    if (!file || !file.startsWith(`${MODULES_ROOT}/`)) continue;
    frequency.set(file, (frequency.get(file) ?? 0) + 1);
  }
  return frequency;
};

const countModuleCommits = (window: string, moduleName: string): number => {
  const output: string | null = runGit([
    'log',
    `--since=${window}`,
    '--pretty=format:%H',
    '--',
    `${MODULES_ROOT}/${moduleName}`,
  ]);
  if (!output) return 0;
  return output.split('\n').filter((line) => line.trim().length > 0).length;
};

export const collectChurn = ({
  window,
  modules,
  cognitiveByFile,
}: {
  window: string;
  modules: string[];
  cognitiveByFile: Map<string, number>;
}): { metrics: Map<string, ChurnMetrics>; warnings: string[] } => {
  const warnings: string[] = [];
  const degraded = isShallowRepository();
  if (degraded) {
    warnings.push(
      'churn: shallow git clone detected; churn/hotspot metrics are degraded (run with full history for accurate values)'
    );
  }

  const frequency = degraded
    ? new Map<string, number>()
    : collectChangeFrequency(window);
  const metrics = new Map<string, ChurnMetrics>();

  for (const moduleName of modules) {
    const prefix = `${MODULES_ROOT}/${moduleName}/`;
    const hotspots: Hotspot[] = [];

    for (const [file, changes] of frequency) {
      if (!file.startsWith(prefix)) continue;
      const cognitive = cognitiveByFile.get(file) ?? 0;
      hotspots.push({ file, changes, cognitive, hotspot: cognitive * changes });
    }

    hotspots.sort((left, right) => right.hotspot - left.hotspot);

    metrics.set(moduleName, {
      window,
      commits: degraded ? 0 : countModuleCommits(window, moduleName),
      topHotspots: hotspots.slice(0, TOP_HOTSPOTS),
      degraded,
    });
  }

  return { metrics, warnings };
};
