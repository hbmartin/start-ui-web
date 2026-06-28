/**
 * Scorecard assembly, baseline projection, ratchet evaluation, and markdown.
 *
 * The ratchet gates ONLY on new-code regressions: a regression in a module not
 * touched by the current diff is downgraded to a warning, so repo-wide metric
 * drift from a tool upgrade can never hard-fail a PR. Absolute invariants (new
 * circular dependency, duplication/bundle ceilings) always gate.
 */

import {
  type Baseline,
  COLLECTOR_VERSION,
  type ModuleMetrics,
  type RatchetResult,
  type Regression,
  type Scorecard,
  SCORECARD_SCHEMA_VERSION,
  type Thresholds,
} from './types';

export const DEFAULT_THRESHOLDS: Thresholds = {
  distance: { ceiling: 0.7, regressionTolerance: 0.05 },
  instability: { regressionTolerance: 0.1 },
  cognitive_p90: { regressionTolerance: 2 },
  cyclomatic_p90: { regressionTolerance: 2 },
  duplication: { ceiling_percentage: 5, regressionTolerance: 0.5 },
  circular: { ceiling: 0 },
  sheriff: { regressionTolerance: 0 },
  bundle: { regressionBytesTolerance: 5120, regressionRatioTolerance: 0.03 },
};

export const assembleScorecard = ({
  modules,
  signals,
  warnings,
  commit,
  base,
  dependencyCruiserVersion,
  generatedAt,
}: {
  modules: Record<string, ModuleMetrics>;
  signals: Scorecard['signals'];
  warnings: string[];
  commit: string | null;
  base: string | null;
  dependencyCruiserVersion: string;
  generatedAt: string;
}): Scorecard => {
  let worstDistance = 0;
  let worstDistanceModule: string | null = null;
  for (const [moduleName, metrics] of Object.entries(modules)) {
    if (metrics.coupling.distance > worstDistance) {
      worstDistance = metrics.coupling.distance;
      worstDistanceModule = moduleName;
    }
  }

  return {
    schemaVersion: SCORECARD_SCHEMA_VERSION,
    generatedAt,
    commit,
    base,
    tooling: {
      dependencyCruiser: dependencyCruiserVersion,
      collector: COLLECTOR_VERSION,
    },
    warnings,
    summary: {
      overallStatus: 'pass',
      worstDistanceModule,
      worstDistance,
      moduleCount: Object.keys(modules).length,
    },
    modules,
    signals,
  };
};

export const projectBaseline = (scorecard: Scorecard): Baseline => {
  const modules: Baseline['modules'] = {};
  for (const [moduleName, metrics] of Object.entries(scorecard.modules)) {
    modules[moduleName] = {
      instability: metrics.coupling.instability,
      abstractness: metrics.coupling.abstractness,
      distance: metrics.coupling.distance,
      cyclomatic_p90: metrics.complexity.cyclomatic.p90,
      cognitive_p90: metrics.complexity.cognitive.p90,
      afferent: metrics.coupling.afferent,
      efferent: metrics.coupling.efferent,
    };
  }

  const bundle: Baseline['bundle'] = {};
  for (const entry of scorecard.signals.bundle.entries) {
    bundle[entry.name] = entry.size;
  }

  return {
    schemaVersion: SCORECARD_SCHEMA_VERSION,
    modules,
    signals: {
      duplication_percentage: scorecard.signals.duplication.percentage,
      circular: scorecard.signals.dependencyCruiser.circular,
      sheriff_violations: scorecard.signals.sheriff.violations,
    },
    bundle,
  };
};

const downgradeIfUnchanged = (
  severity: 'fail' | 'warn',
  moduleName: string,
  changedModules: Set<string> | null
): 'fail' | 'warn' =>
  severity === 'fail' &&
  changedModules !== null &&
  !changedModules.has(moduleName)
    ? 'warn'
    : severity;

