import {
  FITNESS_SCHEMA_VERSION,
  type FitnessReport,
  type FitnessScoreName,
  type RatchetDecision,
  type RatchetReport,
} from './report-schema';

const SCORE_DROP_TOLERANCE = 2;
const OPTIONAL_SCORE_DROP_TOLERANCE = 5;
const COMPONENT_REGRESSION_RATIO = 1.1;
const AFFECTED_TEST_AMPLIFICATION_BASELINE = 3;
const AFFECTED_TEST_AMPLIFICATION_PENALTY_FACTOR = 2;
const AFFECTED_TEST_AMPLIFICATION_MAX_PENALTY = 10;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const scoreValue = (report: FitnessReport, scoreName: FitnessScoreName) => {
  switch (scoreName) {
    case 'evolvabilityScore':
      return report.scores.evolvabilityScore;
    case 'operationsScore':
      return report.scores.operationsScore;
    case 'policyScore':
      return report.scores.policyScore;
    case 'testStrengthScore':
      return report.scores.testStrengthScore;
  }
};

const affectedTestAmplificationPenalty = (report: FitnessReport) => {
  const amplification = report.metrics.evolvability.affectedTestAmplification;
  if (amplification === undefined) return 0;

  return clamp(
    Math.max(0, amplification - AFFECTED_TEST_AMPLIFICATION_BASELINE) *
      AFFECTED_TEST_AMPLIFICATION_PENALTY_FACTOR,
    0,
    AFFECTED_TEST_AMPLIFICATION_MAX_PENALTY
  );
};

const hasAffectedTestAmplification = (report: FitnessReport) =>
  report.metrics.evolvability.affectedTestAmplification !== undefined;

const comparableScoreValue = (
  report: FitnessReport,
  peer: FitnessReport,
  scoreName: FitnessScoreName
) => {
  const rawScore = scoreValue(report, scoreName);
  if (
    scoreName !== 'evolvabilityScore' ||
    hasAffectedTestAmplification(report) === hasAffectedTestAmplification(peer)
  ) {
    return rawScore;
  }

  return clamp(rawScore + affectedTestAmplificationPenalty(report), 0, 100);
};

const scoreDrop = (
  base: FitnessReport,
  current: FitnessReport,
  scoreName: FitnessScoreName
) =>
  Number(
    (
      comparableScoreValue(base, current, scoreName) -
      comparableScoreValue(current, base, scoreName)
    ).toFixed(1)
  );

const zeroToleranceErrorCount = (report: FitnessReport) =>
  report.findings.filter(
    (finding) => finding.zeroTolerance && finding.level === 'error'
  ).length;

const zeroToleranceFingerprint = (finding: FitnessReport['findings'][number]) =>
  [
    finding.id,
    finding.location?.file ?? '',
    finding.location?.line ?? '',
    finding.message,
  ].join('|');

const newZeroToleranceFindings = (
  base: FitnessReport,
  current: FitnessReport
) => {
  const baseFingerprints = new Set(
    base.findings
      .filter((finding) => finding.zeroTolerance && finding.level === 'error')
      .map(zeroToleranceFingerprint)
  );

  return current.findings
    .filter((finding) => finding.zeroTolerance && finding.level === 'error')
    .filter(
      (finding) => !baseFingerprints.has(zeroToleranceFingerprint(finding))
    );
};

const optionalArtifactPresent = (
  base: FitnessReport,
  current: FitnessReport,
  scoreName: 'operationsScore' | 'testStrengthScore'
) => {
  if (scoreName === 'operationsScore') {
    return (
      base.metrics.operations.artifactCount > 0 &&
      current.metrics.operations.artifactCount > 0
    );
  }

  return (
    base.metrics.testStrength.artifactCount > 0 &&
    current.metrics.testStrength.artifactCount > 0
  );
};

const addDecision = (
  decisions: RatchetDecision[],
  decision: RatchetDecision
) => {
  decisions.push(decision);
};

const hasOffsettingEvolvabilityImprovement = (
  base: FitnessReport,
  current: FitnessReport
) => current.scores.evolvabilityScore > base.scores.evolvabilityScore;

