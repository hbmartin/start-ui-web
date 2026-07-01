import { Result } from '@bloodyowl/boxed';
import { and, asc, eq, sql } from 'drizzle-orm';
import { match, P } from 'ts-pattern';

import type { ApplicationResult } from '@/modules/kernel/application/result';
import { AppError } from '@/modules/kernel/domain/errors/app-error';
import {
  type GenreId,
  type ParseResult,
  toGenreId,
} from '@/modules/kernel/domain/ids';
import {
  getConstraintName,
  isUniqueConstraintViolation,
} from '@/modules/kernel/infrastructure/db/errors';
import { observeRepository } from '@/modules/kernel/infrastructure/db/observability';
import {
  ascendingTextCursorFilter,
  escapedIlikeFilter,
  takeCursorPage,
} from '@/modules/kernel/infrastructure/db/query-helpers';
import { genre as genreTable } from '@/modules/kernel/infrastructure/db/schema';
import type { DbLike } from '@/modules/kernel/infrastructure/db/types';

import type { GenreRepository } from '../../application/ports/genre-repository';
import type { Genre } from '../../domain/genre';
import { toGenreColor, toGenreName } from '../../domain/genre';

function invalidGenreRowError(cause: unknown): AppError {
  return new AppError({
    code: 'GENRE_ROW_INVALID',
    category: 'system',
    status: 500,
    message: 'Genre row contains invalid data',
    cause,
  });
}

function parseGenreRowValue<TValue>(
  result: ParseResult<TValue>
): ApplicationResult<TValue> {
  return result.isError()
    ? Result.Error(invalidGenreRowError(result.getError()))
    : Result.Ok(result.get());
}

function toDomain(
  row: typeof genreTable.$inferSelect
): ApplicationResult<Genre> {
  const id = parseGenreRowValue(toGenreId(row.id));
  if (id.isError()) return Result.Error(id.getError());

  const name = parseGenreRowValue(toGenreName(row.name));
  if (name.isError()) return Result.Error(name.getError());

  const color = parseGenreRowValue(toGenreColor(row.color));
  if (color.isError()) return Result.Error(color.getError());

  return Result.Ok({
    id: id.get(),
    name: name.get(),
    color: color.get(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toDomainList(
  rows: readonly (typeof genreTable.$inferSelect)[]
): ApplicationResult<Genre[]> {
  const genres: Genre[] = [];
  for (const row of rows) {
    const genre = toDomain(row);
    if (genre.isError()) return Result.Error(genre.getError());
    genres.push(genre.get());
  }
  return Result.Ok(genres);
}

function isGenreDuplicateError(error: unknown) {
  return (
    isUniqueConstraintViolation(error) &&
    getConstraintName(error) === 'genre_name_key'
  );
}

function mapDbError(error: unknown): AppError {
  return match(error)
    .with(P.instanceOf(AppError), (appError) => appError)
    .when(
      isGenreDuplicateError,
      () =>
        new AppError({
          code: 'GENRE_DUPLICATE',
          category: 'conflict',
          status: 409,
          message: 'Genre already exists',
          details: { target: ['name'] },
          cause: error,
        })
    )
    .otherwise(
      () =>
        new AppError({
          code: 'GENRE_REPOSITORY_ERROR',
          category: 'system',
          status: 500,
          message: 'Genre repository error',
          cause: error,
        })
    );
}

export class GenreRepositoryDrizzle implements GenreRepository {
  constructor(private readonly db: DbLike) {}

  async list(input: Parameters<GenreRepository['list']>[0]) {
    try {
      const searchFilter = escapedIlikeFilter(
        [genreTable.name],
        input.searchTerm
      );

      const cursorRow = input.cursor
        ? await this.db.query.genre.findFirst({
            where: eq(genreTable.id, input.cursor),
            columns: { id: true, name: true },
          })
        : undefined;

      if (input.cursor && !cursorRow) {
        const [totalResult] = await this.db
          .select({ count: sql<number>`cast(count(*) as integer)` })
          .from(genreTable)
          .where(searchFilter);

        return Result.Ok({
          type: 'genre_listed' as const,
          page: {
            items: [],
            nextCursor: undefined,
            total: totalResult?.count ?? 0,
          },
        });
      }

      const cursorFilter = ascendingTextCursorFilter({
        sortColumn: genreTable.name,
        idColumn: genreTable.id,
        cursor: cursorRow
          ? { id: cursorRow.id, sortValue: cursorRow.name }
          : undefined,
      });

      const where = and(searchFilter, cursorFilter);

      const [total, rows] = await Promise.all([
        this.db
          .select({ count: sql<number>`cast(count(*) as integer)` })
          .from(genreTable)
          .where(searchFilter),
        this.db.query.genre.findMany({
          where,
          orderBy: [asc(genreTable.name), asc(genreTable.id)],
          limit: input.limit + 1,
        }),
      ]);

      const { pageRows, nextCursor } = takeCursorPage(
        rows,
        input.limit,
        (row) => row.id
      );
      let parsedNextCursor: GenreId | undefined;
      if (nextCursor) {
        const cursor = parseGenreRowValue(toGenreId(nextCursor));
        if (cursor.isError()) {
          return Result.Error(cursor.getError());
        }
        parsedNextCursor = cursor.get();
      }
      const items = toDomainList(pageRows);
      if (items.isError()) return Result.Error(items.getError());

      return Result.Ok({
        type: 'genre_listed' as const,
        page: {
          items: items.get(),
          nextCursor: parsedNextCursor,
          total: total[0]?.count ?? 0,
        },
      });
    } catch (error) {
      return Result.Error(mapDbError(error));
    }
  }
}

export interface GenreRepositoryDrizzleDependencies {
  db: DbLike;
}

export function createGenreRepository(
  dependencies: GenreRepositoryDrizzleDependencies
): GenreRepository {
  return observeRepository(
    new GenreRepositoryDrizzle(dependencies.db),
    'genre'
  );
}
