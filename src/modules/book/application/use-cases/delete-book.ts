import { Result } from '@bloodyowl/boxed';

import type { BookId, UserId } from '@/modules/kernel/domain/ids';

import type { BookDeleteOutcome, BookResult, BookUseCaseDeps } from './types';

export type DeleteBookInput = {
  currentUserId: UserId;
  id: BookId;
};

export async function deleteBook(
  deps: BookUseCaseDeps,
  input: DeleteBookInput
): Promise<BookResult<BookDeleteOutcome>> {
  const allowed = await deps.permissionChecker.hasPermission(
    input.currentUserId,
    { book: ['delete'] }
  );
  if (allowed.isError()) return Result.Error(allowed.getError());
  if (allowed.get().type === 'permission_denied') {
    return Result.Ok({ type: 'book_forbidden' });
  }

  // Resolve the cover before deletion so the stored object can be reclaimed.
  const currentResult = await deps.bookRepository.getById(input.id);
  if (currentResult.isError()) return Result.Error(currentResult.getError());
  const currentOutcome = currentResult.get();
  const coverId =
    currentOutcome.type === 'book_found' ? currentOutcome.book.coverId : null;

  deps.logger.info({
    event: 'book.delete',
    details: { bookId: input.id },
  });
  const result = await deps.bookRepository.delete(input.id);
  if (result.isError()) return Result.Error(result.getError());
  const deleted = result.get();

  // Reclaim the cover object. Best-effort: a delete failure is logged but does
  // not fail the book deletion.
  if (deleted.type === 'book_deleted' && coverId) {
    const removed = await deps.coverStorage.deleteObject(coverId);
    if (removed.isError()) {
      deps.logger.warn({
        event: 'book.cover_object.delete_failed',
        details: { bookId: input.id, objectKey: coverId },
      });
    }
  }

  return Result.Ok(deleted);
}
