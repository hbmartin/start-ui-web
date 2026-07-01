import { Result } from '@bloodyowl/boxed';
import { and, asc, eq, sql } from 'drizzle-orm';
import { match, P } from 'ts-pattern';

import { toGenreColor, toGenreName } from '@/modules/genre';
import {
  AppError,
  type ApplicationResult,
  type BookCoverObjectKey,
  type BookId,
  ConfigurationError,
  type ParseResult,
  toBookCoverObjectKey,
  toBookId,
  toGenreId,
} from '@/modules/kernel';
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
import { book as bookTable } from '@/modules/kernel/infrastructure/db/schema';
import type {
  DbLike,
  RunInTransaction,
} from '@/modules/kernel/infrastructure/db/types';
import { isRootDatabase } from '@/modules/kernel/infrastructure/db/types';

import type { BookRepository } from '../../application/ports/book-repository';
import type { Book, BookGenreSummary, BookWriteInput } from '../../domain/book';
import { toBookAuthor, toBookTitle, toPublisherName } from '../../domain/book';
import { normalizeBookDuplicateKeyPart } from '../../domain/book-policy';

type BookRow = typeof bookTable.$inferSelect & {
  genre?: {
    id: string;
    name: string;
    color: string;
    createdAt: Date;
    updatedAt: Date;
  } | null;
};

function invalidBookRowError(cause: unknown): AppError {
  return new AppError({
    code: 'BOOK_ROW_INVALID',
    category: 'system',
    status: 500,
    message: 'Book row contains invalid data',
    cause,
  });
}

function parseBookRowValue<TValue>(
  result: ParseResult<TValue>
): ApplicationResult<TValue> {
  return result.isError()
    ? Result.Error(invalidBookRowError(result.getError()))
    : Result.Ok(result.get());
}

