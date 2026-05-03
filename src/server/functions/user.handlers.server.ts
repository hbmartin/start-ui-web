import { getRequestHeaders } from '@tanstack/react-start/server';
import { z } from 'zod';

import { zUser } from '@/features/user/schema';
import { auth } from '@/server/auth';
import type { Prisma } from '@/server/db/generated/client';
import {
  assertPermission,
  type ProtectedContext,
} from '@/server/middlewares.server';
import { ServerFnError } from '@/server/server-fn-error';

export const zGetAllInput = () =>
  z
    .object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).prefault(20),
      searchTerm: z.string().trim().optional().prefault(''),
    })
    .prefault({});

const getAll = async (
  ctx: ProtectedContext,
  data: z.output<ReturnType<typeof zGetAllInput>>
) => {
  await assertPermission(ctx.user.id, { user: ['list'] });

  const where = {
    OR: [
      { name: { contains: data.searchTerm, mode: 'insensitive' } },
      { email: { contains: data.searchTerm, mode: 'insensitive' } },
    ],
  } satisfies Prisma.UserWhereInput;

  ctx.logger.info('Getting users from database');
  const [total, items] = await Promise.all([
    ctx.db.user.count({ where }),
    ctx.db.user.findMany({
      take: data.limit + 1,
      cursor: data.cursor ? { id: data.cursor } : undefined,
      orderBy: { name: 'asc' },
      where,
    }),
  ]);

  let nextCursor: typeof data.cursor | undefined = undefined;
  if (items.length > data.limit) {
    const nextItem = items.pop();
    nextCursor = nextItem?.id;
  }

  return { items, nextCursor, total };
};

export const zGetByIdInput = () => z.object({ id: z.string() });

const getById = async (
  ctx: ProtectedContext,
  data: z.infer<ReturnType<typeof zGetByIdInput>>
) => {
  await assertPermission(ctx.user.id, { user: ['list'] });

  ctx.logger.info('Getting user');
  const user = await ctx.db.user.findUnique({ where: { id: data.id } });

  if (!user) {
    ctx.logger.warn('Unable to find user with the provided input');
    throw new ServerFnError('NOT_FOUND');
  }

  return user;
};

export const zUpdateByIdInput = () =>
  zUser().pick({ id: true, name: true, email: true, role: true });

const updateById = async (
  ctx: ProtectedContext,
  data: z.infer<ReturnType<typeof zUpdateByIdInput>>
) => {
  await assertPermission(ctx.user.id, { user: ['set-role'] });

  ctx.logger.info('Getting current user email');
  const currentUser = await ctx.db.user.findUnique({
    where: { id: data.id },
    select: { email: true },
  });

  if (!currentUser) {
    ctx.logger.warn('Unable to find user with the provided input');
    throw new ServerFnError('NOT_FOUND');
  }

  ctx.logger.info('Update user');
  return await ctx.db.user.update({
    where: { id: data.id },
    data: {
      name: data.name ?? '',
      role: ctx.user.id === data.id ? undefined : data.role,
      email: data.email,
      emailVerified: currentUser.email !== data.email ? true : undefined,
    },
  });
};

export const zCreateInput = () =>
  zUser().pick({ name: true, email: true, role: true });

const create = async (
  ctx: ProtectedContext,
  data: z.infer<ReturnType<typeof zCreateInput>>
) => {
  await assertPermission(ctx.user.id, { user: ['create'] });

  ctx.logger.info('Create user');
  return await ctx.db.user.create({
    data: {
      email: data.email,
      emailVerified: true,
      name: data.name ?? '',
      role: data.role ?? 'user',
    },
  });
};

export const zDeleteByIdInput = () => zUser().pick({ id: true });

