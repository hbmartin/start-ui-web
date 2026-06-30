export const FITNESS_SCHEMA_VERSION = '1.0.0' as const;

export type FitnessLevel = 'error' | 'note' | 'warning';

export type FitnessScoreName =
  | 'evolvabilityScore'
  | 'operationsScore'
  | 'policyScore'
  | 'testStrengthScore';

export type FitnessScores = Record<FitnessScoreName, number>;

export type FitnessFinding = {
  id: string;
  level: FitnessLevel;
  message: string;
  source: string;
  zeroTolerance: boolean;
  location?: {
    column?: number;
    file: string;
    line?: number;
  };
};

export type FitnessArtifactInput = {
  found: boolean;
  name: string;
  path: string;
  details?: string;
};

export type FitnessGitMetadata = {
  branch?: string;
  commit?: string;
  dirty: boolean;
};

export type PolicyMetrics = {
  circularDependencyCount: number;
  codeqlErrorCount: number;
  dependencyCruiserErrorCount: number;
  forbiddenDependencyCount: number;
  productionTestingGateImportCount: number;
  routeDeepImportCount: number;
  semgrepErrorCount: number;
  unresolvedImportCount: number;
};

export type EvolvabilityMetrics = {
  affectedTestAmplification?: number;
  averageFanOut: number;
  churnedFiles: number;
  churnedLines: number;
  dependencyEdgeCount: number;
  eslintWarningCount: number;
  graphDensity: number;
  maxChurnShare: number;
  maxFanIn: number;
  maxFanOut: number;
  moduleCount: number;
  moduleLayerNodeCount: number;
  publicGateExportCount: number;
  publicGateFileCount: number;
  sonarWarningCount: number;
};

export type TestStrengthMetrics = {
  artifactCount: number;
  coveragePercent?: number;
  mutationScore?: number;
};

export type OperationsMetrics = {
  artifactCount: number;
  buildDurationMs?: number;
  buildOutputBytes?: number;
  playwrightFailureCount?: number;
};

export type FitnessMetrics = {
  evolvability: EvolvabilityMetrics;
  operations: OperationsMetrics;
  policy: PolicyMetrics;
  testStrength: TestStrengthMetrics;
};

export type FitnessReport = {
  artifactInputs: FitnessArtifactInput[];
  cwd: string;
  findings: FitnessFinding[];
  generatedAt: string;
  git: FitnessGitMetadata;
  metrics: FitnessMetrics;
  schemaVersion: typeof FITNESS_SCHEMA_VERSION;
  scores: FitnessScores;
};

export type RatchetDecision = {
  blocked: boolean;
  id: string;
  level: FitnessLevel;
  message: string;
};

export type RatchetReport = {
  base: {
    git: FitnessGitMetadata;
    scores: FitnessScores;
  };
  current: {
    git: FitnessGitMetadata;
    scores: FitnessScores;
  };
  decisions: RatchetDecision[];
  generatedAt: string;
  schemaVersion: typeof FITNESS_SCHEMA_VERSION;
};
