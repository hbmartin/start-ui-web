import type {
  ApplicationResult,
  BookCoverObjectKey,
  UserId,
} from '@/modules/kernel';

export type CoverUploadRememberOutcome = { type: 'cover_upload_remembered' };

export type CoverUploadConsumeOutcome =
  | { type: 'cover_upload_consumed' }
  | { type: 'cover_upload_unowned' };

export type CoverObjectDeleteOutcome = { type: 'cover_object_deleted' };

/**
 * Binds a server-issued cover-upload key to the user it was issued to, and
 * reclaims stored cover objects.
 *
 * - `rememberUpload` records `(objectKey -> userId)` when the presign is issued.
 * - `consumeUpload` verifies and one-shot consumes that binding when a book
 *   write persists the `coverId`, so a caller cannot attach an arbitrary or
 *   another user's object key to a book (CWE-472 / CWE-639).
 * - `deleteObject` reclaims a superseded / removed cover so orphaned objects do
 *   not accumulate (CWE-770).
 *
 * The binding store must be durable across instances (Upstash) on
 * multi-instance deployments — see `docs/security-upload.md`. With the in-memory
 * default a presign and its later save must land on the same instance.
 */
export interface BookCoverStorage {
  rememberUpload(
    objectKey: BookCoverObjectKey,
    userId: UserId
  ): Promise<ApplicationResult<CoverUploadRememberOutcome>>;
  consumeUpload(
    objectKey: BookCoverObjectKey,
    userId: UserId
  ): Promise<ApplicationResult<CoverUploadConsumeOutcome>>;
  deleteObject(
    objectKey: BookCoverObjectKey
  ): Promise<ApplicationResult<CoverObjectDeleteOutcome>>;
}
