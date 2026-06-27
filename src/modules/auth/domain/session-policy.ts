/**
 * Tagged signal shared by transport and client to mark a destructive action
 * rejected because the caller's session is no longer fresh. The manager UI
 * recognizes this to prompt a step-up re-authentication instead of surfacing a
 * generic error.
 */
export const AUTH_REAUTH_REQUIRED = 'reauth_required';

/**
 * Pure freshness policy for step-up re-authentication.
 *
 * A session is fresh when its original sign-in time (`createdAt`) is within the
 * configured window, i.e. `now - createdAt <= freshAgeSeconds * 1000`.
 *
 * Fails closed: a missing or unparseable `createdAt` is treated as NOT fresh so
 * a destructive action is challenged rather than silently allowed. This never
 * locks an admin out because re-authenticating mints a new session with a fresh
 * `createdAt`.
 */
export const isSessionFresh = (input: {
  createdAt: Date | string | null | undefined;
  freshAgeSeconds: number;
  now: number;
}): boolean => {
  const { createdAt, freshAgeSeconds, now } = input;
  if (createdAt === null || createdAt === undefined) return false;
  const createdAtMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdAtMs)) return false;
  return now - createdAtMs <= freshAgeSeconds * 1000;
};
