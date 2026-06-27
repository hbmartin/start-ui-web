import { Result } from '@bloodyowl/boxed';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(() => ({ id: 'admin-plugin' })),
  betterAuth: vi.fn<(options: ExplicitAny) => ExplicitAny>(() => ({
    handler: vi.fn(),
  })),
  drizzleAdapter: vi.fn(() => ({ id: 'drizzle-adapter' })),
  emailOTP: vi.fn<(options: ExplicitAny) => ExplicitAny>(() => ({
    id: 'email-otp-plugin',
  })),
  openAPI: vi.fn(() => ({ id: 'open-api-plugin' })),
  tanstackStartCookies: vi.fn(() => ({ id: 'tanstack-cookies-plugin' })),
}));

vi.mock('better-auth', () => ({
  betterAuth: mocks.betterAuth,
}));

vi.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: mocks.drizzleAdapter,
}));

vi.mock('better-auth/plugins', () => ({
  admin: mocks.admin,
  emailOTP: mocks.emailOTP,
  openAPI: mocks.openAPI,
}));

vi.mock('better-auth/tanstack-start', () => ({
  tanstackStartCookies: mocks.tanstackStartCookies,
}));

vi.mock('@/modules/kernel/infrastructure/config/auth', () => ({
  getBetterAuthConfig: () => ({
    allowedHosts: ['preview.example'],
    githubClientId: undefined,
    githubClientSecret: undefined,
    secret: globalThis.crypto.randomUUID(),
    sessionExpirationInSeconds: 604_800,
    sessionUpdateAgeInSeconds: 86_400,
    sessionFreshAgeInSeconds: 900,
    sessionAbsoluteMaxInSeconds: 2_592_000,
    rateLimitWindowSeconds: 60,
    rateLimitMax: 100,
    otpAllowedAttempts: 3,
    otpSendWindowSeconds: 60,
    otpSendMax: 3,
    trustedOrigins: ['https://app.example'],
  }),
}));

vi.mock('@/platform/env/client', () => ({
  envClient: {
    DEV: false,
    VITE_AUTH_SIGNUP_ENABLED: true,
    VITE_BASE_URL: 'https://app.example',
  },
}));

describe('Better Auth security configuration', () => {
  it('does not disable Better Auth CSRF or origin checks', async () => {
    const { createAuth } = await vi.importActual<
      typeof import('@/modules/auth/infrastructure/better-auth/auth')
    >('@/modules/auth/infrastructure/better-auth/auth');

    createAuth({
      authEmailPort: {
        sendSignInOtp: vi.fn(async () =>
          Result.Ok({ type: 'auth_sign_in_otp_sent' as const })
        ),
      },
    });

    const options = mocks.betterAuth.mock.calls[0]?.[0] as ExplicitAny;

    expect(options.advanced.disableCSRFCheck).toBeUndefined();
    expect(options.advanced.disableOriginCheck).toBeUndefined();
    expect(options.account.encryptOAuthTokens).toBe(true);
    expect(options.trustedOrigins).toEqual(['https://app.example']);
  });

  it('wires durable secondary storage, rate limiting, and session hardening', async () => {
    const { createAuth } = await vi.importActual<
      typeof import('@/modules/auth/infrastructure/better-auth/auth')
    >('@/modules/auth/infrastructure/better-auth/auth');

    const secondaryStore = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    };

    createAuth({
      authEmailPort: {
        sendSignInOtp: vi.fn(async () =>
          Result.Ok({ type: 'auth_sign_in_otp_sent' as const })
        ),
      },
      secondaryStore,
    });

    const options = mocks.betterAuth.mock.calls.at(-1)?.[0] as ExplicitAny;

    expect(options.secondaryStorage).toBe(secondaryStore);
    expect(options.rateLimit).toEqual({
      enabled: true,
      storage: 'secondary-storage',
      window: 60,
      max: 100,
    });
    expect(options.session).toMatchObject({
      expiresIn: 604_800,
      updateAge: 86_400,
      freshAge: 900,
    });

    const emailOtpOptions = mocks.emailOTP.mock.calls.at(
      -1
    )?.[0] as ExplicitAny;
    expect(emailOtpOptions.allowedAttempts).toBe(3);
    expect(emailOtpOptions.rateLimit).toEqual({ window: 60, max: 3 });
  });
});
