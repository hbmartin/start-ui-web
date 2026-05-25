import type { RequestScope } from '@/modules/auth';
import type { Logger } from '@/modules/kernel/application/ports/logger';
import type { PermissionChecker } from '@/modules/kernel/application/ports/permission-checker';
import { AppError } from '@/modules/kernel/domain/errors/app-error';
import type { SessionId, UserId } from '@/modules/kernel/domain/ids';
import { toUserId } from '@/modules/kernel/domain/ids';

import type { UserAuthGateway } from './ports/user-auth-gateway';
import type { UserRepository } from './ports/user-repository';
import type {
  User,
  UserCreateInput,
  UserListPage,
  UserSessionListPage,
  UserUpdateInput,
} from '../domain/user';
import { shouldUnverifyEmail } from '../domain/user';
import { canChangeRole, isSelfTarget } from '../domain/user-policy';

export type UserUseCaseDeps = {
  userRepository: UserRepository;
  userAuthGateway: UserAuthGateway;
  permissionChecker: PermissionChecker;
  logger: Logger;
};

export type UseCaseResult<T, TReason extends string> =
  | { ok: true; value: T }
  | { ok: false; reason: TReason };

export type ListUsersInput = {
  scope: RequestScope;
  cursor?: UserId;
  limit: number;
  searchTerm: string;
};

export async function listUsers(
  deps: UserUseCaseDeps,
  input: ListUsersInput
): Promise<UseCaseResult<UserListPage, 'forbidden'>> {
  const currentUserId = toUserId(input.scope.userId);
  const allowed = await deps.permissionChecker.hasPermission(currentUserId, {
    user: ['list'],
  });
  if (!allowed) return { ok: false, reason: 'forbidden' };

  deps.logger.info('user.list', { event: 'user.list' });
  const value = await deps.userRepository.list({
    cursor: input.cursor,
    limit: input.limit,
    searchTerm: input.searchTerm,
  });
  return { ok: true, value };
}

export type GetUserInput = {
  scope: RequestScope;
  id: UserId;
};

export async function getUser(
  deps: UserUseCaseDeps,
  input: GetUserInput
): Promise<UseCaseResult<User, 'forbidden' | 'not_found'>> {
  const currentUserId = toUserId(input.scope.userId);
  const allowed = await deps.permissionChecker.hasPermission(currentUserId, {
    user: ['list'],
  });
  if (!allowed) return { ok: false, reason: 'forbidden' };

  deps.logger.info('user.get', { event: 'user.get', userId: input.id });
  const value = await deps.userRepository.getById(input.id);
  if (!value) return { ok: false, reason: 'not_found' };
  return { ok: true, value };
}

export type CreateUserInput = {
  scope: RequestScope;
  user: UserCreateInput;
};

export async function createUser(
  deps: UserUseCaseDeps,
  input: CreateUserInput
): Promise<UseCaseResult<User, 'forbidden' | 'duplicate'>> {
  const currentUserId = toUserId(input.scope.userId);
  const allowed = await deps.permissionChecker.hasPermission(currentUserId, {
    user: ['create'],
  });
  if (!allowed) return { ok: false, reason: 'forbidden' };

  try {
    deps.logger.info('user.create', { event: 'user.create' });
    const value = await deps.userRepository.create(input.user);
    return { ok: true, value };
  } catch (error) {
    if (error instanceof AppError && error.code === 'USER_DUPLICATE') {
      return { ok: false, reason: 'duplicate' };
    }
    throw error;
  }
}

export type UpdateUserInput = {
  scope: RequestScope;
  id: UserId;
  user: UserUpdateInput;
};

export async function updateUser(
  deps: UserUseCaseDeps,
  input: UpdateUserInput
): Promise<UseCaseResult<User, 'forbidden' | 'not_found' | 'duplicate'>> {
  const currentUserId = toUserId(input.scope.userId);
  const allowed = await deps.permissionChecker.hasPermission(currentUserId, {
    user: ['update'],
  });
  if (!allowed) return { ok: false, reason: 'forbidden' };

  const current = await deps.userRepository.getUpdateSnapshot(input.id);
  if (!current) return { ok: false, reason: 'not_found' };

  const nextRole =
    currentUserId === input.id ? undefined : (input.user.role ?? undefined);

  if (
    canChangeRole({
      currentUserId,
      targetUserId: input.id,
      nextRole,
      currentRole: current.role,
    })
  ) {
    const canSetRole = await deps.permissionChecker.hasPermission(
      currentUserId,
      { user: ['set-role'] }
    );
    if (!canSetRole) return { ok: false, reason: 'forbidden' };
  }

  try {
    deps.logger.info('user.update', { event: 'user.update', userId: input.id });
    const update = {
      email: input.user.email,
      role: nextRole,
      emailVerified: shouldUnverifyEmail(current.email, input.user.email)
        ? false
        : undefined,
      ...(input.user.name === undefined ? {} : { name: input.user.name ?? '' }),
    };
    const value = await deps.userRepository.update(input.id, {
      ...update,
    });
    if (!value) return { ok: false, reason: 'not_found' };
    return { ok: true, value };
  } catch (error) {
    if (error instanceof AppError && error.code === 'USER_DUPLICATE') {
      return { ok: false, reason: 'duplicate' };
    }
    throw error;
  }
}

