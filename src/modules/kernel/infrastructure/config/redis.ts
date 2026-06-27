import { z } from 'zod';

import { baseEnvSchema, parseEnv, zNonEmptyEnvString } from './env-schema';
import { assertSecureUrlInProduction } from './url-security';

const redisEnvSchema = baseEnvSchema.extend({
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: zNonEmptyEnvString().optional(),
});

export type RedisConfig = {
  restUrl: string;
  restToken: string;
};

let cachedRedisConfig: RedisConfig | null | undefined;

export function getRedisConfig(): RedisConfig | null {
  if (cachedRedisConfig !== undefined) return cachedRedisConfig;

  const env = parseEnv(redisEnvSchema);
  assertSecureUrlInProduction({
    name: 'UPSTASH_REDIS_REST_URL',
    value: env.UPSTASH_REDIS_REST_URL,
    env,
  });
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    cachedRedisConfig = null;
    return cachedRedisConfig;
  }

  cachedRedisConfig = {
    restUrl: env.UPSTASH_REDIS_REST_URL,
    restToken: env.UPSTASH_REDIS_REST_TOKEN,
  };
  return cachedRedisConfig;
}

/**
 * True only when both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
 * are present (and the URL passes the existing HTTPS/format guards). Never
 * throws: a malformed Redis URL falls back to "not configured" here, while
 * boot-time `validateServerConfig()` still surfaces it via `getRedisConfig()`.
 * Used to decide between the durable Upstash store and the in-memory default.
 */
export function isRedisConfigured(): boolean {
  try {
    return getRedisConfig() !== null;
  } catch {
    return false;
  }
}
