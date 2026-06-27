/**
 * Durable key/value port used for Better Auth's secondary storage and
 * rate-limit counters. Implementations decide the backend (in-process map,
 * Upstash Redis, …) so the auth wiring stays provider-neutral.
 *
 * Values are opaque strings; callers serialize/deserialize. `ttlSeconds` is an
 * optional expiry hint — when omitted the entry persists until deleted.
 */
export interface SecondaryStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
}