export const evaluateRatchet = (
  scorecard: Scorecard,
  baseline: Baseline,
  thresholds: Thresholds,
  changedModules: Set<string> | null = null
): RatchetResult => {
  const regressions: Regression[] = [];

  for (const [moduleName, current] of Object.entries(scorecard.modules)) {
    const moduleBaseline = baseline.modules[moduleName];
    if (!moduleBaseline) {
      regressions.push({
        module: moduleName,
        metric: 'baseline-coverage',
        baseline: 0,
        current: 1,
        delta: 1,
        severity: 'warn',
        message: `module "${moduleName}" is not in the baseline; run \`pnpm fitness:baseline\``,
      });
      continue;
    }

    const distance = current.coupling.distance;
    const distanceDelta = distance - moduleBaseline.distance;
    const crossedCeiling =
      distance > thresholds.distance.ceiling &&
      moduleBaseline.distance <= thresholds.distance.ceiling;
    if (
      crossedCeiling ||
      distanceDelta > thresholds.distance.regressionTolerance
    ) {
      regressions.push({
        module: moduleName,
        metric: 'distance',
        baseline: moduleBaseline.distance,
        current: distance,
        delta: Math.round(distanceDelta * 10000) / 10000,
        severity: downgradeIfUnchanged('fail', moduleName, changedModules),
        message: crossedCeiling
          ? `distance D crossed the ${thresholds.distance.ceiling} ceiling (${distance})`
          : `distance D rose by ${Math.round(distanceDelta * 1000) / 1000}`,
      });
    }

    const cognitiveDelta =
      current.complexity.cognitive.p90 - moduleBaseline.cognitive_p90;
    if (cognitiveDelta > thresholds.cognitive_p90.regressionTolerance) {
      regressions.push({
        module: moduleName,
        metric: 'cognitive_p90',
        baseline: moduleBaseline.cognitive_p90,
        current: current.complexity.cognitive.p90,
        delta: cognitiveDelta,
        severity: downgradeIfUnchanged('fail', moduleName, changedModules),
        message: `cognitive complexity p90 rose by ${cognitiveDelta}`,
      });
    }

    const cyclomaticDelta =
      current.complexity.cyclomatic.p90 - moduleBaseline.cyclomatic_p90;
    if (cyclomaticDelta > thresholds.cyclomatic_p90.regressionTolerance) {
      regressions.push({
        module: moduleName,
        metric: 'cyclomatic_p90',
        baseline: moduleBaseline.cyclomatic_p90,
        current: current.complexity.cyclomatic.p90,
        delta: cyclomaticDelta,
        severity: downgradeIfUnchanged('fail', moduleName, changedModules),
        message: `cyclomatic complexity p90 rose by ${cyclomaticDelta}`,
      });
    }
  }

  // Absolute, repo-wide invariants always gate (never downgraded).
  const circular = scorecard.signals.dependencyCruiser.circular;
  if (
    scorecard.signals.dependencyCruiser.available &&
    circular > Math.max(baseline.signals.circular, thresholds.circular.ceiling)
  ) {
    regressions.push({
      module: null,
      metric: 'circular',
      baseline: baseline.signals.circular,
      current: circular,
      delta: circular - baseline.signals.circular,
      severity: 'fail',
      message: `new circular dependencies introduced (${circular})`,
    });
  }

  const duplication = scorecard.signals.duplication;
  if (duplication.available) {
    const exceeded =
      duplication.percentage >
        baseline.signals.duplication_percentage +
          thresholds.duplication.regressionTolerance ||
      duplication.percentage > thresholds.duplication.ceiling_percentage;
    if (exceeded) {
      regressions.push({
        module: null,
        metric: 'duplication',
        baseline: baseline.signals.duplication_percentage,
        current: duplication.percentage,
        delta:
          Math.round(
            (duplication.percentage - baseline.signals.duplication_percentage) *
              1000
          ) / 1000,
        severity: 'fail',
        message: `code duplication rose to ${duplication.percentage}%`,
      });
    }
  }

  const sheriff = scorecard.signals.sheriff;
  if (
    sheriff.available &&
    sheriff.violations >
      baseline.signals.sheriff_violations +
        thresholds.sheriff.regressionTolerance
  ) {
    regressions.push({
      module: null,
      metric: 'sheriff',
      baseline: baseline.signals.sheriff_violations,
      current: sheriff.violations,
      delta: sheriff.violations - baseline.signals.sheriff_violations,
      severity: 'fail',
      message: `new Sheriff boundary violations (${sheriff.violations})`,
    });
  }

  for (const entry of scorecard.signals.bundle.entries) {
    const baselineBytes = baseline.bundle[entry.name];
    if (baselineBytes === undefined) continue;
    const allowance = Math.max(
      thresholds.bundle.regressionBytesTolerance,
      baselineBytes * thresholds.bundle.regressionRatioTolerance
    );
    if (entry.size > baselineBytes + allowance) {
      regressions.push({
        module: null,
        metric: 'bundle',
        baseline: baselineBytes,
        current: entry.size,
        delta: entry.size - baselineBytes,
        severity: 'fail',
        message: `bundle "${entry.name}" grew by ${entry.size - baselineBytes} bytes`,
      });
    }
  }

  const hasFail = regressions.some(
    (regression) => regression.severity === 'fail'
  );
  const hasWarn = regressions.some(
    (regression) => regression.severity === 'warn'
  );
  const status: Scorecard['summary']['overallStatus'] = hasFail
    ? 'fail'
    : hasWarn
      ? 'warn'
      : 'pass';

  return { status, regressions };
};

