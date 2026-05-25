import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import type { ProtectedContext } from '@/modules/auth/server';
import type { BookUseCases } from '@/modules/book';
import { zFormFieldsBook } from '@/modules/book/presentation/schema';
import { toBookId, toGenreId } from '@/modules/kernel/domain/ids';
import {
  mapAppErrorToServerFnError,
  throwServerFnErrorForReason,
} from '@/modules/kernel/transport/tanstack/result-mapper';

export const zGetAllInput = () =>
  z
    .object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).prefault(20),
      searchTerm: z.string().trim().optional(),
    })
    .prefault({});

export const zGetByIdInput = () => z.object({ id: z.string() });

export const zUpdateByIdInput = () =>
  zFormFieldsBook().extend({ id: z.string() });

export const zDeleteByIdInput = () => z.object({ id: z.string() });

type ProtectedRunner = <T>(
  fn: (ctx: ProtectedContext) => Promise<T>
) => Promise<T>;

type BookServerFunctionDeps = {
  getDeps: () => Promise<{
    useCases: (ctx: ProtectedContext) => BookUseCases;
    withProtectedContext: ProtectedRunner;
    withProtectedMutation: ProtectedRunner;
  }>;
};

const mapReason = (reason: string): never =>
  throwServerFnErrorForReason(reason, {
    duplicate: {
      code: 'CONFLICT',
      message: 'Unique constraint violation',
      data: { target: ['title', 'author'] },
    },
    forbidden: 'FORBIDDEN',
    not_found: 'NOT_FOUND',
  });

export const createBookServerFunctions = ({
  getDeps,
}: BookServerFunctionDeps) => ({
  bookGetAll: createServerFn({ method: 'GET' })
    .inputValidator(zGetAllInput())
    .handler(async ({ data }) => {
      const { useCases, withProtectedContext } = await getDeps();
      return withProtectedContext(async (ctx) => {
        const result = await useCases(ctx)
          .list({
            scope: ctx.scope,
            cursor: data.cursor ? toBookId(data.cursor) : undefined,
            limit: data.limit,
            searchTerm: data.searchTerm ?? '',
          })
          .catch(mapAppErrorToServerFnError);
        if (result.ok) return result.value;
        return mapReason(result.reason);
      });
    }),

  bookGetById: createServerFn({ method: 'GET' })
    .inputValidator(zGetByIdInput())
    .handler(async ({ data }) => {
      const { useCases, withProtectedContext } = await getDeps();
      return withProtectedContext(async (ctx) => {
        const result = await useCases(ctx)
          .get({ scope: ctx.scope, id: toBookId(data.id) })
          .catch(mapAppErrorToServerFnError);
        if (result.ok) return result.value;
        return mapReason(result.reason);
      });
    }),

  bookCreate: createServerFn({ method: 'POST' })
    .inputValidator(zFormFieldsBook())
    .handler(async ({ data }) => {
      const { useCases, withProtectedMutation } = await getDeps();
      return withProtectedMutation(async (ctx) => {
        const result = await useCases(ctx)
          .create({
            scope: ctx.scope,
            book: {
              title: data.title,
              author: data.author,
              genreId: toGenreId(data.genreId),
              publisher: data.publisher,
              coverId: data.coverId,
            },
          })
          .catch(mapAppErrorToServerFnError);
        if (result.ok) return result.value;
        return mapReason(result.reason);
      });
    }),

  bookUpdateById: createServerFn({ method: 'POST' })
    .inputValidator(zUpdateByIdInput())
    .handler(async ({ data }) => {
      const { useCases, withProtectedMutation } = await getDeps();
      return withProtectedMutation(async (ctx) => {
        const result = await useCases(ctx)
          .update({
            scope: ctx.scope,
            id: toBookId(data.id),
            book: {
              title: data.title,
              author: data.author,
              genreId: toGenreId(data.genreId),
              publisher: data.publisher,
              coverId: data.coverId,
            },
          })
          .catch(mapAppErrorToServerFnError);
        if (result.ok) return result.value;
        return mapReason(result.reason);
      });
    }),

  bookDeleteById: createServerFn({ method: 'POST' })
    .inputValidator(zDeleteByIdInput())
    .handler(async ({ data }) => {
      const { useCases, withProtectedMutation } = await getDeps();
      return withProtectedMutation(async (ctx) => {
        const result = await useCases(ctx)
          .delete({ scope: ctx.scope, id: toBookId(data.id) })
          .catch(mapAppErrorToServerFnError);
        if (result.ok) return;
        return mapReason(result.reason);
      });
    }),
});

export type BookServerFunctions = ReturnType<typeof createBookServerFunctions>;
