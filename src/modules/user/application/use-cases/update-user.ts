import { Result } from '@bloodyowl/boxed';

import type { UserId } from '@/modules/kernel/domain/ids';

import type { UserResult, UserUpdateOutcome, UserUseCaseDeps } from './types';
import type { UserUpdateInput } from '../../domain/user';
import { shouldUnverifyEmail } from '../../domain/user';
import { canChangeRole } from '../../domain/user-policy';

export type UpdateUserInput = {
  currentUserId: UserId;
  id: UserId;
  user: UserUpdateInput;
};

export async function updateUser(
  deps: UserUseCaseDeps,
  input: UpdateUserInput
): Promise<UserResult<UserUpdateOutcome>> {
  const allowed = await deps.permissionChecker.hasPermission(
    input.currentUserId,
    { user: ['update'] }
  );
  if (allowed.isError()) return Result.Error(allowed.getError());
  if (allowed.get().type === 'permission_denied') {
    return Result.Ok({ type: 'user_forbidden' });
  }

  const currentResult = await deps.userRepository.getUpdateSnapshot(input.id);
  if (currentResult.isError()) return Result.Error(currentResult.getError());
  const snapshotOutcome = currentResult.get();
  if (snapshotOutcome.type === 'user_not_found') {
    return Result.Ok({ type: 'user_not_found' });
  }
  const current = snapshotOutcome.snapshot;

  const nextRole =
    input.currentUserId === input.id
      ? undefined
      : (input.user.role ?? undefined);

  if (
    canChangeRole({
      currentUserId: input.currentUserId,
      userId: input.id,
      nextRole,
      currentRole: current.role,
    })
  ) {
    const canSetRole = await deps.permissionChecker.hasPermission(
      input.currentUserId,
      { user: ['set-role'] }
    );
    if (canSetRole.isError()) return Result.Error(canSetRole.getError());
    if (canSetRole.get().type === 'permission_denied') {
      return Result.Ok({ type: 'user_forbidden' });
    }
  }

  deps.logger.info({
    event: 'user.update',
    details: { userId: input.id },
  });
  const update = {
    email: input.user.email,
    role: nextRole,
    emailVerified: shouldUnverifyEmail(current.email, input.user.email)
      ? false
      : undefined,
    ...(input.user.name === undefined ? {} : { name: input.user.name ?? '' }),
  };
  const result = await deps.userRepository.update(input.id, {
    ...update,
  });
  if (result.isError()) return Result.Error(result.getError());
  return Result.Ok(result.get());
}
