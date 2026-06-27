import { describe, expect, it } from 'vitest';

import { AUTH_REAUTH_REQUIRED, isSessionFresh } from '@/modules/auth';

const now = Date.parse('2026-06-27T12:00:00.000Z');
const freshAgeSeconds = 900; // 15 minutes

describe('isSessionFresh', () => {
  it('is fresh when createdAt is within the window', () => {
    const createdAt = new Date(now - 5 * 60 * 1000); // 5 min ago
    expect(isSessionFresh({ createdAt, freshAgeSeconds, now })).toBe(true);
  });

  it('is fresh exactly at the window boundary', () => {
    const createdAt = new Date(now - freshAgeSeconds * 1000); // 15 min ago
    expect(isSessionFresh({ createdAt, freshAgeSeconds, now })).toBe(true);
  });

  it('is stale when createdAt is older than the window', () => {
    const createdAt = new Date(now - 16 * 60 * 1000); // 16 min ago
    expect(isSessionFresh({ createdAt, freshAgeSeconds, now })).toBe(false);
  });

  it('accepts ISO string createdAt values', () => {
    const createdAt = new Date(now - 60 * 1000).toISOString(); // 1 min ago
    expect(isSessionFresh({ createdAt, freshAgeSeconds, now })).toBe(true);
  });

  it('fails closed when createdAt is missing (undefined)', () => {
    expect(isSessionFresh({ createdAt: undefined, freshAgeSeconds, now })).toBe(
      false
    );
  });

  it('fails closed when createdAt is null', () => {
    expect(isSessionFresh({ createdAt: null, freshAgeSeconds, now })).toBe(
      false
    );
  });

  it('fails closed when createdAt is unparseable', () => {
    expect(
      isSessionFresh({ createdAt: 'not-a-date', freshAgeSeconds, now })
    ).toBe(false);
  });
});

describe('AUTH_REAUTH_REQUIRED', () => {
  it('is the shared step-up signal value', () => {
    expect(AUTH_REAUTH_REQUIRED).toBe('reauth_required');
  });
});