export type DeleteUserInput = {
  scope: RequestScope;
  id: UserId;
};

export async function deleteUser(
  deps: UserUseCaseDeps,
  input: DeleteUserInput
): Promise<UseCaseResult<void, 'forbidden' | 'self'>> {
  const currentUserId = toUserId(input.scope.userId);
  const allowed = await deps.permissionChecker.hasPermission(currentUserId, {
    user: ['delete'],
  });
  if (!allowed) return { ok: false, reason: 'forbidden' };
  if (isSelfTarget(currentUserId, input.id)) {
    return { ok: false, reason: 'self' };
  }

  deps.logger.info('user.delete', { event: 'user.delete', userId: input.id });
  const removed = await deps.userAuthGateway.removeUser(input.id);
  if (!removed) {
    throw new AppError({
      code: 'USER_DELETE_FAILED',
      category: 'system',
      status: 500,
      message: 'Failed to delete user',
    });
  }
  return { ok: true, value: undefined };
}

export type ListUserSessionsInput = {
  scope: RequestScope;
  userId: UserId;
  cursor?: SessionId;
  limit: number;
};

export async function listUserSessions(
  deps: UserUseCaseDeps,
  input: ListUserSessionsInput
): Promise<UseCaseResult<UserSessionListPage, 'forbidden'>> {
  const currentUserId = toUserId(input.scope.userId);
  const allowed = await deps.permissionChecker.hasPermission(currentUserId, {
    session: ['list'],
  });
  if (!allowed) return { ok: false, reason: 'forbidden' };

  deps.logger.info('user.sessions.list', {
    event: 'user.sessions.list',
    userId: input.userId,
  });
  const value = await deps.userRepository.listSessions({
    userId: input.userId,
    cursor: input.cursor,
    limit: input.limit,
  });
  return { ok: true, value };
}

export type RevokeUserSessionsInput = {
  scope: RequestScope;
  id: UserId;
};

export async function revokeUserSessions(
  deps: UserUseCaseDeps,
  input: RevokeUserSessionsInput
): Promise<UseCaseResult<void, 'forbidden' | 'self'>> {
  const currentUserId = toUserId(input.scope.userId);
  const allowed = await deps.permissionChecker.hasPermission(currentUserId, {
    session: ['revoke'],
  });
  if (!allowed) return { ok: false, reason: 'forbidden' };
  if (isSelfTarget(currentUserId, input.id)) {
    return { ok: false, reason: 'self' };
  }

  const revoked = await deps.userAuthGateway.revokeUserSessions(input.id);
  if (!revoked) {
    throw new AppError({
      code: 'USER_SESSIONS_REVOKE_FAILED',
      category: 'system',
      status: 500,
      message: 'Failed to revoke user sessions',
    });
  }
  return { ok: true, value: undefined };
}

export type RevokeUserSessionInput = {
  scope: RequestScope;
  currentSessionId: SessionId;
  id: UserId;
  sessionId: SessionId;
};

export async function revokeUserSession(
  deps: UserUseCaseDeps,
  input: RevokeUserSessionInput
): Promise<UseCaseResult<void, 'forbidden' | 'not_found' | 'self'>> {
  const currentUserId = toUserId(input.scope.userId);
  const allowed = await deps.permissionChecker.hasPermission(currentUserId, {
    session: ['revoke'],
  });
  if (!allowed) return { ok: false, reason: 'forbidden' };

  const targetSession = await deps.userRepository.findSessionForRevocation({
    userId: input.id,
    sessionId: input.sessionId,
  });
  if (!targetSession) return { ok: false, reason: 'not_found' };
  if (input.currentSessionId === targetSession.id) {
    return { ok: false, reason: 'self' };
  }

  const revoked = await deps.userAuthGateway.revokeUserSession(targetSession);
  if (!revoked) {
    throw new AppError({
      code: 'USER_SESSION_REVOKE_FAILED',
      category: 'system',
      status: 500,
      message: 'Failed to revoke user session',
    });
  }
  return { ok: true, value: undefined };
}

export function createUserUseCases(deps: UserUseCaseDeps) {
  return {
    list: (input: ListUsersInput) => listUsers(deps, input),
    get: (input: GetUserInput) => getUser(deps, input),
    create: (input: CreateUserInput) => createUser(deps, input),
    update: (input: UpdateUserInput) => updateUser(deps, input),
    delete: (input: DeleteUserInput) => deleteUser(deps, input),
    listSessions: (input: ListUserSessionsInput) =>
      listUserSessions(deps, input),
    revokeSessions: (input: RevokeUserSessionsInput) =>
      revokeUserSessions(deps, input),
    revokeSession: (input: RevokeUserSessionInput) =>
      revokeUserSession(deps, input),
  };
}

export type UserUseCases = ReturnType<typeof createUserUseCases>;
