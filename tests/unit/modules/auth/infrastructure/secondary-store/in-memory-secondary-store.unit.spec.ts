import { describe, expect, it } from 'vitest';

import { InMemorySecondaryStore } from '@/modules/auth/infrastructure/secondary-store/in-memory-secondary-store';

const expectMiss = async (value: ReturnType<InMemorySecondaryStore['get']>) => {
  const result = await value;
  if (result.isError()) throw result.getError();
  expect(result.get()).toEqual({ type: 'secondary_store_miss' });
};

const expectHit = async (
  value: ReturnType<InMemorySecondaryStore['get']>,
  expected: string
) => {
  const result = await value;
  if (result.isError()) throw result.getError();
  expect(result.get()).toEqual({
    type: 'secondary_store_hit',
    value: expected,
  });
};

const entryKeys = (store: InMemorySecondaryStore) => [
  ...(store as unknown as { entries: Map<string, unknown> }).entries.keys(),
];

describe('InMemorySecondaryStore', () => {
  it('round-trips values and deletes them', async () => {
    const store = new InMemorySecondaryStore();

    await expectMiss(store.get('missing'));

    await expect(store.set('k', 'v')).resolves.toMatchObject({
      tag: 'Ok',
      value: { type: 'secondary_store_set' },
    });
    await expectHit(store.get('k'), 'v');

    await expect(store.delete('k')).resolves.toMatchObject({
      tag: 'Ok',
      value: { type: 'secondary_store_deleted' },
    });
    await expectMiss(store.get('k'));
  });

  it('expires values lazily once the ttl has elapsed', async () => {
    expect.hasAssertions();

    let nowMs = 1_000;
    const store = new InMemorySecondaryStore({ now: () => nowMs });

    await store.set('k', 'v', 10);
    await expectHit(store.get('k'), 'v');

    nowMs += 9_999;
    await expectHit(store.get('k'), 'v');

    nowMs += 1; // ttl boundary reached
    await expectMiss(store.get('k'));
  });

  it('keeps values without a ttl until deleted', async () => {
    expect.hasAssertions();

    let nowMs = 0;
    const store = new InMemorySecondaryStore({ now: () => nowMs });

    await store.set('k', 'v');
    nowMs += 10_000_000;
    await expectHit(store.get('k'), 'v');
  });

  it('prunes expired entries during a bounded sweep', async () => {
    expect.hasAssertions();

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

    await expectMiss(store.get('a'));
    await expectMiss(store.get('b'));
    await expectHit(store.get('c'), '3');
  });

  it('limits request-path sweep work per set call', async () => {
    expect.hasAssertions();

    let nowMs = 0;
    const store = new InMemorySecondaryStore({
      now: () => nowMs,
      sweepThreshold: 2,
      sweepIntervalMs: 0,
      sweepMaxEntries: 1,
    });

    await store.set('a', '1', 1);
    await store.set('b', '2', 1);
    nowMs += 2_000;

    await store.set('c', '3');

    await expectMiss(store.get('a'));
    await expectMiss(store.get('b'));
    await expectHit(store.get('c'), '3');
  });

  it('does not revisit live entries while sweeping', async () => {
    const store = new InMemorySecondaryStore({
      sweepThreshold: 3,
      sweepIntervalMs: 0,
      sweepMaxEntries: 8,
    });

    await store.set('a', '1');
    await store.set('b', '2');
    await store.set('c', '3');
    await store.set('d', '4');

    expect(entryKeys(store)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('rejects invalid ttl values instead of creating persistent entries', async () => {
    const store = new InMemorySecondaryStore();

    const result = await store.set('k', 'v', Number.NaN);

    expect(result).toMatchObject({
      tag: 'Error',
      error: { code: 'AUTH_SECONDARY_STORE_INVALID_TTL' },
    });
    await expectMiss(store.get('k'));
  });
});
