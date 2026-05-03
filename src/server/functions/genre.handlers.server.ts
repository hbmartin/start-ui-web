import { z } from 'zod';

import type { Prisma } from '@/server/db/generated/client';
import {
  assertPermission,
  type ProtectedContext,
} from '@/server/middlewares.server';

export const zGetAllInput = () =>
  z
    .object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).prefault(20),
      searchTerm: z.string().optional(),
    })
    .prefault({});

const getAll = async (
  ctx: ProtectedContext,
  data: z.output<ReturnType<typeof zGetAllInput>>
) => {
  await assertPermission(ctx.user.id, { genre: ['read'] });

  ctx.logger.info('Getting genres from database');

  const where = {
    name: { contains: data.searchTerm, mode: 'insensitive' },
  } satisfies Prisma.GenreWhereInput;

  const [total, items] = await Promise.all([
    ctx.db.genre.count({ where }),
    ctx.db.genre.findMany({
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

export type GenreHandlers = {
  getAll: typeof getAll;
};

export const handlers: GenreHandlers = {
  getAll,
};
