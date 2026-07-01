import { z } from 'zod';

import { zGenreId } from '@/modules/kernel/domain/ids';

import { zGenreColor, zGenreName } from '../domain/genre';

export type Genre = z.infer<ReturnType<typeof zGenre>>;

export const zGenre = () =>
  z.object({
    id: zGenreId(),
    name: zGenreName(),
    color: zGenreColor(),
    createdAt: z.date(),
    updatedAt: z.date(),
  });