const deleteById = async (
  ctx: ProtectedContext,
  data: z.infer<ReturnType<typeof zDeleteByIdInput>>
) => {
  await assertPermission(ctx.user.id, { user: ['delete'] });

  if (ctx.user.id === data.id) {
    ctx.logger.warn('Prevent to delete the current connected user');
    throw new ServerFnError('BAD_REQUEST', {
      message: 'You cannot delete yourself',
    });
  }

  ctx.logger.info('Delete user');
  const response = await auth.api.removeUser({
    body: { userId: data.id },
    headers: getRequestHeaders(),
  });

  if (!response.success) {
    ctx.logger.error('Failed to delete the user');
    throw new ServerFnError('INTERNAL_SERVER_ERROR');
  }
};

export const zGetUserSessionsInput = () =>
  z.object({
    userId: z.string(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).prefault(20),
  });

const getUserSessions = async (
  ctx: ProtectedContext,
  data: z.output<ReturnType<typeof zGetUserSessionsInput>>
) => {
  await assertPermission(ctx.user.id, { session: ['list'] });

  const where = {
    userId: data.userId,
  } satisfies Prisma.SessionWhereInput;

  ctx.logger.info('Getting user sessions from database');
  const [total, items] = await Promise.all([
    ctx.db.session.count({ where }),
    ctx.db.session.findMany({
      take: data.limit + 1,
      cursor: data.cursor ? { id: data.cursor } : undefined,
      orderBy: { createdAt: 'desc' },
      where,
    }),
  ]);

  let nextCursor: typeof data.cursor | undefined = undefined;
  if (items.length > data.limit) {
    const nextItem = items.pop();
    nextCursor = nextItem?.id;
  }

  return { items, nextCursor, total };
};

export const zRevokeUserSessionsInput = () => z.object({ id: z.string() });

const revokeUserSessions = async (
  ctx: ProtectedContext,
  data: z.infer<ReturnType<typeof zRevokeUserSessionsInput>>
) => {
  await assertPermission(ctx.user.id, { session: ['revoke'] });

  if (ctx.user.id === data.id) {
    ctx.logger.warn(
      'Prevent to revoke all sesssions of the current connected user'
    );
    throw new ServerFnError('BAD_REQUEST', {
      message: 'You cannot revoke all your sessions',
    });
  }

  ctx.logger.info('Revoke all user sessions');
  const response = await auth.api.revokeUserSessions({
    body: { userId: data.id },
    headers: getRequestHeaders(),
  });

  if (!response.success) {
    ctx.logger.error('Failed to revoke all the user sessions');
    throw new ServerFnError('INTERNAL_SERVER_ERROR');
  }
};

export const zRevokeUserSessionInput = () =>
  z.object({ id: z.string(), sessionToken: z.string() });

const revokeUserSession = async (
  ctx: ProtectedContext,
  data: z.infer<ReturnType<typeof zRevokeUserSessionInput>>
) => {
  await assertPermission(ctx.user.id, { session: ['revoke'] });

  if (ctx.session.token === data.sessionToken) {
    ctx.logger.warn('Prevent to revoke the current connected user session');
    throw new ServerFnError('BAD_REQUEST', {
      message: 'You cannot revoke your current session',
    });
  }

  ctx.logger.info('Revoke user session');
  const response = await auth.api.revokeUserSession({
    body: { sessionToken: data.sessionToken },
    headers: getRequestHeaders(),
  });

  if (!response.success) {
    ctx.logger.error('Failed to revoke the user session');
    throw new ServerFnError('INTERNAL_SERVER_ERROR');
  }
};

export type UserHandlers = {
  getAll: typeof getAll;
  getById: typeof getById;
  updateById: typeof updateById;
  create: typeof create;
  deleteById: typeof deleteById;
  getUserSessions: typeof getUserSessions;
  revokeUserSessions: typeof revokeUserSessions;
  revokeUserSession: typeof revokeUserSession;
};

export const handlers: UserHandlers = {
  getAll,
  getById,
  updateById,
  create,
  deleteById,
  getUserSessions,
  revokeUserSessions,
  revokeUserSession,
};