const deterministicRegressions = (
  base: FitnessReport,
  current: FitnessReport
) => {
  const candidates = [
    {
      id: 'dependency-edge-count',
      label: 'dependency edge count',
      base: base.metrics.evolvability.dependencyEdgeCount,
      current: current.metrics.evolvability.dependencyEdgeCount,
    },
    {
      id: 'graph-density',
      label: 'graph density',
      base: base.metrics.evolvability.graphDensity,
      current: current.metrics.evolvability.graphDensity,
    },
    {
      id: 'max-fan-out',
      label: 'max fan-out',
      base: base.metrics.evolvability.maxFanOut,
      current: current.metrics.evolvability.maxFanOut,
    },
    {
      id: 'public-gate-export-count',
      label: 'public gate export count',
      base: base.metrics.evolvability.publicGateExportCount,
      current: current.metrics.evolvability.publicGateExportCount,
    },
  ];

  return candidates.filter((candidate) => {
    if (candidate.base <= 0) return candidate.current > 1;
    return candidate.current > candidate.base * COMPONENT_REGRESSION_RATIO;
  });
};

export const evaluateRatchet = ({
  base,
  current,
}: {
  base: FitnessReport;
  current: FitnessReport;
}): RatchetReport => {
  const decisions: RatchetDecision[] = [];
  const baseHardFindings = zeroToleranceErrorCount(base);
  const currentHardFindings = zeroToleranceErrorCount(current);
  const newHardFindings = newZeroToleranceFindings(base, current);

  if (newHardFindings.length > 0) {
    addDecision(decisions, {
      blocked: true,
      id: 'new-zero-tolerance-findings',
      level: 'error',
      message: `${newHardFindings.length} new zero-tolerance finding(s): ${newHardFindings
        .slice(0, 5)
        .map((finding) => finding.id)
        .join(', ')}.`,
    });
  }

  if (currentHardFindings > baseHardFindings) {
    addDecision(decisions, {
      blocked: true,
      id: 'zero-tolerance-findings-increased',
      level: 'error',
      message: `Zero-tolerance findings increased from ${baseHardFindings} to ${currentHardFindings}.`,
    });
  }

  if (current.scores.policyScore < 100) {
    addDecision(decisions, {
      blocked: true,
      id: 'policy-score-below-perfect',
      level: 'error',
      message: `Policy score is ${current.scores.policyScore}; v1 requires 100.`,
    });
  }

  const evolvabilityDrop = scoreDrop(base, current, 'evolvabilityScore');
  if (evolvabilityDrop > SCORE_DROP_TOLERANCE) {
    addDecision(decisions, {
      blocked: true,
      id: 'evolvability-score-regressed',
      level: 'error',
      message: `Evolvability score dropped by ${evolvabilityDrop}, above the ${SCORE_DROP_TOLERANCE} point tolerance.`,
    });
  }

  if (
    hasAffectedTestAmplification(base) !== hasAffectedTestAmplification(current)
  ) {
    addDecision(decisions, {
      blocked: false,
      id: 'evolvabilityScore/affected-test-amplification-not-comparable',
      level: 'note',
      message:
        'affectedTestAmplification is reported but excluded from score-drop blocking because only one side has the PR-diff metric.',
    });
  }

  if (!hasOffsettingEvolvabilityImprovement(base, current)) {
    for (const regression of deterministicRegressions(base, current)) {
      addDecision(decisions, {
        blocked: true,
        id: `deterministic-regression/${regression.id}`,
        level: 'error',
        message: `${regression.label} increased from ${regression.base} to ${regression.current}, above the 10% ratchet tolerance.`,
      });
    }
  }

  for (const scoreName of ['testStrengthScore', 'operationsScore'] as const) {
    if (!optionalArtifactPresent(base, current, scoreName)) {
      addDecision(decisions, {
        blocked: false,
        id: `${scoreName}/missing-optional-artifacts`,
        level: 'note',
        message: `${scoreName} is reported only because base and current artifacts are not both available.`,
      });
      continue;
    }

    const drop = scoreDrop(base, current, scoreName);
    if (drop > OPTIONAL_SCORE_DROP_TOLERANCE) {
      addDecision(decisions, {
        blocked: true,
        id: `${scoreName}/optional-score-regressed`,
        level: 'error',
        message: `${scoreName} dropped by ${drop}, above the ${OPTIONAL_SCORE_DROP_TOLERANCE} point tolerance.`,
      });
    }
  }

  return {
    base: {
      git: base.git,
      scores: base.scores,
    },
    current: {
      git: current.git,
      scores: current.scores,
    },
    decisions,
    generatedAt: new Date().toISOString(),
    schemaVersion: FITNESS_SCHEMA_VERSION,
  };
};
