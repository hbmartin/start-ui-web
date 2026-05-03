import { z } from 'zod';

import { zBook, zFormFieldsBook } from '@/features/book/schema';
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
  await assertPermission(ctx.user.id, { book: ['read'] });

  ctx.logger.info('Getting books from database');

  const where = {
    OR: [
      { title: { contains: data.searchTerm, mode: 'insensitive' } },
      { author: { contains: data.searchTerm, mode: 'insensitive' } },
    ],
  } satisfies Prisma.BookWhereInput;

  const [total, items] = await Promise.all([
    ctx.db.book.count({ where }),
    ctx.db.book.findMany({
      take: data.limit + 1,
      cursor: data.cursor ? { id: data.cursor } : undefined,
      orderBy: { title: 'asc' },
      where,
      include: { genre: true },
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
  await assertPermission(ctx.user.id, { book: ['read'] });

  ctx.logger.info('Getting book');
  const book = await ctx.db.book.findUnique({
    where: { id: data.id },
    include: { genre: true },
  });

  if (!book) {
    ctx.logger.warn('Unable to find book with the provided input');
    throw new ServerFnError('NOT_FOUND');
  }

  return book;
};

const create = async (
  ctx: ProtectedContext,
  data: z.infer<ReturnType<typeof zFormFieldsBook>>
) => {
  await assertPermission(ctx.user.id, { book: ['create'] });

  ctx.logger.info('Create book');
  return await ctx.db.book.create({
    data: {
      title: data.title,
      author: data.author,
      genreId: data.genreId ?? undefined,
      publisher: data.publisher,
      coverId: data.coverId,
    },
  });
};

export const zUpdateByIdInput = () =>
  zFormFieldsBook().extend({ id: z.string() });

const updateById = async (
  ctx: ProtectedContext,
  data: z.infer<ReturnType<typeof zUpdateByIdInput>>
) => {
  await assertPermission(ctx.user.id, { book: ['update'] });

  ctx.logger.info('Update book');
  return await ctx.db.book.update({
    where: { id: data.id },
    data: {
      title: data.title,
      author: data.author,
      genreId: data.genreId,
      publisher: data.publisher ?? null,
      coverId: data.coverId ?? null,
    },
  });
};

export const zDeleteByIdInput = () => zBook().pick({ id: true });

const deleteById = async (
  ctx: ProtectedContext,
  data: z.infer<ReturnType<typeof zDeleteByIdInput>>
) => {
  await assertPermission(ctx.user.id, { book: ['delete'] });

  ctx.logger.info('Delete book');
  await ctx.db.book.delete({ where: { id: data.id } });
};

export type BookHandlers = {
  getAll: typeof getAll;
  getById: typeof getById;
  create: typeof create;
  updateById: typeof updateById;
  deleteById: typeof deleteById;
};

export const handlers: BookHandlers = {
  getAll,
  getById,
  create,
  updateById,
  deleteById,
};
