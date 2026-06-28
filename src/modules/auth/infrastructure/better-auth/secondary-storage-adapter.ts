import type { SecondaryStore } from '../../application/ports/secondary-store';

export type BetterAuthSecondaryStorage = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
};

export const createBetterAuthSecondaryStorage = (
  store: SecondaryStore
): BetterAuthSecondaryStorage => ({
  async get(key) {
    const result = await store.get(key);
    if (result.isError()) return null;

    const outcome = result.get();
    return outcome.type === 'secondary_store_hit' ? outcome.value : null;
  },
  async set(key, value, ttlSeconds) {
    await store.set(key, value, ttlSeconds);
  },
  async delete(key) {
    await store.delete(key);
  },
});
