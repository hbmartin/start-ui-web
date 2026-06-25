import { describe, expect, it } from 'vitest';

import { createRateLimiter } from '@/platform/http/rate-limiter';

describe('createRateLimiter', () => {
  it('allows up to the limit within a window then denies', () => {
    let now = 1_000;
    const limiter = createRateLimiter(() => now);

    expect(limiter.check('k', 2, 60_000).allowed).toBe(true);
    expect(limiter.check('k', 2, 60_000).allowed).toBe(true);

    const denied = limiter.check('k', 2, 60_000);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('resets after the window elapses', () => {
    let now = 1_000;
    const limiter = createRateLimiter(() => now);

    expect(limiter.check('k', 1, 60_000).allowed).toBe(true);
    expect(limiter.check('k', 1, 60_000).allowed).toBe(false);

    now += 60_000;
    expect(limiter.check('k', 1, 60_000).allowed).toBe(true);
  });

  it('tracks keys independently', () => {
    const limiter = createRateLimiter(() => 0);

    expect(limiter.check('a', 1, 60_000).allowed).toBe(true);
    expect(limiter.check('b', 1, 60_000).allowed).toBe(true);
    expect(limiter.check('a', 1, 60_000).allowed).toBe(false);
  });

  it('clears state on reset', () => {
    const limiter = createRateLimiter(() => 0);

    expect(limiter.check('k', 1, 60_000).allowed).toBe(true);
    expect(limiter.check('k', 1, 60_000).allowed).toBe(false);

    limiter.reset();
    expect(limiter.check('k', 1, 60_000).allowed).toBe(true);
  });
});
