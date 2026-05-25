import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import type { ProtectedContext } from '@/modules/auth/server';
import {
  toEmailAddress,
  toSessionId,
  toUserId,
} from '@/modules/kernel/domain/ids';
import {
  mapAppErrorToServerFnError,
  throwServerFnErrorForReason,
} from '@/modules/kernel/transport/tanstack/result-mapper';
import type { UserUseCases } from '@/modules/user';
import type { UserRole } from '@/modules/user/domain/user';

const zRole = () => z.enum(['admin', 'user']);

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
  z.object({
    id: z.string(),
    name: z.string().nullish(),
    email: z.email(),
    role: zRole().nullish(),
  });

export const zCreateInput = () =>
  z.object({
    name: z.string().nullish(),
    email: z.email(),
    role: zRole().nullish(),
  });

export const zDeleteByIdInput = () => z.object({ id: z.string() });

export const zGetUserSessionsInput = () =>
  z.object({
    userId: z.string(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).prefault(20),
  });

export const zRevokeUserSessionsInput = () => z.object({ id: z.string() });

export const zRevokeUserSessionInput = () =>
  z.object({ id: z.string(), sessionId: z.string() });

type ProtectedRunner = <T>(
  fn: (ctx: ProtectedContext) => Promise<T>
) => Promise<T>;

type UserServerFunctionDeps = {
  getDeps: () => Promise<{
    useCases: (ctx: ProtectedContext) => UserUseCases;
    withProtectedContext: ProtectedRunner;
    withProtectedMutation: ProtectedRunner;
  }>;
};

const mapReason = (
  reason: string,
  options?: { selfMessage?: string }
): never =>
  throwServerFnErrorForReason(reason, {
    duplicate: {
      code: 'CONFLICT',
      message: 'Unique constraint violation',
      data: { target: ['email'] },
    },
    forbidden: 'FORBIDDEN',
    not_found: 'NOT_FOUND',
    self: {
      code: 'BAD_REQUEST',
      message: options?.selfMessage ?? 'You cannot target yourself',
    },
  });

export const createUserServerFunctions = ({
  getDeps,
}: UserServerFunctionDeps) => ({
  userGetAll: createServerFn({ method: 'GET' })
    .inputValidator(zGetAllInput())
    .handler(async ({ data }) => {
      const { useCases, withProtectedContext } = await getDeps();
      return withProtectedContext(async (ctx) => {
        const result = await useCases(ctx)
          .list({
            scope: ctx.scope,
            cursor: data.cursor ? toUserId(data.cursor) : undefined,
            limit: data.limit,
            searchTerm: data.searchTerm ?? '',
          })
          .catch(mapAppErrorToServerFnError);
        if (result.ok) return result.value;
        return mapReason(result.reason);
      });
    }),

  userGetById: createServerFn({ method: 'GET' })
    .inputValidator(zGetByIdInput())
    .handler(async ({ data }) => {
      const { useCases, withProtectedContext } = await getDeps();
      return withProtectedContext(async (ctx) => {
        const result = await useCases(ctx)
          .get({ scope: ctx.scope, id: toUserId(data.id) })
          .catch(mapAppErrorToServerFnError);
        if (result.ok) return result.value;
        return mapReason(result.reason);
      });
    }),

  userUpdateById: createServerFn({ method: 'POST' })
    .inputValidator(zUpdateByIdInput())
    .handler(async ({ data }) => {
      const { useCases, withProtectedMutation } = await getDeps();
      return withProtectedMutation(async (ctx) => {
        const result = await useCases(ctx)
          .update({
            scope: ctx.scope,
            id: toUserId(data.id),
            user: {
              name: data.name,
              email: toEmailAddress(data.email),
              role: data.role as UserRole | null | undefined,
            },
          })
          .catch(mapAppErrorToServerFnError);
        if (result.ok) return result.value;
        return mapReason(result.reason);
      });
    }),

  userCreate: createServerFn({ method: 'POST' })
    .inputValidator(zCreateInput())
    .handler(async ({ data }) => {
      const { useCases, withProtectedMutation } = await getDeps();
      return withProtectedMutation(async (ctx) => {
        const result = await useCases(ctx)
          .create({
            scope: ctx.scope,
            user: {
              name: data.name,
              email: toEmailAddress(data.email),
              role: data.role as UserRole | null | undefined,
            },
          })
          .catch(mapAppErrorToServerFnError);
        if (result.ok) return result.value;
        return mapReason(result.reason);
      });
    }),

  userDeleteById: createServerFn({ method: 'POST' })
    .inputValidator(zDeleteByIdInput())
    .handler(async ({ data }) => {
      const { useCases, withProtectedMutation } = await getDeps();
      return withProtectedMutation(async (ctx) => {
        const result = await useCases(ctx)
          .delete({ scope: ctx.scope, id: toUserId(data.id) })
          .catch(mapAppErrorToServerFnError);
        if (result.ok) return;
        return mapReason(result.reason, {
          selfMessage: 'You cannot delete yourself',
        });
      });
    }),

  userGetUserSessions: createServerFn({ method: 'GET' })
    .inputValidator(zGetUserSessionsInput())
    .handler(async ({ data }) => {
      const { useCases, withProtectedContext } = await getDeps();
      return withProtectedContext(async (ctx) => {
        const result = await useCases(ctx)
          .listSessions({
            scope: ctx.scope,
            userId: toUserId(data.userId),
            cursor: data.cursor ? toSessionId(data.cursor) : undefined,
            limit: data.limit,
          })
          .catch(mapAppErrorToServerFnError);
        if (result.ok) return result.value;
        return mapReason(result.reason);
      });
    }),

  userRevokeUserSessions: createServerFn({ method: 'POST' })
    .inputValidator(zRevokeUserSessionsInput())
    .handler(async ({ data }) => {
      const { useCases, withProtectedMutation } = await getDeps();
      return withProtectedMutation(async (ctx) => {
        const result = await useCases(ctx)
          .revokeSessions({ scope: ctx.scope, id: toUserId(data.id) })
          .catch(mapAppErrorToServerFnError);
        if (result.ok) return;
        return mapReason(result.reason, {
          selfMessage: 'You cannot revoke your own sessions',
        });
      });
    }),

  userRevokeUserSession: createServerFn({ method: 'POST' })
    .inputValidator(zRevokeUserSessionInput())
    .handler(async ({ data }) => {
      const { useCases, withProtectedMutation } = await getDeps();
      return withProtectedMutation(async (ctx) => {
        const result = await useCases(ctx)
          .revokeSession({
            scope: ctx.scope,
            currentSessionId: toSessionId(ctx.session.id),
            id: toUserId(data.id),
            sessionId: toSessionId(data.sessionId),
          })
          .catch(mapAppErrorToServerFnError);
        if (result.ok) return;
        return mapReason(result.reason, {
          selfMessage: 'You cannot revoke your current session',
        });
      });
    }),
});

export type UserServerFunctions = ReturnType<typeof createUserServerFunctions>;
