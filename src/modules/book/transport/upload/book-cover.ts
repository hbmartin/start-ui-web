import { Result } from '@bloodyowl/boxed';
import { match, P } from 'ts-pattern';

import type { AuthSession } from '@/modules/auth';
import type { BookUseCases } from '@/modules/book';
import {
  type Logger,
  type ObjectUploadPrepared,
  type ObjectUploadRouteDefinition,
  UploadRejectedError,
} from '@/modules/kernel';
import type { TelemetryAdapter } from '@/platform/telemetry';

import {
  bookCoverAcceptedFileTypes,
  bookCoverCacheControl,
  bookCoverMaxFileSizeBytes,
} from '../../domain/book-policy';

export type BookCoverUploadDeps = {
  getCurrentSession: (headers: Headers) => Promise<AuthSession | null>;
  getUseCases: () => Pick<BookUseCases, 'prepareCoverUpload'>;
  telemetry: Pick<TelemetryAdapter, 'startSpan'>;
  logger?: Pick<Logger, 'warn'>;
};

type BookCoverUploadErrorKey =
  | 'NOT_AUTHENTICATED'
  | 'UNAUTHORIZED'
  | 'invalid_file_type';

const uploadErrorTranslationKeys = {
  NOT_AUTHENTICATED: 'book:manager.uploadErrors.NOT_AUTHENTICATED',
  UNAUTHORIZED: 'book:manager.uploadErrors.UNAUTHORIZED',
  invalid_file_type: 'book:manager.uploadErrors.invalid_file_type',
} as const satisfies Record<BookCoverUploadErrorKey, string>;

export const bookCoverUploadConstraints = {
  fileTypes: [...bookCoverAcceptedFileTypes] as string[],
  maxFileSize: bookCoverMaxFileSizeBytes,
} as const;

/**
 * Rejects the upload by throwing a provider-neutral {@link UploadRejectedError}
 * carrying a stable translation KEY (never a translated string). The storage
 * adapter maps it to its provider's rejection mechanism, and the client
 * translates the key at render time.
 */
const rejectUpload = (
  deps: Pick<BookCoverUploadDeps, 'logger'>,
  key: BookCoverUploadErrorKey,
  fileType: string
): never => {
  deps.logger?.warn({
    details: {
      fileType,
      reason: key,
    },
    event: 'security.upload_rejected',
  });
  throw new UploadRejectedError(uploadErrorTranslationKeys[key]);
};

export const handleBookCoverBeforeUpload = async (
  deps: BookCoverUploadDeps,
  input: { headers: Headers; fileType: string }
): Promise<ObjectUploadPrepared> =>
  deps.telemetry.startSpan(
    {
      attributes: {
        'file.mime_type': input.fileType,
        'operation.name': 'book.coverUpload.beforeUpload',
        'operation.type': 'upload_hook',
        'upload.route': 'bookCover',
      },
      name: 'book.coverUpload.beforeUpload',
      op: 'upload.before_upload',
    },
    async () => {
      const session = await deps.getCurrentSession(input.headers);
      const user =
        session?.user ??
        rejectUpload(deps, 'NOT_AUTHENTICATED', input.fileType);

      const prepared = await deps.getUseCases().prepareCoverUpload({
        currentUserId: user.id,
        fileType: input.fileType,
      });

      return match(prepared)
        .with(Result.P.Error(P.select()), (error) => {
          throw error;
        })
        .with(
          Result.P.Ok({
            type: 'book_cover_upload_prepared',
            upload: P.select(),
          }),
          // The adapter pins the presigned PUT Content-Type to the validated
          // image MIME; we additionally pin Cache-Control here so the client
          // cannot choose its own value. Content-Disposition and
          // `X-Content-Type-Options: nosniff` must be enforced by the public
          // bucket policy. See `docs/security-upload.md`.
          (upload): ObjectUploadPrepared => ({
            objectKey: upload.objectKey,
            cacheControl: bookCoverCacheControl,
          })
        )
        .with(Result.P.Ok({ type: 'book_cover_upload_forbidden' }), () =>
          rejectUpload(deps, 'UNAUTHORIZED', input.fileType)
        )
        .with(
          Result.P.Ok({ type: 'book_cover_upload_invalid_file_type' }),
          () => rejectUpload(deps, 'invalid_file_type', input.fileType)
        )
        .exhaustive();
    }
  );

/**
 * Provider-neutral upload route definition consumed by `ObjectStoragePort`.
 * No upload-SDK types cross this boundary.
 */
export const bookCoverUploadRouteDefinition = (
  deps: BookCoverUploadDeps
): ObjectUploadRouteDefinition => ({
  ...bookCoverUploadConstraints,
  prepare: (ctx) => handleBookCoverBeforeUpload(deps, ctx),
});
