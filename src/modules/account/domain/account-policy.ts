/**
 * Maximum stored length of an account display name. Shared by the presentation
 * form schema and the server-side transport validator so the bound is enforced
 * at both tiers (A04 "plausibility checks at each tier"), and used as the
 * defensive domain check below. (CWE-1284 / CWE-770.)
 */
export const ACCOUNT_NAME_MAX_LENGTH = 200;

export function isAccountNamePresent(name: string) {
  return name.trim().length > 0;
}

export function isAccountNameWithinLimit(name: string) {
  return name.trim().length <= ACCOUNT_NAME_MAX_LENGTH;
}

/** Present and within the stored-length bound. */
export function isAccountNameValid(name: string) {
  return isAccountNamePresent(name) && isAccountNameWithinLimit(name);
}
