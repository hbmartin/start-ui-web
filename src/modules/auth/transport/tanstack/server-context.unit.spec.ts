import { setResponseHeader } from '@tanstack/react-start/server';
import { describe, expect, it, vi } from 'vitest';

import {
  setPublicResponseCacheHeaders,
  withProtectedMutation,
  withPublicContext,
} from '@/modules/auth/server';
import { ServerFnError } from '@/modules/kernel/server';
import { envClient } from '@/platform/env/client';
import { mockGetSession, mockLogger } from '@/tests/server/test-utils';

describe('server function middleware', () => {
  it('finalizes server timing on handled error paths', async () => {
    await expect(
      withPublicContext(async () => {
        throw new ServerFnError('BAD_REQUEST');
      })
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });

    expect(setResponseHeader).toHaveBeenCalledWith(
      'Server-Timing',
      expect.stringContaining('global;dur=')
    );
  });

  it('sets protected cache headers and request scope for authenticated server functions', async () => {
    await expect(
      withPublicContext(async (ctx) => ({
        scope: ctx.scope,
        userId: ctx.user?.id,
      }))
    ).resolves.toEqual({
      scope: {
        userId: 'user-1',
        role: 'user',
        tenantId: null,
      },
      userId: 'user-1',
    });

    expect(setResponseHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(setResponseHeader).toHaveBeenCalledWith(
      'Vary',
      'Cookie, Authorization'
    );
  });

  it('sets explicit public cache headers through the public helper', () => {
    setPublicResponseCacheHeaders({ maxAgeSeconds: 60 });

    expect(setResponseHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=60, s-maxage=60'
    );
  });

  it('maps auth context construction errors through the central handler', async () => {
    const error = new Error('auth unavailable');
    mockGetSession.mockRejectedValueOnce(error);

    await expect(withPublicContext(async () => 'ok')).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(mockLogger.error).toHaveBeenCalledWith(
      error,
      'Unhandled error before mapping'
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INTERNAL_SERVER_ERROR',
      })
    );
  });

  it('runs demo-mode mutation checks inside protected middleware handling', async () => {
    vi.mocked(envClient).VITE_IS_DEMO = true;

    try {
      await expect(
        withProtectedMutation(async () => 'ok')
      ).rejects.toMatchObject({
        code: 'METHOD_NOT_SUPPORTED',
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'METHOD_NOT_SUPPORTED',
          data: { reason: 'DEMO_MODE_ENABLED' },
          message: 'Demo mode prevents mutations',
        })
      );
    } finally {
      vi.mocked(envClient).VITE_IS_DEMO = false;
    }
  });

  it('logs expected transport errors at warning level', async () => {
    await expect(
      withPublicContext(async () => {
        throw new ServerFnError('CONFLICT', {
          message: 'Unique constraint violation',
          data: { target: ['email'] },
        });
      })
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      data: { target: ['email'] },
    });

    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });
});
