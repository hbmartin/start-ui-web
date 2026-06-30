import { Result } from '@bloodyowl/boxed';

import { AppError } from '@/modules/kernel/domain/errors/app-error';
import type { BookId, UserId } from '@/modules/kernel/domain/ids';

import type { BookResult, BookUpdateOutcome, BookUseCaseDeps } from './types';
import type { BookWriteInput } from '../../domain/book';
import { normalizeBookWriteInput } from '../../domain/book';

export type UpdateBookInput = {
  currentUserId: UserId;
  id: BookId;
  book: BookWriteInput;
};

export async function updateBook(
  deps: BookUseCaseDeps,
  input: UpdateBookInput
): Promise<BookResult<BookUpdateOutcome>> {
  const allowed = await deps.permissionChecker.hasPermission(
    input.currentUserId,
    { book: ['update'] }
  );
  if (allowed.isError()) return Result.Error(allowed.getError());
  if (allowed.get().type === 'permission_denied') {
    return Result.Ok({ type: 'book_forbidden' });
  }

  const book = normalizeBookWriteInput(input.book);

  // Resolve the existing cover so we can (a) require an ownership-checked upload
  // token only when the cover actually changes, and (b) reclaim the superseded
  // object after the write.
  const currentResult = await deps.bookRepository.getById(input.id);
  if (currentResult.isError()) return Result.Error(currentResult.getError());
  const currentOutcome = currentResult.get();
  if (currentOutcome.type === 'book_not_found') {
    return Result.Ok({ type: 'book_not_found' });
  }
  const previousCoverId = currentOutcome.book.coverId;
  const coverChanged = book.coverId !== previousCoverId;

  if (coverChanged && book.coverId) {
    const consumed = await deps.coverStorage.consumeUpload(
      book.coverId,
      input.currentUserId
    );
    if (consumed.isError()) return Result.Error(consumed.getError());
    if (consumed.get().type === 'cover_upload_unowned') {
      return Result.Ok({ type: 'book_cover_unowned' });
    }
  }

  try {
    deps.logger.info({
      event: 'book.update',
      details: { bookId: input.id },
    });
    const result = await deps.transactionRunner.run(({ bookRepository }) =>
      bookRepository.update(input.id, book)
    );
    if (result.isError()) return Result.Error(result.getError());
    const updated = result.get();

    // Reclaim the superseded cover object. Best-effort: a delete failure is
    // logged but does not fail the update — the book has already changed.
    if (updated.type === 'book_updated' && coverChanged && previousCoverId) {
      const deleted = await deps.coverStorage.deleteObject(previousCoverId);
      if (deleted.isError()) {
        deps.logger.warn({
          event: 'book.cover_object.delete_failed',
          details: { bookId: input.id, objectKey: previousCoverId },
        });
      }
    }

    return Result.Ok(updated);
  } catch (error) {
    return Result.Error(
      error instanceof AppError
        ? error
        : new AppError({
            code: 'BOOK_TRANSACTION_ERROR',
            category: 'system',
            status: 500,
            message: 'Book transaction error',
            cause: error,
          })
    );
  }
}
