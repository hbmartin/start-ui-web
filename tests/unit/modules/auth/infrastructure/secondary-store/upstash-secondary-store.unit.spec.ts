import { beforeEach, describe, expect, it, vi } from 'vitest';

const telemetryMock = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

vi.mock('@/platform/telemetry', () => ({
  getTelemetry: () => telemetryMock,
}));

import { UpstashSecondaryStore } from '@/modules/auth/infrastructure/secondary-store/upstash-secondary-store';

const config = {
  restUrl: 'https://redis.example.com',
  restToken: 'token-123',
};

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('UpstashSecondaryStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('issues a GET command and returns the stored value', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ result: 'value-1' }));
    const store = new UpstashSecondaryStore({ config, fetchFn });

    expect(await store.get('key-1')).toBe('value-1');
    expect(fetchFn).toHaveBeenCalledWith(
      config.restUrl,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${config.restToken}`,
        }),
        body: JSON.stringify(['GET', 'key-1']),
      })
    );
  });

  it('treats a null result as a miss', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ result: null }));
    const store = new UpstashSecondaryStore({ config, fetchFn });

    expect(await store.get('absent')).toBeNull();
  });

  it('sends SET with an EX ttl and DEL commands', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ result: 'OK' }));
    const store = new UpstashSecondaryStore({ config, fetchFn });

    await store.set('key-1', 'value-1', 60);
    expect(fetchFn).toHaveBeenLastCalledWith(
      config.restUrl,
      expect.objectContaining({
        body: JSON.stringify(['SET', 'key-1', 'value-1', 'EX', 60]),
      })
    );

    await store.set('key-2', 'value-2');
    expect(fetchFn).toHaveBeenLastCalledWith(
      config.restUrl,
      expect.objectContaining({
        body: JSON.stringify(['SET', 'key-2', 'value-2']),
      })
    );

    await store.delete('key-1');
    expect(fetchFn).toHaveBeenLastCalledWith(
      config.restUrl,
      expect.objectContaining({
        body: JSON.stringify(['DEL', 'key-1']),
      })
    );
  });

  it('degrades a read to a miss and reports the failure on a transport error', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('network down');
    });
    const store = new UpstashSecondaryStore({ config, fetchFn });

    expect(await store.get('key-1')).toBeNull();
    expect(telemetryMock.captureException).toHaveBeenCalledTimes(1);
  });

  it('does not throw but reports when a write fails', async () => {
    const fetchFn = vi.fn(async () => new Response('boom', { status: 500 }));
    const store = new UpstashSecondaryStore({ config, fetchFn });

    await expect(store.set('key-1', 'value-1')).resolves.toBeUndefined();
    await expect(store.delete('key-1')).resolves.toBeUndefined();
    expect(telemetryMock.captureException).toHaveBeenCalledTimes(2);
  });
});