const STATUS_BADGE: Record<Scorecard['summary']['overallStatus'], string> = {
  pass: 'PASS ✅',
  warn: 'WARN ⚠️',
  fail: 'FAIL ❌',
};

const arrow = (current: number, baseline: number | undefined): string => {
  if (baseline === undefined) return '';
  const delta = Math.round((current - baseline) * 1000) / 1000;
  if (delta > 0) return ` ▲${delta}`;
  if (delta < 0) return ` ▼${Math.abs(delta)}`;
  return ' =';
};

export const formatMarkdown = (
  scorecard: Scorecard,
  baseline?: Baseline,
  ratchet?: RatchetResult
): string => {
  const status = ratchet?.status ?? scorecard.summary.overallStatus;
  const lines: string[] = [
    '# Fitness Scorecard',
    '',
    `**Status:** ${STATUS_BADGE[status]} · generated ${scorecard.generatedAt}`,
    '',
    `Worst distance-from-main-sequence: \`${scorecard.summary.worstDistanceModule ?? 'n/a'}\` (D=${scorecard.summary.worstDistance}).`,
    '',
  ];

  if (scorecard.warnings.length > 0) {
    lines.push('> [!NOTE]', ...scorecard.warnings.map((w) => `> ${w}`), '');
  }

  lines.push(
    '## Modules',
    '',
    '| Module | Ca | Ce | I | A | D | Cyclo p90 | Cognitive p90 | Top hotspot |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |'
  );
  for (const [moduleName, metrics] of Object.entries(scorecard.modules).sort(
    ([left], [right]) => left.localeCompare(right, 'en')
  )) {
    const moduleBaseline = baseline?.modules[moduleName];
    const topHotspot = metrics.churn?.topHotspots[0];
    const hotspotText = topHotspot
      ? `${topHotspot.file.replace('src/modules/', '')} (${topHotspot.hotspot})`
      : '—';
    lines.push(
      `| ${moduleName} | ${metrics.coupling.afferent} | ${metrics.coupling.efferent} | ${metrics.coupling.instability} | ${metrics.coupling.abstractness} | ${metrics.coupling.distance}${arrow(metrics.coupling.distance, moduleBaseline?.distance)} | ${metrics.complexity.cyclomatic.p90} | ${metrics.complexity.cognitive.p90} | ${hotspotText} |`
    );
  }
  lines.push('');

  if (ratchet && ratchet.regressions.length > 0) {
    lines.push('## Regressions since baseline', '');
    for (const regression of ratchet.regressions) {
      const scope = regression.module ? `\`${regression.module}\`` : 'repo';
      const icon = regression.severity === 'fail' ? '❌' : '⚠️';
      lines.push(
        `- ${icon} ${scope} **${regression.metric}**: ${regression.message} (baseline ${regression.baseline} → ${regression.current})`
      );
    }
    lines.push('');
  }

  const s = scorecard.signals;
  lines.push(
    '<details><summary>Layer-1 signals</summary>',
    '',
    '| Signal | Available | Value |',
    '| --- | --- | --- |',
    `| dependency-cruiser | ${s.dependencyCruiser.available} | errors ${s.dependencyCruiser.errors}, warnings ${s.dependencyCruiser.warnings}, circular ${s.dependencyCruiser.circular} |`,
    `| architecture suite | ${s.architectureSuite.available} | ${s.architectureSuite.passed}/${s.architectureSuite.tests} passed |`,
    `| duplication (jscpd) | ${s.duplication.available} | ${s.duplication.percentage}% (${s.duplication.clones} clones) |`,
    `| sheriff | ${s.sheriff.available} | ${s.sheriff.violations} violations |`,
    `| bundle | ${s.bundle.available} | ${s.bundle.entries.length} entries${s.bundle.buildTimeMs !== null ? `, build ${s.bundle.buildTimeMs}ms` : ''} |`,
    '',
    '</details>',
    ''
  );

  return lines.join('\n');
};
