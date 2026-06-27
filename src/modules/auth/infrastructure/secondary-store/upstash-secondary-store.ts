import { AppError } from '@/modules/kernel/domain/errors/app-error';
import { ConfigurationError } from '@/modules/kernel/domain/errors/configuration-error';
import {
  getRedisConfig,
  type RedisConfig,
} from '@/modules/kernel/infrastructure/config/redis';
import { getTelemetry } from '@/platform/telemetry';

import type { SecondaryStore } from '../../application/ports/secondary-store';

const upstashError = (message: string, cause?: unknown) =>
  new AppError({
    code: 'AUTH_SECONDARY_STORE_UPSTASH_ERROR',
    category: 'system',
    status: 502,
    message,
    cause,
  });

/**
 * Durable {@link SecondaryStore} backed by Upstash Redis over its REST API.
 *
 * Commands are issued in array form (`POST <restUrl>` with a
 * `["SET", key, value, "EX", ttl]` / `["GET", key]` / `["DEL", key]` body and
 * `Authorization: Bearer <restToken>`), and the `{ result }` envelope is parsed
 * back out. A Redis/network outage must not hard-fail authentication, so
 * transport failures degrade gracefully: reads are treated as a miss and
 * writes/deletes are swallowed — but every failure is reported to telemetry so
 * the degradation is observable rather than silent.
 */

type UpstashCommand = (string | number)[];

type CommandOutcome =
  | { ok: true; result: unknown }
  | { ok: false; error: unknown };

export type UpstashSecondaryStoreOptions = {
  config?: RedisConfig;
  fetchFn?: typeof fetch;
};

export class UpstashSecondaryStore implements SecondaryStore {
  private readonly restUrl: string;
  private readonly restToken: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: UpstashSecondaryStoreOptions = {}) {
    const config = options.config ?? getRedisConfig();
    if (!config) {
      throw new ConfigurationError(
        'UpstashSecondaryStore requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.'
      );
    }
    this.restUrl = config.restUrl;
    this.restToken = config.restToken;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  private reportFailure(operation: string, error: unknown): void {
    getTelemetry().captureException(error, {
      level: 'warning',
      tags: { 'auth.secondary_store': 'upstash', 'auth.operation': operation },
    });
  }

  private async command(args: UpstashCommand): Promise<CommandOutcome> {
    try {
      const response = await this.fetchFn(this.restUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.restToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
      });
      if (!response.ok) {
        return {
          ok: false,
          error: upstashError(
            `Upstash request failed with status ${response.status}`
          ),
        };
      }
      const body = (await response.json()) as {
        result?: unknown;
        error?: string;
      };
      if (typeof body.error === 'string') {
        return { ok: false, error: upstashError(body.error) };
      }
      return { ok: true, result: body.result ?? null };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async get(key: string): Promise<string | null> {
    const outcome = await this.command(['GET', key]);
    if (!outcome.ok) {
      // A Redis outage is treated as a cache miss so auth keeps working.
      this.reportFailure('get', outcome.error);
      return null;
    }
    return typeof outcome.result === 'string' ? outcome.result : null;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const args: UpstashCommand =
      ttlSeconds !== undefined
        ? ['SET', key, value, 'EX', ttlSeconds]
        : ['SET', key, value];
    const outcome = await this.command(args);
    if (!outcome.ok) this.reportFailure('set', outcome.error);
  }

  async delete(key: string): Promise<void> {
    const outcome = await this.command(['DEL', key]);
    if (!outcome.ok) this.reportFailure('delete', outcome.error);
  }
}
