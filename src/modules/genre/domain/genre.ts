import { Result } from '@bloodyowl/boxed';
import { z } from 'zod';

import { IdValidationError } from '@/modules/kernel/domain/errors/id-validation-error';
import type { GenreId } from '@/modules/kernel/domain/ids';
import type { ParseResult } from '@/modules/kernel/domain/ids';

import { GENRE_COLOR_PATTERN, GENRE_NAME_MAX_LENGTH } from './genre-policy';

export const zGenreNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(GENRE_NAME_MAX_LENGTH)
  .brand<'GenreName'>();
export const zGenreColorSchema = z
  .string()
  .trim()
  .regex(GENRE_COLOR_PATTERN)
  .brand<'GenreColor'>();

export type GenreName = z.infer<typeof zGenreNameSchema>;
export type GenreColor = z.infer<typeof zGenreColorSchema>;

export const zGenreName = () => zGenreNameSchema;
export const zGenreColor = () => zGenreColorSchema;

const parseGenreString = <TSchema extends z.ZodType>(
  schema: TSchema,
  value: string,
  typeName: string
): ParseResult<z.output<TSchema>> => {
  const result = schema.safeParse(value);
  if (!result.success) {
    return Result.Error(
      new IdValidationError(typeName, value, `${typeName} is invalid`)
    );
  }
  return Result.Ok(result.data);
};

export const toGenreName = (value: string): ParseResult<GenreName> =>
  parseGenreString(zGenreNameSchema, value, 'GenreName');
export const toGenreColor = (value: string): ParseResult<GenreColor> =>
  parseGenreString(zGenreColorSchema, value, 'GenreColor');

export type Genre = {
  id: GenreId;
  name: GenreName;
  color: GenreColor;
  createdAt: Date;
  updatedAt: Date;
};

export type GenreListPage = {
  items: Genre[];
  nextCursor?: GenreId;
  total: number;
};

export function normalizeGenreSearchTerm(searchTerm: string | undefined) {
  return searchTerm?.trim() ?? '';
}
