import { createServerOnlyFn } from '@tanstack/react-start';

import type { ProtectedContext } from '@/modules/auth/server';

import { createGenreServerFunctions } from './transport/server-functions';

const getDeps = createServerOnlyFn(async () => {
  const [
    { getGenreUseCases },
    { getKernelForCtx },
    { withProtectedContext },
  ] = await Promise.all([
    import('@/composition/genre'),
    import('@/composition/shared/server-deps'),
    import('@/modules/auth/server'),
  ]);

  return {
    useCases: (ctx: ProtectedContext) =>
      getGenreUseCases({ kernel: getKernelForCtx(ctx) }),
    withProtectedContext,
  };
});

const serverFunctions = createGenreServerFunctions({ getDeps });

export const genreGetAll = serverFunctions.genreGetAll;
export type { GenreServerFunctions } from './transport/server-functions';
