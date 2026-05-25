import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import type { ProtectedContext } from '@/modules/auth/server';
import type { GenreUseCases } from '@/modules/genre';
import { toGenreId, zGenreId } from '@/modules/kernel/domain/ids';
import { throwServerFnErrorForReason } from '@/modules/kernel/transport/tanstack/result-mapper';

export const zGetAllInput = () =>
  z
    .object({
      cursor: zGenreId().optional(),
      limit: z.coerce.number().int().min(1).max(100).prefault(20),
      searchTerm: z.string().trim().optional(),
    })
    .prefault({});

type ProtectedRunner = <T>(
  fn: (ctx: ProtectedContext) => Promise<T>
) => Promise<T>;

type GenreServerFunctionDeps = {
  getDeps: () => Promise<{
    useCases: (ctx: ProtectedContext) => GenreUseCases;
    withProtectedContext: ProtectedRunner;
  }>;
};

export const createGenreServerFunctions = ({
  getDeps,
}: GenreServerFunctionDeps) => ({
  genreGetAll: createServerFn({ method: 'GET' })
    .inputValidator(zGetAllInput())
    .handler(async ({ data }) => {
      const { useCases, withProtectedContext } = await getDeps();
      return withProtectedContext(async (ctx) => {
        const result = await useCases(ctx).list({
          scope: ctx.scope,
          cursor: data.cursor ? toGenreId(data.cursor) : undefined,
          limit: data.limit,
          searchTerm: data.searchTerm ?? '',
        });
        if (result.ok) return result.value;
        return throwServerFnErrorForReason(result.reason, {
          forbidden: 'FORBIDDEN',
        });
      });
    }),
});

export type GenreServerFunctions = ReturnType<
  typeof createGenreServerFunctions
>;
