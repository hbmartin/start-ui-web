import type {
  BookCoverObjectKey,
  GeneratedId,
} from '@/modules/kernel/domain/ids';
import { toBookCoverObjectKey } from '@/modules/kernel/domain/ids';

import type { BookWriteInput } from './book';

export const bookCoverAcceptedFileTypes = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export const bookCoverMaxFileSizeBytes = 1024 * 1024 * 10;

/**
 * Cache-Control pinned onto the presigned cover upload. Cover object keys are
 * unique per upload (`books/<generatedId>.<ext>`) and never overwritten in
 * place, so an immutable long-lived cache is safe. Pinning this server-side
 * also prevents the client from choosing an arbitrary Cache-Control value on
 * the presigned PUT. See `docs/security-upload.md`.
 */
export const bookCoverCacheControl = 'public, max-age=31536000, immutable';

type BookCoverAcceptedFileType = (typeof bookCoverAcceptedFileTypes)[number];

const bookCoverFileExtensionsByType: Record<BookCoverAcceptedFileType, string> =
  {
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };

const isBookCoverAcceptedFileType = (
  fileType: string
): fileType is BookCoverAcceptedFileType =>
  Object.hasOwn(bookCoverFileExtensionsByType, fileType);

export const getBookCoverFileExtension = (fileType: string) =>
  isBookCoverAcceptedFileType(fileType)
    ? bookCoverFileExtensionsByType[fileType]
    : null;

export const createBookCoverObjectKey = (input: {
  fileId: GeneratedId;
  fileType: string;
}): BookCoverObjectKey | null => {
  const extension = getBookCoverFileExtension(input.fileType);
  if (!extension) return null;
  return toBookCoverObjectKey(`books/${input.fileId}.${extension}`);
};

export const normalizeBookDuplicateKeyPart = (value: string) =>
  value.trim().toLowerCase();

export function isDuplicateBookCandidate(
  left: Pick<BookWriteInput, 'title' | 'author'>,
  right: Pick<BookWriteInput, 'title' | 'author'>
) {
  return (
    normalizeBookDuplicateKeyPart(left.title) ===
      normalizeBookDuplicateKeyPart(right.title) &&
    normalizeBookDuplicateKeyPart(left.author) ===
      normalizeBookDuplicateKeyPart(right.author)
  );
}
