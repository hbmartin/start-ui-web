import { isProdRuntimeEnvironment } from './env-schema';
import { ConfigurationError } from '../../domain/errors/configuration-error';

type RuntimeEnv = Record<string, unknown>;

const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * PostgreSQL sslmode values that actually negotiate TLS. `disable`, `allow`,
 * and `prefer` (the libpq/node-pg default when sslmode is absent) may transmit
 * credentials and data in cleartext, so they are rejected in production.
 */
const SECURE_SSL_MODES = new Set(['require', 'verify-ca', 'verify-full']);

const stripIpv6Brackets = (value: string) =>
  value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;

/**
 * True when the URL points at the loopback host. Mirrors the localhost
 * allowance used by the telemetry and storage guards so local development and
 * CI can keep using plain `http://` / `postgres://` connections.
 */
export const isLocalhostUrl = (value: string): boolean => {
  try {
    return LOCALHOST_HOSTNAMES.has(stripIpv6Brackets(new URL(value).hostname));
  } catch {
    return false;
  }
};

/**
 * Rejects cleartext URLs in production. No-op when the value is absent, the
 * runtime is non-production, the host is localhost, or the URL is malformed
 * (malformed URLs are surfaced by the schema's own `url()` validation).
 */
export const assertSecureUrlInProduction = ({
  name,
  value,
  env,
}: {
  name: string;
  value: string | undefined;
  env?: RuntimeEnv;
}): void => {
  if (!value) return;
  if (!isProdRuntimeEnvironment(env)) return;
  if (isLocalhostUrl(value)) return;

  let protocol: string;
  try {
    protocol = new URL(value).protocol;
  } catch {
    return;
  }

  if (protocol !== 'https:') {
    throw new ConfigurationError(
      `${name} must use HTTPS in production unless it targets localhost.`
    );
  }
};

/**
 * Requires a TLS-enabling `sslmode` on production node-pg database URLs. The
 * Neon HTTP/WebSocket drivers connect to Neon over TLS by design, so they are
 * exempt. No-op for non-production runtimes, localhost hosts, or malformed URLs.
 */
export const assertDatabaseUrlTls = ({
  name,
  url,
  driver,
  env,
}: {
  name: string;
  url: string;
  driver: string;
  env?: RuntimeEnv;
}): void => {
  if (driver !== 'node-pg') return;
  if (!isProdRuntimeEnvironment(env)) return;
  if (isLocalhostUrl(url)) return;

  let sslmode: string | null;
  try {
    sslmode = new URL(url).searchParams.get('sslmode');
  } catch {
    return;
  }

  if (!sslmode || !SECURE_SSL_MODES.has(sslmode)) {
    throw new ConfigurationError(
      `${name} must enable TLS in production: set sslmode=verify-full (or at least require).`
    );
  }
};
