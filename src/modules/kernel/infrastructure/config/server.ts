import { envClient } from '@/platform/env/client';

import { getAuthConfig } from './auth';
import { getDatabaseConfig } from './database';
import { assertDemoModeNotInProduction } from './demo-mode-guard';
import { getEmailConfig } from './email';
import {
  isProdRuntimeEnvironment,
  shouldSkipEnvValidation,
} from './env-schema';
import { getLoggerConfig } from './logger';
import { getRedisConfig } from './redis';
import { getStorageConfig } from './storage';
import { getTelemetryConfig } from './telemetry';

export function validateServerConfig() {
  if (shouldSkipEnvValidation()) return;

  assertDemoModeNotInProduction(
    isProdRuntimeEnvironment(),
    envClient.VITE_IS_DEMO
  );
  getAuthConfig();
  getDatabaseConfig();
  getEmailConfig();
  getLoggerConfig();
  getRedisConfig();
  getStorageConfig();
  getTelemetryConfig();
}

validateServerConfig();
