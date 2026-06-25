import { ConfigurationError } from '../../domain/errors/configuration-error';

/**
 * Demo mode replaces the email OTP with a fixed, predictable code
 * (AUTH_EMAIL_OTP_MOCKED) and exposes seeded demo accounts. Running it on a
 * production instance would let anyone sign in with a known code, so refuse to
 * boot when both are true. Pure function — callers pass the resolved flags.
 */
export function assertDemoModeNotInProduction(
  isProduction: boolean,
  isDemo: boolean
) {
  if (isProduction && isDemo) {
    throw new ConfigurationError(
      'VITE_IS_DEMO=true cannot run in a production environment: demo mode uses ' +
        'a predictable login OTP. Set VITE_IS_DEMO=false for production builds.'
    );
  }
}
