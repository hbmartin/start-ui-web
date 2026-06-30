import type {
  FitnessFinding,
  FitnessReport,
  FitnessScoreName,
  FitnessScores,
  RatchetReport,
} from './report-schema';

const SCORE_ROWS: ReadonlyArray<{
  label: string;
  name: FitnessScoreName;
}> = [
  { label: 'Policy', name: 'policyScore' },
  { label: 'Evolvability', name: 'evolvabilityScore' },
  { label: 'Test strength', name: 'testStrengthScore' },
  { label: 'Operations', name: 'operationsScore' },
];

const formatScore = (value: number) => value.toFixed(1);

const formatOptionalNumber = (value: number | undefined) =>
  value === undefined ? 'n/a' : value.toFixed(2);

const scoreValue = (scores: FitnessScores, scoreName: FitnessScoreName) => {
  switch (scoreName) {
    case 'evolvabilityScore':
      return scores.evolvabilityScore;
    case 'operationsScore':
      return scores.operationsScore;
    case 'policyScore':
      return scores.policyScore;
    case 'testStrengthScore':
      return scores.testStrengthScore;
  }
};

const formatFindingLocation = (finding: FitnessFinding) => {
  if (!finding.location) return '';

  const { column, file, line } = finding.location;
  if (line === undefined) return ` (${file})`;
  if (column === undefined) return ` (${file}:${line})`;
  return ` (${file}:${line}:${column})`;
};

const summarizeFindings = (findings: FitnessFinding[]) => {
  const hardFindings = findings.filter((finding) => finding.zeroTolerance);
  if (hardFindings.length === 0) return ['- No zero-tolerance findings.'];

  return hardFindings
    .slice(0, 25)
    .map(
      (finding) =>
        `- ${finding.level.toUpperCase()} ${finding.id}: ${
          finding.message
        }${formatFindingLocation(finding)}`
    );
};

export const formatFitnessMarkdown = (report: FitnessReport) => {
  const lines = [
    '# Fitness Report',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Commit: ${report.git.commit ?? 'unknown'}`,
    `- Branch: ${report.git.branch ?? 'unknown'}`,
    `- Dirty worktree: ${report.git.dirty ? 'yes' : 'no'}`,
    '',
    '## Scores',
    '',
    '| Score | Value |',
    '| --- | ---: |',
    ...SCORE_ROWS.map(
      ({ label, name }) =>
        `| ${label} | ${formatScore(scoreValue(report.scores, name))} |`
    ),
    '',
    '## Policy Metrics',
    '',
    `- Dependency-cruiser errors: ${report.metrics.policy.dependencyCruiserErrorCount}`,
    `- Forbidden dependencies: ${report.metrics.policy.forbiddenDependencyCount}`,
    `- Circular dependencies: ${report.metrics.policy.circularDependencyCount}`,
    `- Unresolved imports: ${report.metrics.policy.unresolvedImportCount}`,
    `- Semgrep errors: ${report.metrics.policy.semgrepErrorCount}`,
    `- CodeQL errors: ${report.metrics.policy.codeqlErrorCount}`,
    '',
    '## Evolvability Metrics',
    '',
    `- Modules: ${report.metrics.evolvability.moduleCount}`,
    `- Module/layer nodes: ${report.metrics.evolvability.moduleLayerNodeCount}`,
    `- Dependency edges: ${report.metrics.evolvability.dependencyEdgeCount}`,
    `- Graph density: ${formatOptionalNumber(
      report.metrics.evolvability.graphDensity
    )}`,
    `- Max fan-in: ${report.metrics.evolvability.maxFanIn}`,
    `- Max fan-out: ${report.metrics.evolvability.maxFanOut}`,
    `- Public gate exports: ${report.metrics.evolvability.publicGateExportCount}`,
    `- Affected-test amplification: ${formatOptionalNumber(
      report.metrics.evolvability.affectedTestAmplification
    )}`,
    '',
    '## Findings',
    '',
    ...summarizeFindings(report.findings),
    '',
    '## Artifact Inputs',
    '',
    ...report.artifactInputs.map(
      (input) =>
        `- ${input.found ? 'found' : 'missing'} ${input.name}: \`${input.path}\`${
          input.details ? ` (${input.details})` : ''
        }`
    ),
    '',
  ];

  return `${lines.join('\n')}`;
};

export const formatRatchetMarkdown = (report: RatchetReport) => {
  const lines = [
    '# Fitness Ratchet Report',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Base commit: ${report.base.git.commit ?? 'unknown'}`,
    `- Current commit: ${report.current.git.commit ?? 'unknown'}`,
    '',
    '## Score Delta',
    '',
    '| Score | Base | Current | Delta |',
    '| --- | ---: | ---: | ---: |',
    ...SCORE_ROWS.map(({ label, name }) => {
      const base = scoreValue(report.base.scores, name);
      const current = scoreValue(report.current.scores, name);
      return `| ${label} | ${formatScore(base)} | ${formatScore(
        current
      )} | ${formatScore(current - base)} |`;
    }),
    '',
    '## Decisions',
    '',
    ...(report.decisions.length === 0
      ? ['- No ratchet decisions were produced.']
      : report.decisions.map(
          (decision) =>
            `- ${decision.blocked ? 'BLOCK' : decision.level.toUpperCase()} ${
              decision.id
            }: ${decision.message}`
        )),
    '',
  ];

  return `${lines.join('\n')}`;
};

export const createFitnessSarif = (report: FitnessReport) => {
  const rules = new Map(
    report.findings.map((finding) => [
      finding.id,
      {
        id: finding.id,
        name: finding.id,
        shortDescription: { text: finding.id },
      },
    ])
  );

  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0-rtm.5.json',
    runs: [
      {
        tool: {
          driver: {
            name: 'start-ui-web-fitness',
            informationUri: 'https://github.com/hbmartin/start-ui-web',
            rules: [...rules.values()],
          },
        },
        results: report.findings.map((finding) => ({
          ruleId: finding.id,
          level: finding.level,
          message: { text: finding.message },
          ...(finding.location
            ? {
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: {
                        uri: finding.location.file,
                      },
                      region: {
                        ...(finding.location.line === undefined
                          ? {}
                          : { startLine: finding.location.line }),
                        ...(finding.location.column === undefined
                          ? {}
                          : { startColumn: finding.location.column }),
                      },
                    },
                  },
                ],
              }
            : {}),
        })),
      },
    ],
  };
};
