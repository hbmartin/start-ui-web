import { describe, expect, it } from 'vitest';

import { InMemorySecondaryStore } from '@/modules/auth/infrastructure/secondary-store/in-memory-secondary-store';

describe('InMemorySecondaryStore', () => {
  it('round-trips values and deletes them', async () => {
    const store = new InMemorySecondaryStore();

    expect(await store.get('missing')).toBeNull();

    await store.set('k', 'v');
    expect(await store.get('k')).toBe('v');

    await store.delete('k');
    expect(await store.get('k')).toBeNull();
  });

  it('expires values lazily once the ttl has elapsed', async () => {
    let nowMs = 1_000;
    const store = new InMemorySecondaryStore({ now: () => nowMs });

    await store.set('k', 'v', 10);
    expect(await store.get('k')).toBe('v');

    nowMs += 9_999;
    expect(await store.get('k')).toBe('v');

    nowMs += 1; // ttl boundary reached
    expect(await store.get('k')).toBeNull();
  });

  it('keeps values without a ttl until deleted', async () => {
    let nowMs = 0;
    const store = new InMemorySecondaryStore({ now: () => nowMs });

    await store.set('k', 'v');
    nowMs += 10_000_000;
    expect(await store.get('k')).toBe('v');
  });

  it('prunes expired entries during a bounded sweep', async () => {
    let nowMs = 0;
    const store = new InMemorySecondaryStore({
      now: () => nowMs,
      sweepThreshold: 2,
      sweepIntervalMs: 0,
    });

    await store.set('a', '1', 1);
    await store.set('b', '2', 1);
    nowMs += 2_000; // both 'a' and 'b' are now expired

    // The set below crosses the sweep threshold and prunes expired entries.
    await store.set('c', '3');

    expect(await store.get('a')).toBeNull();
    expect(await store.get('b')).toBeNull();
    expect(await store.get('c')).toBe('3');
  });
});
