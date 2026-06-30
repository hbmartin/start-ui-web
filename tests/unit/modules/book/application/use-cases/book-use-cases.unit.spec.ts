import { Result } from '@bloodyowl/boxed';
import { describe, expect, it, vi } from 'vitest';

import type { BookCoverStorage } from '@/modules/book/application/ports/book-cover-storage';
import type { BookRepository } from '@/modules/book/application/ports/book-repository';
import type { BookUseCaseDeps } from '@/modules/book/application/use-cases/types';
import type { Book } from '@/modules/book/domain/book';
import { createBookUseCases } from '@/modules/book/factory';
import { AppError, type PermissionChecker } from '@/modules/kernel';
import {
  toBookCoverObjectKey,
  toBookId,
  toGeneratedId,
  toGenreId,
  toUserId,
} from '@/modules/kernel';
import type { ApplicationResult } from '@/modules/kernel/testing';

const now = new Date('2026-01-01T00:00:00.000Z');
const book: Book = {
  id: toBookId('book-1'),
  title: 'Dune',
  author: 'Frank Herbert',
  genreId: toGenreId('genre-1'),
  genre: null,
  publisher: null,
  coverId: null,
  createdAt: now,
  updatedAt: now,
};

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
const idGenerator = {
  createId: () => toGeneratedId('generated-cover-id'),
};

const allowed: PermissionChecker = {
  hasPermission: async () => Result.Ok({ type: 'permission_granted' }),
};

const forbidden: PermissionChecker = {
  hasPermission: async () => Result.Ok({ type: 'permission_denied' }),
};

const scope = {
  userId: toUserId('user-1'),
  role: 'user',
} as const;

function makeRepo(overrides: Partial<BookRepository> = {}): BookRepository {
  return {
    list: async () =>
      Result.Ok({
        type: 'book_listed',
        page: { items: [book], total: 1 },
      }),
    findDuplicateCandidate: async () =>
      Result.Ok({ type: 'book_duplicate_candidate_not_found' }),
    getById: async () => Result.Ok({ type: 'book_found', book }),
    create: async () => Result.Ok({ type: 'book_created', book }),
    update: async () => Result.Ok({ type: 'book_updated', book }),
    delete: async () => Result.Ok({ type: 'book_deleted' }),
    ...overrides,
  };
}

function makeCoverStorage(
  overrides: Partial<BookCoverStorage> = {}
): BookCoverStorage {
  return {
    rememberUpload: async () =>
      Result.Ok({ type: 'cover_upload_remembered' as const }),
    consumeUpload: async () =>
      Result.Ok({ type: 'cover_upload_consumed' as const }),
    deleteObject: async () =>
      Result.Ok({ type: 'cover_object_deleted' as const }),
    ...overrides,
  };
}

function makeDeps(
  input: {
    bookRepository?: BookRepository;
    permissionChecker?: PermissionChecker;
    coverStorage?: BookCoverStorage;
    onTransactionRun?: () => void;
  } = {}
): BookUseCaseDeps {
  const bookRepository = input.bookRepository ?? makeRepo();

  return {
    bookRepository,
    transactionRunner: {
      run: (work) => {
        input.onTransactionRun?.();
        return work({ bookRepository });
      },
    },
    idGenerator,
    permissionChecker: input.permissionChecker ?? allowed,
    coverStorage: input.coverStorage ?? makeCoverStorage(),
    logger,
  };
}

function getOk<TOutcome extends { type: string }>(
  result: ApplicationResult<TOutcome>
) {
  if (result.isError()) throw result.getError();
  return result.get();
}

