import { Result } from '@bloodyowl/boxed';

import type { UserId } from '@/modules/kernel/domain/ids';

import type {
  BookCoverUploadOutcome,
  BookResult,
  BookUseCaseDeps,
} from './types';
import { createBookCoverObjectKey } from '../../domain/book-policy';

export type PrepareBookCoverUploadInput = {
  currentUserId: UserId;
  fileType: string;
};

export async function prepareBookCoverUpload(
  deps: BookUseCaseDeps,
  input: PrepareBookCoverUploadInput
): Promise<BookResult<BookCoverUploadOutcome>> {
  const allowed = await deps.permissionChecker.hasPermission(
    input.currentUserId,
    { book: ['create', 'update'] }
  );
  if (allowed.isError()) return Result.Error(allowed.getError());
  if (allowed.get().type === 'permission_denied') {
    return Result.Ok({ type: 'book_cover_upload_forbidden' });
  }

  const fileId = deps.idGenerator.createId();
  if (fileId.isError()) return Result.Error(fileId.getError());

  const objectKey = createBookCoverObjectKey({
    fileId: fileId.get(),
    fileType: input.fileType,
  });
  if (objectKey.isError()) return Result.Error(objectKey.getError());
  const parsedObjectKey = objectKey.get();
  if (!parsedObjectKey) {
    return Result.Ok({ type: 'book_cover_upload_invalid_file_type' });
  }

  // Bind the issued key to this caller so only they can later attach it to a
  // book; the binding is verified and consumed on write
  // (`coverStorage.consumeUpload`). (CWE-472 / CWE-639.)
  const remembered = await deps.coverStorage.rememberUpload(
    parsedObjectKey,
    input.currentUserId
  );
  if (remembered.isError()) return Result.Error(remembered.getError());

  deps.logger.info({
    event: 'book.cover_upload.prepare',
    details: {
      fileType: input.fileType,
    },
  });
  return Result.Ok({
    type: 'book_cover_upload_prepared',
    upload: { objectKey: parsedObjectKey },
  });
}
