import { createServerOnlyFn } from '@tanstack/react-start';

import type { ProtectedContext } from '@/modules/auth/server';

import { createUserServerFunctions } from './transport/server-functions';

const getDeps = createServerOnlyFn(async () => {
  const [
    { getUserUseCases },
    { getKernelForCtx },
    { withProtectedContext, withProtectedMutation },
  ] = await Promise.all([
    import('@/composition/user'),
    import('@/composition/shared/server-deps'),
    import('@/modules/auth/server'),
  ]);

  return {
    useCases: (ctx: ProtectedContext) =>
      getUserUseCases({ kernel: getKernelForCtx(ctx) }),
    withProtectedContext,
    withProtectedMutation,
  };
});

const serverFunctions = createUserServerFunctions({ getDeps });

export const userGetAll = serverFunctions.userGetAll;
export const userGetById = serverFunctions.userGetById;
export const userUpdateById = serverFunctions.userUpdateById;
export const userCreate = serverFunctions.userCreate;
export const userDeleteById = serverFunctions.userDeleteById;
export const userGetUserSessions = serverFunctions.userGetUserSessions;
export const userRevokeUserSessions = serverFunctions.userRevokeUserSessions;
export const userRevokeUserSession = serverFunctions.userRevokeUserSession;
export type { UserServerFunctions } from './transport/server-functions';
