import type { RequestScope } from '@/modules/auth';
import type { Logger } from '@/modules/kernel/application/ports/logger';
import type { PermissionChecker } from '@/modules/kernel/application/ports/permission-checker';
import { AppError } from '@/modules/kernel/domain/errors/app-error';
import type { BookId } from '@/modules/kernel/domain/ids';
import { toUserId } from '@/modules/kernel/domain/ids';

import type { BookRepository } from './ports/book-repository';
import type { Book, BookListPage, BookWriteInput } from '../domain/book';
import { normalizeBookWriteInput } from '../domain/book';

export type BookUseCaseDeps = {
  bookRepository: BookRepository;
  permissionChecker: PermissionChecker;
  logger: Logger;
};

export type UseCaseResult<T, TReason extends string> =
  | { ok: true; value: T }
  | { ok: false; reason: TReason };

export type ListBooksInput = {
  scope: RequestScope;
  cursor?: BookId;
  limit: number;
  searchTerm: string;
};

export async function listBooks(
  deps: BookUseCaseDeps,
  input: ListBooksInput
): Promise<UseCaseResult<BookListPage, 'forbidden'>> {
  const currentUserId = toUserId(input.scope.userId);
  const allowed = await deps.permissionChecker.hasPermission(currentUserId, {
    book: ['read'],
  });
  if (!allowed) return { ok: false, reason: 'forbidden' };

  deps.logger.info('book.list', { event: 'book.list' });
  const value = await deps.bookRepository.list({
    cursor: input.cursor,
    limit: input.limit,
    searchTerm: input.searchTerm,
  });
  return { ok: true, value };
}

export type GetBookInput = {
  scope: RequestScope;
  id: BookId;
};

export async function getBook(
  deps: BookUseCaseDeps,
  input: GetBookInput
): Promise<UseCaseResult<Book, 'forbidden' | 'not_found'>> {
  const currentUserId = toUserId(input.scope.userId);
  const allowed = await deps.permissionChecker.hasPermission(currentUserId, {
    book: ['read'],
  });
  if (!allowed) return { ok: false, reason: 'forbidden' };

  deps.logger.info('book.get', { event: 'book.get', bookId: input.id });
  const value = await deps.bookRepository.getById(input.id);
  if (!value) return { ok: false, reason: 'not_found' };
  return { ok: true, value };
}

export type CreateBookInput = {
  scope: RequestScope;
  book: BookWriteInput;
};

export async function createBook(
  deps: BookUseCaseDeps,
  input: CreateBookInput
): Promise<UseCaseResult<Book, 'forbidden' | 'duplicate'>> {
  const currentUserId = toUserId(input.scope.userId);
  const allowed = await deps.permissionChecker.hasPermission(currentUserId, {
    book: ['create'],
  });
  if (!allowed) return { ok: false, reason: 'forbidden' };

  try {
    deps.logger.info('book.create', { event: 'book.create' });
    const value = await deps.bookRepository.create(
      normalizeBookWriteInput(input.book)
    );
    return { ok: true, value };
  } catch (error) {
    if (error instanceof AppError && error.category === 'conflict') {
      return { ok: false, reason: 'duplicate' };
    }
    throw error;
  }
}

export type UpdateBookInput = {
  scope: RequestScope;
  id: BookId;
  book: BookWriteInput;
};

export async function updateBook(
  deps: BookUseCaseDeps,
  input: UpdateBookInput
): Promise<UseCaseResult<Book, 'forbidden' | 'not_found' | 'duplicate'>> {
  const currentUserId = toUserId(input.scope.userId);
  const allowed = await deps.permissionChecker.hasPermission(currentUserId, {
    book: ['update'],
  });
  if (!allowed) return { ok: false, reason: 'forbidden' };

  try {
    deps.logger.info('book.update', { event: 'book.update', bookId: input.id });
    const value = await deps.bookRepository.update(
      input.id,
      normalizeBookWriteInput(input.book)
    );
    if (!value) return { ok: false, reason: 'not_found' };
    return { ok: true, value };
  } catch (error) {
    if (error instanceof AppError && error.category === 'conflict') {
      return { ok: false, reason: 'duplicate' };
    }
    throw error;
  }
}

export type DeleteBookInput = {
  scope: RequestScope;
  id: BookId;
};

export async function deleteBook(
  deps: BookUseCaseDeps,
  input: DeleteBookInput
): Promise<UseCaseResult<void, 'forbidden' | 'not_found'>> {
  const currentUserId = toUserId(input.scope.userId);
  const allowed = await deps.permissionChecker.hasPermission(currentUserId, {
    book: ['delete'],
  });
  if (!allowed) return { ok: false, reason: 'forbidden' };

  deps.logger.info('book.delete', { event: 'book.delete', bookId: input.id });
  const deleted = await deps.bookRepository.delete(input.id);
  if (!deleted) return { ok: false, reason: 'not_found' };
  return { ok: true, value: undefined };
}

export function createBookUseCases(deps: BookUseCaseDeps) {
  return {
    list: (input: ListBooksInput) => listBooks(deps, input),
    get: (input: GetBookInput) => getBook(deps, input),
    create: (input: CreateBookInput) => createBook(deps, input),
    update: (input: UpdateBookInput) => updateBook(deps, input),
    delete: (input: DeleteBookInput) => deleteBook(deps, input),
  };
}

export type BookUseCases = ReturnType<typeof createBookUseCases>;
