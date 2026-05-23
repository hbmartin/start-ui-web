import { getRequestHeaders } from '@tanstack/react-start/server';

import type { UserAuthGateway } from '@/modules/user/application/ports/user-auth-gateway';
import type { UserRepository } from '@/modules/user/application/ports/user-repository';
import { createUserUseCases } from '@/modules/user/factory';
import { UserRepositoryDrizzle } from '@/modules/user/infrastructure/drizzle/user-repository-drizzle';

import { getAuthUseCases } from './auth';
import { getKernel, type KernelOverrides } from './kernel';
import { hasDefinedOverrides } from './shared/overrides';
import { createCachedFactory } from './shared/singleton';

const productionUserAuthGateway: UserAuthGateway = {
  removeUser: (userId) =>
    getAuthUseCases().removeUser({ userId, headers: getRequestHeaders() }),
  revokeUserSessions: (userId) =>
    getAuthUseCases().revokeUserSessions({
      userId,
      headers: getRequestHeaders(),
    }),
  revokeUserSession: (sessionToken) =>
    getAuthUseCases().revokeUserSession({
      sessionToken,
      headers: getRequestHeaders(),
    }),
};

export type UserCompositionOverrides = KernelOverrides & {
  userRepository?: UserRepository;
  userAuthGateway?: UserAuthGateway;
};

const buildUserUseCases = (overrides?: UserCompositionOverrides) => {
  const kernel = getKernel({ overrides });
  return createUserUseCases({
    userRepository:
      overrides?.userRepository ?? new UserRepositoryDrizzle(kernel.db),
    userAuthGateway: overrides?.userAuthGateway ?? productionUserAuthGateway,
    permissionChecker: kernel.permissionChecker,
    logger: kernel.logger,
  });
};

const getCachedUserUseCases = createCachedFactory(() => buildUserUseCases());

export function getUserUseCases(options?: {
  overrides?: UserCompositionOverrides;
}) {
  const overrides = options?.overrides;
  if (hasDefinedOverrides(overrides)) {
    return buildUserUseCases(overrides);
  }
  return getCachedUserUseCases(false);
}
