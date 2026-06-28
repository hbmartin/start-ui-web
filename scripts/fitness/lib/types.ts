/**
 * Shared types for the fitness metrics collector and scorecard.
 *
 * The scorecard is the single machine-readable aggregation of every fitness
 * signal (existing Layer-1 conformance results + new evolvability metrics).
 * It is written to the gitignored `test-results/fitness/` directory; the
 * committed baseline (see `fitness/baseline.json`) is a trimmed projection of
 * it used for the ratchet gate.
 */

export const SCORECARD_SCHEMA_VERSION = 1;
export const COLLECTOR_VERSION = '1.0.0';

export type FitnessStatus = 'pass' | 'warn' | 'fail';

export type CouplingMetrics = {
  /** Afferent coupling (Ca): modules that depend on this module. */
  afferent: number;
  /** Efferent coupling (Ce): modules this module depends on. */
  efferent: number;
  /** Instability I = Ce / (Ce + Ca), range 0..1. */
  instability: number;
  /** Abstractness A = abstractTypes / (abstractTypes + concreteTypes), 0..1. */
  abstractness: number;
  /** Distance from the main sequence D = |A + I - 1|, 0..1 (lower is better). */
  distance: number;
  abstractTypes: number;
  concreteTypes: number;
  /** Where Ca/Ce/I came from, for auditability. */
  source: 'dependency-cruiser-metrics' | 'edge-graph-fallback';
};

export type ComplexityStat = {
  max: number;
  mean: number;
  p90: number;
};

export type ComplexityMetrics = {
  cyclomatic: ComplexityStat;
  cognitive: ComplexityStat;
  /** Number of source files analysed for this module. */
  files: number;
  /** Number of function-like nodes analysed. */
  functions: number;
};

export type Hotspot = {
  file: string;
  changes: number;
  cognitive: number;
  /** hotspot = cognitive complexity x change frequency (Tornhill). */
  hotspot: number;
};

export type ChurnMetrics = {
  window: string;
  commits: number;
  topHotspots: Hotspot[];
  /** True when git history is too shallow to compute churn reliably. */
  degraded: boolean;
};

export type ModuleMetrics = {
  coupling: CouplingMetrics;
  complexity: ComplexityMetrics;
  churn?: ChurnMetrics;
};

export type SignalAvailability = { available: boolean };

export type Scorecard = {
  schemaVersion: number;
  generatedAt: string;
  commit: string | null;
  base: string | null;
  tooling: {
    dependencyCruiser: string;
    collector: string;
  };
  warnings: string[];
  summary: {
    overallStatus: FitnessStatus;
    worstDistanceModule: string | null;
    worstDistance: number;
    moduleCount: number;
  };
  modules: Record<string, ModuleMetrics>;
  signals: {
    dependencyCruiser: SignalAvailability & {
      errors: number;
      warnings: number;
      circular: number;
    };
    architectureSuite: SignalAvailability & {
      tests: number;
      passed: number;
      failed: number;
    };
    duplication: SignalAvailability & {
      percentage: number;
      clones: number;
    };
    bundle: SignalAvailability & {
      entries: BundleEntry[];
      buildTimeMs: number | null;
    };
    sheriff: SignalAvailability & { violations: number };
  };
};

export type BundleEntry = {
  name: string;
  passed: boolean;
  size: number;
  sizeLimit: number | null;
};

/** Trimmed, committed projection used for ratchet comparisons. */
export type ModuleBaseline = {
  instability: number;
  abstractness: number;
  distance: number;
  cyclomatic_p90: number;
  cognitive_p90: number;
  afferent: number;
  efferent: number;
};

export type Baseline = {
  schemaVersion: number;
  modules: Record<string, ModuleBaseline>;
  signals: {
    duplication_percentage: number;
    circular: number;
    sheriff_violations: number;
  };
  bundle: Record<string, number>;
};

export type Thresholds = {
  distance: { ceiling: number; regressionTolerance: number };
  instability: { regressionTolerance: number };
  cognitive_p90: { regressionTolerance: number };
  cyclomatic_p90: { regressionTolerance: number };
  duplication: { ceiling_percentage: number; regressionTolerance: number };
  circular: { ceiling: number };
  sheriff: { regressionTolerance: number };
  bundle: {
    regressionBytesTolerance: number;
    regressionRatioTolerance: number;
  };
};

export type Regression = {
  module: string | null;
  metric: string;
  baseline: number;
  current: number;
  delta: number;
  severity: 'fail' | 'warn';
  message: string;
};

export type RatchetResult = {
  status: FitnessStatus;
  regressions: Regression[];
};
