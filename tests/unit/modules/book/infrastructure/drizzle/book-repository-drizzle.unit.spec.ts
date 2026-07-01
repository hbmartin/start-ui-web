import { describe, expect, it } from 'vitest';

import type { BookRepository } from '@/modules/book';
import { BookRepositoryDrizzle } from '@/modules/book/testing';
import { toBookId, toGenreId } from '@/modules/kernel';

function getUpdateError(result: Awaited<ReturnType<BookRepository['update']>>) {
  if (result.isOk()) {
    throw new Error(`Expected Result.Error, got ${result.get().type}`);
  }
  return result.getError();
}

describe('BookRepositoryDrizzle', () => {
  it('fails closed when a root database cannot run the cover replacement transaction', async () => {
    const repository: BookRepository = new BookRepositoryDrizzle({
      $driver: 'node-pg',
      $transactionCapable: true,
    } as never);

    const result = await repository.update(toBookId('book-1'), {
      title: 'Dune',
      author: 'Frank Herbert',
      genreId: toGenreId('genre-1'),
      publisher: null,
      coverId: null,
    });

    expect(result.isError()).toBe(true);
    expect(getUpdateError(result)).toMatchObject({
      code: 'CONFIGURATION_ERROR',
      message:
        'Book cover replacement requires an interactive database transaction.',
    });
  });
});
