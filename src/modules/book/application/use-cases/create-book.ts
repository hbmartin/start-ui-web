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

/**
 * Best-effort scan width for the duplicate plausibility pre-check. The database
 * `book_title_author_key` unique constraint is the hard backstop for exact
 * matches; this pre-check additionally catches case-insensitive /
 * whitespace-variant duplicates ("Dune" vs "dune") that an exact-match
 * constraint lets through.
 */
const DUPLICATE_SCAN_LIMIT = 100;

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

  const candidates = await deps.bookRepository.list({
    limit: DUPLICATE_SCAN_LIMIT,
    searchTerm: book.title,
  });
  if (candidates.isError()) return Result.Error(candidates.getError());
  if (
    candidates
      .get()
      .page.items.some((candidate) => isDuplicateBookCandidate(candidate, book))
  ) {
    return Result.Ok({ type: 'book_duplicate' });
  }

  deps.logger.info({ event: 'book.create' });
  const result = await deps.bookRepository.create(book);
  if (result.isError()) return Result.Error(result.getError());
  return Result.Ok(result.get());
}
