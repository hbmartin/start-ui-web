import { createServerOnlyFn } from '@tanstack/react-start';

import type { ProtectedContext } from '@/modules/auth/server';

import { createBookServerFunctions } from './transport/server-functions';

const getDeps = createServerOnlyFn(async () => {
  const [
    { getBookUseCases },
    { getKernelForCtx },
    { withProtectedContext, withProtectedMutation },
  ] = await Promise.all([
    import('@/composition/book'),
    import('@/composition/shared/server-deps'),
    import('@/modules/auth/server'),
  ]);

  return {
    useCases: (ctx: ProtectedContext) =>
      getBookUseCases({ kernel: getKernelForCtx(ctx) }),
    withProtectedContext,
    withProtectedMutation,
  };
});

const serverFunctions = createBookServerFunctions({ getDeps });

export const bookGetAll = serverFunctions.bookGetAll;
export const bookGetById = serverFunctions.bookGetById;
export const bookCreate = serverFunctions.bookCreate;
export const bookUpdateById = serverFunctions.bookUpdateById;
export const bookDeleteById = serverFunctions.bookDeleteById;
export type { BookServerFunctions } from './transport/server-functions';