describe('book use cases', () => {
  it('lists books and returns forbidden when permission is missing', async () => {
    const listed = await createBookUseCases(makeDeps()).list({
      currentUserId: scope.userId,
      limit: 20,
      searchTerm: '',
    });

    expect(getOk(listed)).toMatchObject({
      type: 'book_listed',
      page: { total: 1 },
    });

    const denied = await createBookUseCases(
      makeDeps({ permissionChecker: forbidden })
    ).list({
      currentUserId: scope.userId,
      limit: 20,
      searchTerm: '',
    });

    expect(getOk(denied)).toEqual({ type: 'book_forbidden' });
  });

  it('gets a book or returns not_found', async () => {
    const missing = await createBookUseCases(
      makeDeps({
        bookRepository: makeRepo({
          getById: async () => Result.Ok({ type: 'book_not_found' }),
        }),
      })
    ).get({ currentUserId: scope.userId, id: toBookId('missing') });

    expect(getOk(missing)).toEqual({ type: 'book_not_found' });
  });

  const emptyListPage = {
    type: 'book_listed' as const,
    page: { items: [], total: 0 },
  };

  it('creates when no existing book matches', async () => {
    const repo = makeRepo({
      findDuplicateCandidate: async () =>
        Result.Ok({ type: 'book_duplicate_candidate_not_found' }),
    });

    const created = await createBookUseCases(
      makeDeps({ bookRepository: repo })
    ).create({
      currentUserId: scope.userId,
      book,
    });

    expect(getOk(created)).toEqual({ type: 'book_created', book });
  });

  it('maps duplicate conflicts surfaced by the repository', async () => {
    const duplicateRepo = makeRepo({
      create: async () => Result.Ok({ type: 'book_duplicate' }),
      findDuplicateCandidate: async () =>
        Result.Ok({ type: 'book_duplicate_candidate_not_found' }),
    });

    const duplicate = await createBookUseCases(
      makeDeps({ bookRepository: duplicateRepo })
    ).create({
      currentUserId: scope.userId,
      book,
    });

    expect(getOk(duplicate)).toEqual({ type: 'book_duplicate' });
  });

  it('rejects case-insensitive duplicates in the pre-check without inserting', async () => {
    const create = vi.fn(async () =>
      Result.Ok({ type: 'book_created' as const, book })
    );
    const list = vi.fn(async () => Result.Ok(emptyListPage));
    const repo = makeRepo({
      create,
      list,
      findDuplicateCandidate: async () =>
        Result.Ok({ type: 'book_duplicate_candidate_found', book }),
    });

    const duplicate = await createBookUseCases(
      makeDeps({ bookRepository: repo })
    ).create({
      currentUserId: scope.userId,
      book: { ...book, title: '  dune ', author: 'FRANK HERBERT' },
    });

    expect(getOk(duplicate)).toEqual({ type: 'book_duplicate' });
    expect(create).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it('updates and deletes with not_found branches', async () => {
    let transactionRuns = 0;
    const useCases = createBookUseCases(
      makeDeps({
        bookRepository: makeRepo({
          update: async () => Result.Ok({ type: 'book_not_found' }),
          delete: async () => Result.Ok({ type: 'book_not_found' }),
        }),
        onTransactionRun: () => {
          transactionRuns += 1;
        },
      })
    );

    const updated = await useCases.update({
      currentUserId: scope.userId,
      id: toBookId('missing'),
      book,
    });

    expect(getOk(updated)).toEqual({ type: 'book_not_found' });
    expect(transactionRuns).toBe(1);
    const deleted = await useCases.delete({
      currentUserId: scope.userId,
      id: toBookId('missing'),
    });

    expect(getOk(deleted)).toEqual({ type: 'book_not_found' });
    expect(transactionRuns).toBe(1);
  });

  it('uses the transaction context repository for updates', async () => {
    const outsideRepository = makeRepo({
      update: async () => {
        throw new Error('outside repository should not update');
      },
    });
    const transactionRepository = makeRepo({
      update: async () => Result.Ok({ type: 'book_updated', book }),
    });
    const useCases = createBookUseCases({
      ...makeDeps({ bookRepository: outsideRepository }),
      transactionRunner: {
        run: (work) => work({ bookRepository: transactionRepository }),
      },
    });

    const updated = await useCases.update({
      currentUserId: scope.userId,
      id: toBookId('book-1'),
      book,
    });

    expect(getOk(updated)).toEqual({ type: 'book_updated', book });
  });

  it('prepares cover uploads through permission and object-key policy', async () => {
    const prepared = await createBookUseCases(makeDeps()).prepareCoverUpload({
      currentUserId: scope.userId,
      fileType: 'image/webp',
    });
    expect(getOk(prepared)).toEqual({
      type: 'book_cover_upload_prepared',
      upload: { objectKey: 'books/generated-cover-id.webp' },
    });

    const denied = await createBookUseCases(
      makeDeps({ permissionChecker: forbidden })
    ).prepareCoverUpload({
      currentUserId: scope.userId,
      fileType: 'image/webp',
    });
    expect(getOk(denied)).toEqual({ type: 'book_cover_upload_forbidden' });

    const invalid = await createBookUseCases(makeDeps()).prepareCoverUpload({
      currentUserId: scope.userId,
      fileType: 'text/plain',
    });
    expect(getOk(invalid)).toEqual({
      type: 'book_cover_upload_invalid_file_type',
    });
  });

  describe('cover upload-key binding and object reclamation', () => {
    const coverKey = toBookCoverObjectKey('books/generated-cover-id.webp');
    const bookWithCover = { ...book, coverId: coverKey };

    it('remembers the issued key against the caller when preparing an upload', async () => {
      const rememberUpload = vi.fn(async () =>
        Result.Ok({ type: 'cover_upload_remembered' as const })
      );

      await createBookUseCases(
        makeDeps({ coverStorage: makeCoverStorage({ rememberUpload }) })
      ).prepareCoverUpload({
        currentUserId: scope.userId,
        fileType: 'image/webp',
      });

      expect(rememberUpload).toHaveBeenCalledWith(coverKey, scope.userId);
    });

    it('consumes the binding on create and rejects a cover not issued to the caller', async () => {
      const consumeUpload = vi.fn(async () =>
        Result.Ok({ type: 'cover_upload_unowned' as const })
      );
      const create = vi.fn(async () =>
        Result.Ok({ type: 'book_created' as const, book: bookWithCover })
      );

      const result = await createBookUseCases(
        makeDeps({
          bookRepository: makeRepo({ create }),
          coverStorage: makeCoverStorage({ consumeUpload }),
        })
      ).create({
        currentUserId: scope.userId,
        book: { ...book, coverId: coverKey },
      });

      expect(getOk(result)).toEqual({ type: 'book_cover_unowned' });
      expect(consumeUpload).toHaveBeenCalledWith(coverKey, scope.userId);
      expect(create).not.toHaveBeenCalled();
    });

    it('does not consume a binding on create when no cover is attached', async () => {
      const consumeUpload = vi.fn(async () =>
        Result.Ok({ type: 'cover_upload_consumed' as const })
      );

      await createBookUseCases(
        makeDeps({ coverStorage: makeCoverStorage({ consumeUpload }) })
      ).create({ currentUserId: scope.userId, book });

      expect(consumeUpload).not.toHaveBeenCalled();
    });

    it('on update consumes the binding and reclaims the previous cover only when the cover changes', async () => {
      const consumeUpload = vi.fn(async () =>
        Result.Ok({ type: 'cover_upload_consumed' as const })
      );
      const deleteObject = vi.fn(async () =>
        Result.Ok({ type: 'cover_object_deleted' as const })
      );
      const previousKey = toBookCoverObjectKey('books/old-cover.png');
      const newKey = toBookCoverObjectKey('books/new-cover.webp');

      const result = await createBookUseCases(
        makeDeps({
          bookRepository: makeRepo({
            getById: async () =>
              Result.Ok({
                type: 'book_found',
                book: { ...book, coverId: previousKey },
              }),
            update: async () =>
              Result.Ok({
                type: 'book_updated',
                book: { ...book, coverId: newKey },
              }),
          }),
          coverStorage: makeCoverStorage({ consumeUpload, deleteObject }),
        })
      ).update({
        currentUserId: scope.userId,
        id: book.id,
        book: { ...book, coverId: newKey },
      });

      expect(getOk(result)).toMatchObject({ type: 'book_updated' });
      expect(consumeUpload).toHaveBeenCalledWith(newKey, scope.userId);
      expect(deleteObject).toHaveBeenCalledWith(previousKey);
    });

    it('on update with an unchanged cover neither consumes a binding nor deletes the object', async () => {
      const consumeUpload = vi.fn(async () =>
        Result.Ok({ type: 'cover_upload_consumed' as const })
      );
      const deleteObject = vi.fn(async () =>
        Result.Ok({ type: 'cover_object_deleted' as const })
      );

      await createBookUseCases(
        makeDeps({
          bookRepository: makeRepo({
            getById: async () =>
              Result.Ok({ type: 'book_found', book: bookWithCover }),
            update: async () =>
              Result.Ok({ type: 'book_updated', book: bookWithCover }),
          }),
          coverStorage: makeCoverStorage({ consumeUpload, deleteObject }),
        })
      ).update({
        currentUserId: scope.userId,
        id: book.id,
        book: { ...book, coverId: coverKey },
      });

      expect(consumeUpload).not.toHaveBeenCalled();
      expect(deleteObject).not.toHaveBeenCalled();
    });

    it('reclaims the cover object when a book is deleted', async () => {
      const deleteObject = vi.fn(async () =>
        Result.Ok({ type: 'cover_object_deleted' as const })
      );

      await createBookUseCases(
        makeDeps({
          bookRepository: makeRepo({
            getById: async () =>
              Result.Ok({ type: 'book_found', book: bookWithCover }),
            delete: async () => Result.Ok({ type: 'book_deleted' }),
          }),
          coverStorage: makeCoverStorage({ deleteObject }),
        })
      ).delete({ currentUserId: scope.userId, id: book.id });

      expect(deleteObject).toHaveBeenCalledWith(coverKey);
    });

    it('does not fail the delete when cover-object reclamation fails (best-effort)', async () => {
      const deleteObject = vi.fn(async () =>
        Result.Error(
          new AppError({
            code: 'OBJECT_STORAGE_DELETE_FAILED',
            category: 'system',
            status: 502,
          })
        )
      );

      const result = await createBookUseCases(
        makeDeps({
          bookRepository: makeRepo({
            getById: async () =>
              Result.Ok({ type: 'book_found', book: bookWithCover }),
            delete: async () => Result.Ok({ type: 'book_deleted' }),
          }),
          coverStorage: makeCoverStorage({ deleteObject }),
        })
      ).delete({ currentUserId: scope.userId, id: book.id });

      expect(getOk(result)).toEqual({ type: 'book_deleted' });
      expect(deleteObject).toHaveBeenCalled();
    });
  });
});
