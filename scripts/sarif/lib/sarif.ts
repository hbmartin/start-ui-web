/**
 * Minimal typed SARIF 2.1.0 builder.
 *
 * SARIF (Static Analysis Results Interchange Format, OASIS Standard 2.1.0) is
 * the lingua franca for feeding analysis results to AI coding agents and to
 * GitHub code-scanning. A `result` pairs ruleId + level + message + location,
 * which an agent renders directly into a fix.
 */

export type SarifLevel = 'error' | 'warning' | 'note';

export type SarifRule = {
  id: string;
  name?: string;
  shortDescription: { text: string };
  helpUri?: string;
  defaultConfiguration?: { level: SarifLevel };
};

export type SarifResult = {
  ruleId: string;
  level: SarifLevel;
  message: { text: string };
  locations?: Array<{
    physicalLocation: {
      artifactLocation: { uri: string };
      region?: { startLine: number; startColumn?: number };
    };
  }>;
  partialFingerprints?: Record<string, string>;
};

export type SarifRun = {
  tool: {
    driver: {
      name: string;
      informationUri?: string;
      version?: string;
      rules: SarifRule[];
    };
  };
  results: SarifResult[];
};

export type SarifLog = {
  $schema: string;
  version: '2.1.0';
  runs: SarifRun[];
};

const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';

export const makeResult = ({
  ruleId,
  level,
  message,
  file,
  line,
  column,
  fingerprint,
}: {
  ruleId: string;
  level: SarifLevel;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  fingerprint?: string;
}): SarifResult => {
  const result: SarifResult = { ruleId, level, message: { text: message } };
  if (file) {
    result.locations = [
      {
        physicalLocation: {
          artifactLocation: { uri: file },
          ...(line
            ? {
                region: {
                  startLine: line,
                  ...(column ? { startColumn: column } : {}),
                },
              }
            : {}),
        },
      },
    ];
  }
  if (fingerprint)
    result.partialFingerprints = { fitnessFingerprint: fingerprint };
  return result;
};

export const makeRun = ({
  name,
  informationUri,
  version,
  rules,
  results,
}: {
  name: string;
  informationUri?: string;
  version?: string;
  rules: SarifRule[];
  results: SarifResult[];
}): SarifRun => ({
  tool: { driver: { name, informationUri, version, rules } },
  results,
});

export const makeLog = (runs: SarifRun[]): SarifLog => ({
  $schema: SARIF_SCHEMA,
  version: '2.1.0',
  runs,
});
