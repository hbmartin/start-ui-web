import { Result } from '@bloodyowl/boxed';

import type { UserId } from '@/modules/kernel/domain/ids';

import type { BookCreateOutcome, BookResult, BookUseCaseDeps } from './types';
import type { BookWriteInput } from '../../domain/book';
import { normalizeBookWriteInput } from '../../domain/book';
import { isDuplicateBookCandidate } from '../../domain/book-policy';

export type CreateBookInput = {
  currentUserId: UserId;
  book: BookWriteInput;
};

export async function createBook(
  deps: BookUseCaseDeps,
  input: CreateBookInput
): Promise<BookResult<BookCreateOutcome>> {
  const allowed = await deps.permissionChecker.hasPermission(
    input.currentUserId,
    { book: ['create'] }
  );
  if (allowed.isError()) return Result.Error(allowed.getError());
  if (allowed.get().type === 'permission_denied') {
    return Result.Ok({ type: 'book_forbidden' });
  }

  const book = normalizeBookWriteInput(input.book);

  const duplicateCandidate = await deps.bookRepository.findDuplicateCandidate({
    title: book.title,
    author: book.author,
  });
  if (duplicateCandidate.isError()) {
    return Result.Error(duplicateCandidate.getError());
  }

  const candidate = duplicateCandidate.get();
  if (
    candidate.type === 'book_duplicate_candidate_found' &&
    isDuplicateBookCandidate(candidate.book, book)
  ) {
    return Result.Ok({ type: 'book_duplicate' });
  }

  let consumedCoverId = book.coverId;
  // A submitted cover must be a key this caller was issued (and not yet used).
  if (book.coverId) {
    const consumed = await deps.coverStorage.consumeUpload(
      book.coverId,
      input.currentUserId
    );
    if (consumed.isError()) return Result.Error(consumed.getError());
    if (consumed.get().type === 'cover_upload_unowned') {
      return Result.Ok({ type: 'book_cover_unowned' });
    }
  } else {
    consumedCoverId = null;
  }

  deps.logger.info({ event: 'book.create' });
  const result = await deps.bookRepository.create(book);
  if (result.isError()) return Result.Error(result.getError());
  const created = result.get();

  if (created.type !== 'book_created' && consumedCoverId) {
    const removed = await deps.coverStorage.deleteObject(consumedCoverId);
    if (removed.isError()) {
      deps.logger.warn({
        event: 'book.cover_object.delete_failed',
        details: { objectKey: consumedCoverId },
      });
    }
  }

  return Result.Ok(created);
}
