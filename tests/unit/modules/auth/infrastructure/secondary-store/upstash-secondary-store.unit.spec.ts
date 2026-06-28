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

    await expect(store.get('key-1')).resolves.toMatchObject({
      tag: 'Ok',
      value: { type: 'secondary_store_hit', value: 'value-1' },
    });
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

    await expect(store.get('absent')).resolves.toMatchObject({
      tag: 'Ok',
      value: { type: 'secondary_store_miss' },
    });
  });

  it('sends SET with an EX ttl and DEL commands', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ result: 'OK' }));
    const store = new UpstashSecondaryStore({ config, fetchFn });

    await expect(store.set('key-1', 'value-1', 60)).resolves.toMatchObject({
      tag: 'Ok',
      value: { type: 'secondary_store_set' },
    });
    expect(fetchFn).toHaveBeenLastCalledWith(
      config.restUrl,
      expect.objectContaining({
        body: JSON.stringify(['SET', 'key-1', 'value-1', 'EX', 60]),
      })
    );

    await expect(store.set('key-2', 'value-2')).resolves.toMatchObject({
      tag: 'Ok',
      value: { type: 'secondary_store_set' },
    });
    expect(fetchFn).toHaveBeenLastCalledWith(
      config.restUrl,
      expect.objectContaining({
        body: JSON.stringify(['SET', 'key-2', 'value-2']),
      })
    );

    await expect(store.delete('key-1')).resolves.toMatchObject({
      tag: 'Ok',
      value: { type: 'secondary_store_deleted' },
    });
    expect(fetchFn).toHaveBeenLastCalledWith(
      config.restUrl,
      expect.objectContaining({
        body: JSON.stringify(['DEL', 'key-1']),
      })
    );
  });

  it('returns and reports read failures on transport errors', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('network down');
    });
    const store = new UpstashSecondaryStore({ config, fetchFn });

    await expect(store.get('key-1')).resolves.toMatchObject({
      tag: 'Error',
      error: { code: 'AUTH_SECONDARY_STORE_UPSTASH_ERROR' },
    });
    expect(telemetryMock.captureException).toHaveBeenCalledTimes(1);
  });

  it('returns and reports write failures', async () => {
    const fetchFn = vi.fn(async () => new Response('boom', { status: 500 }));
    const store = new UpstashSecondaryStore({ config, fetchFn });

    await expect(store.set('key-1', 'value-1')).resolves.toMatchObject({
      tag: 'Error',
      error: { code: 'AUTH_SECONDARY_STORE_UPSTASH_ERROR' },
    });
    await expect(store.delete('key-1')).resolves.toMatchObject({
      tag: 'Error',
      error: { code: 'AUTH_SECONDARY_STORE_UPSTASH_ERROR' },
    });
    expect(telemetryMock.captureException).toHaveBeenCalledTimes(2);
  });

  it('aborts slow Upstash requests', async () => {
    const fetchFn = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        })
    );
    const store = new UpstashSecondaryStore({
      config,
      fetchFn,
      timeoutMs: 1,
    });

    await expect(store.get('key-1')).resolves.toMatchObject({
      tag: 'Error',
      error: { code: 'AUTH_SECONDARY_STORE_UPSTASH_ERROR' },
    });
    expect(telemetryMock.captureException).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid ttl values before issuing a request', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ result: 'OK' }));
    const store = new UpstashSecondaryStore({ config, fetchFn });

    await expect(
      store.set('key-1', 'value-1', Number.NaN)
    ).resolves.toMatchObject({
      tag: 'Error',
      error: { code: 'AUTH_SECONDARY_STORE_INVALID_TTL' },
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