function toDomain(row: BookRow): ApplicationResult<Book> {
  const id = parseBookRowValue(toBookId(row.id));
  if (id.isError()) return Result.Error(id.getError());

  const genreId = parseBookRowValue(toGenreId(row.genreId));
  if (genreId.isError()) return Result.Error(genreId.getError());

  const title = parseBookRowValue(toBookTitle(row.title));
  if (title.isError()) return Result.Error(title.getError());

  const author = parseBookRowValue(toBookAuthor(row.author));
  if (author.isError()) return Result.Error(author.getError());

  let genre: BookGenreSummary | null = null;
  if (row.genre) {
    const summaryGenreId = parseBookRowValue(toGenreId(row.genre.id));
    if (summaryGenreId.isError())
      return Result.Error(summaryGenreId.getError());
    const summaryGenreName = parseBookRowValue(toGenreName(row.genre.name));
    if (summaryGenreName.isError()) {
      return Result.Error(summaryGenreName.getError());
    }
    const summaryGenreColor = parseBookRowValue(toGenreColor(row.genre.color));
    if (summaryGenreColor.isError()) {
      return Result.Error(summaryGenreColor.getError());
    }
    genre = {
      id: summaryGenreId.get(),
      name: summaryGenreName.get(),
      color: summaryGenreColor.get(),
      createdAt: row.genre.createdAt,
      updatedAt: row.genre.updatedAt,
    };
  }

  let publisher: Book['publisher'] = null;
  if (row.publisher) {
    const parsedPublisher = parseBookRowValue(toPublisherName(row.publisher));
    if (parsedPublisher.isError()) {
      return Result.Error(parsedPublisher.getError());
    }
    publisher = parsedPublisher.get();
  }

  let coverId: BookCoverObjectKey | null = null;
  if (row.coverId) {
    const parsedCoverId = parseBookRowValue(toBookCoverObjectKey(row.coverId));
    if (parsedCoverId.isError()) return Result.Error(parsedCoverId.getError());
    coverId = parsedCoverId.get();
  }

  return Result.Ok({
    id: id.get(),
    title: title.get(),
    author: author.get(),
    genreId: genreId.get(),
    genre,
    publisher,
    coverId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toDomainList(rows: readonly BookRow[]): ApplicationResult<Book[]> {
  const books: Book[] = [];
  for (const row of rows) {
    const book = toDomain(row);
    if (book.isError()) return Result.Error(book.getError());
    books.push(book.get());
  }
  return Result.Ok(books);
}

function isBookDuplicateError(error: unknown) {
  return (
    isUniqueConstraintViolation(error) &&
    ['book_title_author_key', 'book_normalized_title_author_key'].includes(
      getConstraintName(error) ?? ''
    )
  );
}

function mapDbError(error: unknown): AppError {
  return match(error)
    .with(P.instanceOf(AppError), (appError) => appError)
    .when(
      isBookDuplicateError,
      () =>
        new AppError({
          code: 'BOOK_DUPLICATE',
          category: 'conflict',
          status: 409,
          message: 'Book already exists',
          details: { target: ['title', 'author'] },
          cause: error,
        })
    )
    .with(
      { code: '23503' },
      () =>
        new AppError({
          code: 'BOOK_FOREIGN_KEY',
          category: 'bad_request',
          status: 400,
          message: 'Invalid book relationship',
          cause: error,
        })
    )
    .otherwise(
      () =>
        new AppError({
          code: 'BOOK_REPOSITORY_ERROR',
          category: 'system',
          status: 500,
          message: 'Book repository error',
          cause: error,
        })
    );
}

export class BookRepositoryDrizzle implements BookRepository {
  constructor(private readonly db: DbLike) {}

  private async getByIdWithDb(
    db: DbLike,
    id: BookId
  ): Promise<ApplicationResult<Book | null>> {
    const row = await db.query.book.findFirst({
      where: eq(bookTable.id, id),
      with: { genre: true },
    });
    return row ? toDomain(row) : Result.Ok(null);
  }

  private async runInSingleDbUnit<T>(
    work: (db: DbLike) => Promise<T>
  ): Promise<T> {
    const runInTransaction = (
      this.db as { $runInTransaction?: RunInTransaction }
    ).$runInTransaction;

    if (runInTransaction) return runInTransaction(work);
    if (isRootDatabase(this.db)) {
      throw new ConfigurationError(
        'Book cover replacement requires an interactive database transaction.'
      );
    }

    return work(this.db);
  }

  private async updateWithDb(
    db: DbLike,
    id: BookId,
    input: BookWriteInput
  ): Promise<{
    book: Book;
    replacedCoverId: BookCoverObjectKey | null;
  } | null> {
    const [current] = await db
      .select({ coverId: bookTable.coverId })
      .from(bookTable)
      .where(eq(bookTable.id, id))
      .for('update');

    if (!current) return null;

    const [updated] = await db
      .update(bookTable)
      .set({
        title: input.title,
        author: input.author,
        genreId: input.genreId,
        publisher: input.publisher ?? null,
        coverId: input.coverId ?? null,
      })
      .where(eq(bookTable.id, id))
      .returning({ id: bookTable.id });

    if (!updated) return null;

    const book = await this.getByIdWithDb(db, id);
    if (book.isError()) throw book.getError();
    const parsedBook = book.get();
    if (!parsedBook) return null;

    let replacedCoverId: BookCoverObjectKey | null = null;
    if (current.coverId) {
      const parsedReplacedCoverId = parseBookRowValue(
        toBookCoverObjectKey(current.coverId)
      );
      if (parsedReplacedCoverId.isError()) {
        throw parsedReplacedCoverId.getError();
      }
      replacedCoverId = parsedReplacedCoverId.get();
    }

    return {
      book: parsedBook,
      replacedCoverId,
    };
  }

  async list(input: Parameters<BookRepository['list']>[0]) {
    try {
      const searchFilter = escapedIlikeFilter(
        [bookTable.title, bookTable.author],
        input.searchTerm
      );

      const cursorRow = input.cursor
        ? await this.db.query.book.findFirst({
            where: eq(bookTable.id, input.cursor),
            columns: { id: true, title: true },
          })
        : undefined;

      if (input.cursor && !cursorRow) {
        const [totalResult] = await this.db
          .select({ count: sql<number>`cast(count(*) as integer)` })
          .from(bookTable)
          .where(searchFilter);

        return Result.Ok({
          type: 'book_listed' as const,
          page: {
            items: [],
            nextCursor: undefined,
            total: totalResult?.count ?? 0,
          },
        });
      }

      const cursorFilter = ascendingTextCursorFilter({
        sortColumn: bookTable.title,
        idColumn: bookTable.id,
        cursor: cursorRow
          ? { id: cursorRow.id, sortValue: cursorRow.title }
          : undefined,
      });

      const where = and(searchFilter, cursorFilter);

      const [total, rows] = await Promise.all([
        this.db
          .select({ count: sql<number>`cast(count(*) as integer)` })
          .from(bookTable)
          .where(searchFilter),
        this.db.query.book.findMany({
          where,
          orderBy: [asc(bookTable.title), asc(bookTable.id)],
          limit: input.limit + 1,
          with: { genre: true },
        }),
      ]);

      const { pageRows, nextCursor } = takeCursorPage(
        rows,
        input.limit,
        (row) => row.id
      );
      let parsedNextCursor: BookId | undefined;
      if (nextCursor) {
        const cursor = parseBookRowValue(toBookId(nextCursor));
        if (cursor.isError()) {
          return Result.Error(cursor.getError());
        }
        parsedNextCursor = cursor.get();
      }
      const items = toDomainList(pageRows);
      if (items.isError()) return Result.Error(items.getError());

      return Result.Ok({
        type: 'book_listed' as const,
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

  async findDuplicateCandidate(
    input: Parameters<BookRepository['findDuplicateCandidate']>[0]
  ) {
    try {
      const titleKey = normalizeBookDuplicateKeyPart(input.title);
      const authorKey = normalizeBookDuplicateKeyPart(input.author);
      const row = await this.db.query.book.findFirst({
        where: and(
          eq(sql<string>`lower(trim(${bookTable.title}))`, titleKey),
          eq(sql<string>`lower(trim(${bookTable.author}))`, authorKey)
        ),
        with: { genre: true },
      });

      if (!row) {
        return Result.Ok({
          type: 'book_duplicate_candidate_not_found' as const,
        });
      }
      const book = toDomain(row);
      if (book.isError()) return Result.Error(book.getError());

      return Result.Ok({
        type: 'book_duplicate_candidate_found' as const,
        book: book.get(),
      });
    } catch (error) {
      return Result.Error(mapDbError(error));
    }
  }

  async getById(id: BookId) {
    try {
      const book = await this.getByIdWithDb(this.db, id);
      if (book.isError()) return Result.Error(book.getError());
      const parsedBook = book.get();
      return Result.Ok(
        parsedBook
          ? { type: 'book_found' as const, book: parsedBook }
          : { type: 'book_not_found' as const }
      );
    } catch (error) {
      return Result.Error(mapDbError(error));
    }
  }

  async create(input: BookWriteInput) {
    try {
      const [created] = await this.db
        .insert(bookTable)
        .values({
          title: input.title,
          author: input.author,
          genreId: input.genreId,
          publisher: input.publisher ?? null,
          coverId: input.coverId ?? null,
        })
        .returning();

      if (!created) {
        return Result.Error(
          new AppError({
            code: 'BOOK_CREATE_EMPTY_RESULT',
            category: 'system',
            status: 500,
            message: 'Book create returned no row',
          })
        );
      }

      const book = toDomain(created);
      if (book.isError()) return Result.Error(book.getError());

      return Result.Ok({
        type: 'book_created' as const,
        book: book.get(),
      });
    } catch (error) {
      if (isBookDuplicateError(error)) {
        return Result.Ok({ type: 'book_duplicate' as const });
      }
      return Result.Error(mapDbError(error));
    }
  }

  async update(id: BookId, input: BookWriteInput) {
    try {
      const update = await this.runInSingleDbUnit((db) =>
        this.updateWithDb(db, id, input)
      );
      return Result.Ok(
        update
          ? {
              type: 'book_updated' as const,
              book: update.book,
              replacedCoverId: update.replacedCoverId,
            }
          : { type: 'book_not_found' as const }
      );
    } catch (error) {
      if (isBookDuplicateError(error)) {
        return Result.Ok({ type: 'book_duplicate' as const });
      }
      return Result.Error(mapDbError(error));
    }
  }

  async delete(id: BookId) {
    try {
      const [deleted] = await this.db
        .delete(bookTable)
        .where(eq(bookTable.id, id))
        .returning({ id: bookTable.id, coverId: bookTable.coverId });

      if (!deleted) return Result.Ok({ type: 'book_not_found' as const });

      let deletedCoverId: BookCoverObjectKey | null = null;
      if (deleted.coverId) {
        const parsedDeletedCoverId = parseBookRowValue(
          toBookCoverObjectKey(deleted.coverId)
        );
        if (parsedDeletedCoverId.isError()) {
          return Result.Error(parsedDeletedCoverId.getError());
        }
        deletedCoverId = parsedDeletedCoverId.get();
      }

      return Result.Ok({
        type: 'book_deleted' as const,
        deletedCoverId,
      });
    } catch (error) {
      return Result.Error(mapDbError(error));
    }
  }
}

export interface BookRepositoryDrizzleDependencies {
  db: DbLike;
}

export function createBookRepository(
  dependencies: BookRepositoryDrizzleDependencies
): BookRepository {
  return observeRepository(new BookRepositoryDrizzle(dependencies.db), 'book');
}
