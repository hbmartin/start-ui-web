import { z } from 'zod';

import { zu } from '@/platform/lib/zod/zod-utils';

import { zGenre } from '@/modules/genre/presentation';
import { zBookCoverObjectKey, zBookId } from '@/modules/kernel/domain/ids';

import {
  BOOK_AUTHOR_MAX_LENGTH,
  BOOK_PUBLISHER_MAX_LENGTH,
  BOOK_TITLE_MAX_LENGTH,
} from '../domain/book-policy';

export type Book = z.infer<ReturnType<typeof zBook>>;

export const zBook = () =>
  z.object({
    id: zBookId(),
    title: zu.fieldText.required({ error: 'book:common.title.required' }),
    author: zu.fieldText.required(),
    genre: zGenre().nullish(),
    publisher: zu.fieldText.nullish(),
    createdAt: z.date(),
    updatedAt: z.date(),
    coverId: zBookCoverObjectKey().nullish(),
  });

export type FormFieldsBook = z.infer<ReturnType<typeof zFormFieldsBook>>;
export const zFormFieldsBook = () =>
  z.object({
    title: zu.fieldText.required({
      error: 'book:common.title.required',
      max: BOOK_TITLE_MAX_LENGTH,
    }),
    author: zu.fieldText.required({ max: BOOK_AUTHOR_MAX_LENGTH }),
    genreId: zu.fieldText.required(),
    publisher: zu.fieldText.nullish({ max: BOOK_PUBLISHER_MAX_LENGTH }),
    coverId: z.string().nullish(),
  });
