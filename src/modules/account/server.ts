import { createServerOnlyFn } from '@tanstack/react-start';

import type { ProtectedContext } from '@/modules/auth/server';

import { createAccountServerFunctions } from './transport/server-functions';

const getDeps = createServerOnlyFn(async () => {
  const [
    { getAccountUseCases },
    { getKernelForCtx },
    { withProtectedMutation },
  ] = await Promise.all([
    import('@/composition/account'),
    import('@/composition/shared/server-deps'),
    import('@/modules/auth/server'),
  ]);

  return {
    useCases: (ctx: ProtectedContext) =>
      getAccountUseCases({ kernel: getKernelForCtx(ctx) }),
    withProtectedMutation,
  };
});

const serverFunctions = createAccountServerFunctions({ getDeps });

export const accountSubmitOnboarding = serverFunctions.accountSubmitOnboarding;
export const accountUpdateInfo = serverFunctions.accountUpdateInfo;
export type { AccountServerFunctions } from './transport/server-functions';
