import { describe, expect, it } from 'vitest';

import { ConfigurationError } from '@/modules/kernel/domain/errors/configuration-error';
import {
  assertDatabaseUrlTls,
  assertSecureUrlInProduction,
  isLocalhostUrl,
} from '@/modules/kernel/infrastructure/config/url-security';

const PROD = { NODE_ENV: 'production' };
const DEV = { NODE_ENV: 'development' };

describe('isLocalhostUrl', () => {
  it('detects loopback hosts across schemes', () => {
    expect(isLocalhostUrl('http://localhost:3000')).toBe(true);
    expect(isLocalhostUrl('http://127.0.0.1:9000/default')).toBe(true);
    expect(isLocalhostUrl('http://[::1]:4318/v1')).toBe(true);
    expect(isLocalhostUrl('postgres://user:pass@localhost:5432/app')).toBe(
      true
    );
  });

  it('returns false for remote hosts and malformed URLs', () => {
    expect(isLocalhostUrl('https://example.com')).toBe(false);
    expect(isLocalhostUrl('postgres://user:pass@db.example.com/app')).toBe(
      false
    );
    expect(isLocalhostUrl('not-a-url')).toBe(false);
  });
});

describe('assertSecureUrlInProduction', () => {
  it('rejects cleartext production URLs for remote hosts', () => {
    expect(() =>
      assertSecureUrlInProduction({
        name: 'SENTRY_DSN',
        value: 'http://sentry.example.com/1',
        env: PROD,
      })
    ).toThrow(ConfigurationError);
  });

  it('allows https, localhost, absent values, and non-production', () => {
    expect(() =>
      assertSecureUrlInProduction({
        name: 'X',
        value: 'https://example.com',
        env: PROD,
      })
    ).not.toThrow();
    expect(() =>
      assertSecureUrlInProduction({
        name: 'X',
        value: 'http://localhost:1234',
        env: PROD,
      })
    ).not.toThrow();
    expect(() =>
      assertSecureUrlInProduction({ name: 'X', value: undefined, env: PROD })
    ).not.toThrow();
    expect(() =>
      assertSecureUrlInProduction({
        name: 'X',
        value: 'http://example.com',
        env: DEV,
      })
    ).not.toThrow();
  });
});

describe('assertDatabaseUrlTls', () => {
  const remote = (sslmode?: string) =>
    `postgres://user:pass@db.example.com:5432/app${
      sslmode ? `?sslmode=${sslmode}` : ''
    }`;

  it.each(['require', 'verify-ca', 'verify-full'])(
    'accepts production node-pg URLs with sslmode=%s',
    (mode) => {
      expect(() =>
        assertDatabaseUrlTls({
          name: 'DATABASE_URL',
          url: remote(mode),
          driver: 'node-pg',
          env: PROD,
        })
      ).not.toThrow();
    }
  );

  it.each([undefined, 'prefer', 'disable', 'allow'])(
    'rejects production node-pg URLs with sslmode=%s',
    (mode) => {
      expect(() =>
        assertDatabaseUrlTls({
          name: 'DATABASE_URL',
          url: remote(mode),
          driver: 'node-pg',
          env: PROD,
        })
      ).toThrow(ConfigurationError);
    }
  );

  it('exempts Neon drivers, localhost, and non-production runtimes', () => {
    for (const driver of ['neon-http', 'neon-websocket']) {
      expect(() =>
        assertDatabaseUrlTls({
          name: 'DATABASE_URL',
          url: remote(),
          driver,
          env: PROD,
        })
      ).not.toThrow();
    }
    expect(() =>
      assertDatabaseUrlTls({
        name: 'DATABASE_URL',
        url: 'postgres://user:pass@localhost:5432/app',
        driver: 'node-pg',
        env: PROD,
      })
    ).not.toThrow();
    expect(() =>
      assertDatabaseUrlTls({
        name: 'DATABASE_URL',
        url: remote(),
        driver: 'node-pg',
        env: DEV,
      })
    ).not.toThrow();
  });
});
