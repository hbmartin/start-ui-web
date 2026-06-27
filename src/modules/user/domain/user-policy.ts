import type { UserId } from '@/modules/kernel/domain/ids';

import type { UserRole } from './user';

/** Role assigned to a new account when none is explicitly requested. */
export const DEFAULT_USER_ROLE: UserRole = 'user';

/**
 * True when `role` is an explicitly-requested, non-default (privileged) role.
 * Assigning such a role is a privilege assignment that must be gated behind the
 * dedicated `user:set-role` permission, both on create and update.
 */
export function assignsPrivilegedRole(
  role: UserRole | null | undefined
): boolean {
  return role !== undefined && role !== null && role !== DEFAULT_USER_ROLE;
}

export function canChangeRole(input: {
  currentUserId: UserId;
  userId: UserId;
  nextRole?: UserRole;
  currentRole: UserRole;
}) {
  return (
    input.currentUserId !== input.userId &&
    input.nextRole !== undefined &&
    input.nextRole !== input.currentRole
  );
}

export function isSelfTarget(currentUserId: UserId, userId: UserId) {
  return currentUserId === userId;
}
