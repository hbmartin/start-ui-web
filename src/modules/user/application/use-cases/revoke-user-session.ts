import { Result } from '@bloodyowl/boxed';

import type { SessionId, UserId } from '@/modules/kernel/domain/ids';

import type {
  UserResult,
  UserRevokeSessionOutcome,
  UserUseCaseDeps,
} from './types';

export type RevokeUserSessionInput = {
  currentUserId: UserId;
  currentSessionId: SessionId;
  id: UserId;
  sessionId: SessionId;
};

export async function revokeUserSession(
  deps: UserUseCaseDeps,
  input: RevokeUserSessionInput
): Promise<UserResult<UserRevokeSessionOutcome>> {
  const allowed = await deps.permissionChecker.hasPermission(
    input.currentUserId,
    { session: ['revoke'] }
  );
  if (allowed.isError()) return Result.Error(allowed.getError());
  if (allowed.get().type === 'permission_denied') {
    return Result.Ok({ type: 'user_forbidden' });
  }

  const targetResult = await deps.userRepository.findSessionForRevocation({
    userId: input.id,
    sessionId: input.sessionId,
  });
  if (targetResult.isError()) return Result.Error(targetResult.getError());
  const targetOutcome = targetResult.get();
  if (targetOutcome.type === 'user_session_not_found') {
    return Result.Ok({ type: 'user_session_not_found' });
  }
  const targetSession = targetOutcome.target;
  if (input.currentSessionId === targetSession.id) {
    return Result.Ok({ type: 'user_self' });
  }

  const result = await deps.userAuthGateway.revokeUserSession({
    userId: input.id,
    sessionId: targetSession.id,
  });
  if (result.isError()) return Result.Error(result.getError());
  deps.logger.warn({
    details: {
      mode: 'single',
      targetUserId: input.id,
    },
    event: 'security.session_revoked',
  });
  return Result.Ok({ type: 'user_session_revoked' });
}
