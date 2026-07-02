import { makeBookRow, makeGenreRow } from '@tests/server/db-fixtures';
import { createPgliteTestDatabase } from '@tests/server/pglite';
import {
  testBookAuthor,
  testBookTitle,
  testPublisherName,
} from '@tests/support/branded-values';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createBookRepository } from '@/modules/book/infrastructure/drizzle/book-repository-drizzle';
import { toBookId, toGenreId } from '@/modules/kernel/domain/ids';
import {
  book as bookTable,
  genre as genreTable,
} from '@/modules/kernel/infrastructure/db/schema';
import type { ApplicationResult } from '@/modules/kernel/testing';
import { unwrapParseResult } from '@/modules/kernel/testing';

function getOk<TOutcome extends { type: string }>(
  result: ApplicationResult<TOutcome>
) {
  if (result.isError()) throw result.getError();
  return result.get();
}

function getError<TOutcome extends { type: string }>(
  result: ApplicationResult<TOutcome>
) {
  if (result.isOk()) {
    throw new Error(`Expected Result.Error, got ${result.get().type}`);
  }
  return result.getError();
}

describe('BookRepositoryDrizzle integration', () => {
  let database: Awaited<ReturnType<typeof createPgliteTestDatabase>>;

  beforeAll(async () => {
    database = await createPgliteTestDatabase();
  });

  beforeEach(async () => {
    await database.truncate();
  });

  afterAll(async () => {
    await database?.close();
  });

  it('covers search pagination and escaped LIKE behavior with PGlite', async () => {
    const repository = createBookRepository({ db: database.db });
    await database.db
      .insert(genreTable)
      .values([
        makeGenreRow({ id: 'genre-1', name: 'One', color: '#111111' }),
        makeGenreRow({ id: 'genre-2', name: 'Two', color: '#222222' }),
      ]);
    await database.db.insert(bookTable).values([
      makeBookRow({
        id: 'book-a',
        title: testBookTitle('Alpha_ Old'),
        author: testBookAuthor('Author A Old'),
        genreId: 'genre-1',
        publisher: testPublisherName('Old Publisher'),
        coverId: 'old-cover-id',
      }),
      makeBookRow({
        id: 'book-b',
        title: testBookTitle('AlphaX'),
        author: testBookAuthor('Author B'),
        genreId: 'genre-1',
      }),
      makeBookRow({
        id: 'book-c',
        title: testBookTitle('Beta'),
        author: testBookAuthor('Author C'),
        genreId: 'genre-1',
      }),
      makeBookRow({
        id: 'book-d',
        title: testBookTitle('Gamma'),
        author: testBookAuthor('Author D'),
        genreId: 'genre-1',
      }),
    ]);

    const firstPage = getOk(
      await repository.list({ limit: 2, searchTerm: '' })
    ).page;
    expect(firstPage.items.map((book) => book.id)).toEqual([
      'book-b',
      'book-a',
    ]);
    expect(firstPage.nextCursor).toBe('book-a');

    const secondPage = getOk(
      await repository.list({
        cursor: firstPage.nextCursor,
        limit: 2,
        searchTerm: '',
      })
    ).page;
    expect(secondPage.items.map((book) => book.id)).toEqual([
      'book-c',
      'book-d',
    ]);

    const escapedSearch = getOk(
      await repository.list({
        limit: 10,
        searchTerm: 'Alpha_',
      })
    ).page;
    expect(escapedSearch.items.map((book) => book.id)).toEqual(['book-a']);

    const updated = getOk(
      await repository.update(unwrapParseResult(toBookId('book-a')), {
        title: testBookTitle('Alpha_ New'),
        author: testBookAuthor('Author A New'),
        genreId: unwrapParseResult(toGenreId('genre-2')),
        publisher: null,
        coverId: null,
      })
    );
    expect(updated.type).toBe('book_updated');
    expect(updated).toMatchObject({
      book: { genre: { id: 'genre-2', name: 'Two' } },
      replacedCoverId: 'old-cover-id',
    });

    const persisted = await database.db.query.book.findFirst({
      where: eq(bookTable.id, 'book-a'),
      with: { genre: true },
    });
    expect(persisted).toMatchObject({
      title: testBookTitle('Alpha_ New'),
      author: testBookAuthor('Author A New'),
      publisher: null,
      coverId: null,
      genre: { id: 'genre-2', name: 'Two' },
    });
  });

  it('finds duplicate candidates by normalized title and author', async () => {
    const repository = createBookRepository({ db: database.db });
    await database.db
      .insert(genreTable)
      .values(makeGenreRow({ id: 'genre-1', name: 'One' }));
    await database.db.insert(bookTable).values(
      makeBookRow({
        id: 'book-a',
        title: testBookTitle('Dune'),
        author: testBookAuthor('Frank Herbert'),
        genreId: 'genre-1',
      })
    );

    const duplicate = getOk(
      await repository.findDuplicateCandidate({
        title: testBookTitle('  dune '),
        author: testBookAuthor('FRANK HERBERT'),
      })
    );
    expect(duplicate).toMatchObject({
      type: 'book_duplicate_candidate_found',
      book: { id: 'book-a' },
    });

    const missing = getOk(
      await repository.findDuplicateCandidate({
        title: testBookTitle('Dune'),
        author: testBookAuthor('Someone Else'),
      })
    );
    expect(missing).toEqual({ type: 'book_duplicate_candidate_not_found' });
  });

  it('maps invalid persisted book rows to a system row error', async () => {
    const repository = createBookRepository({ db: database.db });
    await database.db.insert(genreTable).values(
      makeGenreRow({
        id: 'genre-1',
        name: 'One',
        color: 'not-a-color',
      })
    );
    await database.db.insert(bookTable).values(
      makeBookRow({
        id: 'book-1',
        title: testBookTitle('Dune'),
        author: testBookAuthor('Frank Herbert'),
        genreId: 'genre-1',
      })
    );

    expect(
      getError(await repository.getById(unwrapParseResult(toBookId('book-1'))))
    ).toMatchObject({
      code: 'BOOK_ROW_INVALID',
      category: 'system',
      status: 500,
    });
  });

  it('rejects invalid non-null optional book row values', async () => {
    const repository = createBookRepository({ db: database.db });
    await database.db
      .insert(genreTable)
      .values(makeGenreRow({ id: 'genre-1', name: 'One' }));
    await database.db.insert(bookTable).values(
      makeBookRow({
        id: 'book-1',
        title: testBookTitle('Dune'),
        author: testBookAuthor('Frank Herbert'),
        genreId: 'genre-1',
        publisher: '',
      })
    );

    expect(
      getError(await repository.getById(unwrapParseResult(toBookId('book-1'))))
    ).toMatchObject({
      code: 'BOOK_ROW_INVALID',
      category: 'system',
      status: 500,
    });
  });
});
