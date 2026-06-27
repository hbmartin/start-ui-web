import type { SecondaryStore } from '../../application/ports/secondary-store';

/**
 * Default {@link SecondaryStore}: a per-process `Map`.
 *
 * IMPORTANT: state is per-process. On serverless / multi-instance deployments
 * each instance keeps its own entries, so Better Auth rate-limit counters and
 * any other shared state only bind abuse per instance. For durable, shared
 * enforcement across instances, configure Upstash Redis
 * (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) so composition selects
 * {@link import('./upstash-secondary-store').UpstashSecondaryStore}, or rely on
 * an edge/WAF control. Expiry is enforced lazily on read plus a size-bounded
 * sweep, mirroring `src/platform/http/rate-limiter.ts`.
 */

type Entry = {
  value: string;
  /** Epoch milliseconds after which the entry is expired, or undefined. */
  expiresAt?: number;
};

/** Above this many tracked keys, prune expired entries to bound memory. */
const SWEEP_THRESHOLD = 10_000;
const SWEEP_INTERVAL_MS = 30_000;

export type InMemorySecondaryStoreOptions = {
  /** Clock seam for tests. */
  now?: () => number;
  /** Minimum tracked keys before expired-entry pruning runs. */
  sweepThreshold?: number;
  /** Minimum time between pruning passes. */
  sweepIntervalMs?: number;
};

export class InMemorySecondaryStore implements SecondaryStore {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;
  private readonly sweepThreshold: number;
  private readonly sweepIntervalMs: number;
  private lastSweepAt = Number.NEGATIVE_INFINITY;

  constructor(options: InMemorySecondaryStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.sweepThreshold = options.sweepThreshold ?? SWEEP_THRESHOLD;
    this.sweepIntervalMs = options.sweepIntervalMs ?? SWEEP_INTERVAL_MS;
  }

  private isExpired(entry: Entry, currentTime: number): boolean {
    return entry.expiresAt !== undefined && currentTime >= entry.expiresAt;
  }

  private sweep(currentTime: number): void {
    for (const [key, entry] of this.entries) {
      if (this.isExpired(entry, currentTime)) this.entries.delete(key);
    }
  }

  async get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (this.isExpired(entry, this.now())) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const currentTime = this.now();
    if (
      this.entries.size >= this.sweepThreshold &&
      currentTime - this.lastSweepAt >= this.sweepIntervalMs
    ) {
      this.sweep(currentTime);
      this.lastSweepAt = currentTime;
    }
    this.entries.set(key, {
      value,
      expiresAt:
        ttlSeconds !== undefined ? currentTime + ttlSeconds * 1000 : undefined,
    });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }
}
