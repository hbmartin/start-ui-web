import { Result } from '@bloodyowl/boxed';
import { mockSession, mockUser } from '@tests/server/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  bookCoverAcceptedFileTypes,
  bookCoverMaxFileSizeBytes,
} from '@/modules/book/domain/book-policy';
import {
  bookCoverUploadConstraints,
  handleBookCoverBeforeUpload,
} from '@/modules/book/transport/upload/book-cover';
import { toBookCoverObjectKey } from '@/modules/kernel/testing';
import type { TelemetryAdapter } from '@/platform/telemetry';

const headers = new Headers();

const startSpanMock = vi.fn((_options: unknown, fn: () => unknown) => fn());
const telemetryMock = {
  startSpan: startSpanMock,
} as unknown as Pick<TelemetryAdapter, 'startSpan'>;

// Narrow a boxed Result via its `this`-typed accessors outside the test body so
// the assertions stay conditional-free.
const expectOk = <A, E>(result: Result<A, E>): A => {
  if (result.isError()) throw result.getError();
  return result.get();
};

const expectErr = <A, E>(result: Result<A, E>): E => {
  if (result.isOk()) throw new Error('expected an upload rejection');
  return result.getError();
};

describe('book cover upload transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startSpanMock.mockImplementation((_options: unknown, fn: () => unknown) =>
      fn()
    );
  });

  it('keeps upload route limits server-side', () => {
    expect(bookCoverUploadConstraints.maxFileSize).toBe(
      bookCoverMaxFileSizeBytes
    );
    expect(bookCoverUploadConstraints.fileTypes).toEqual([
      ...bookCoverAcceptedFileTypes,
    ]);
  });

  it('binds session context and returns the prepared object key', async () => {
    const prepareCoverUpload = vi.fn(async () =>
      Result.Ok({
        type: 'book_cover_upload_prepared' as const,
        upload: { objectKey: toBookCoverObjectKey('books/generated.webp') },
      })
    );

    const result = await handleBookCoverBeforeUpload(
      {
        getCurrentSession: async () => ({
          user: mockUser,
          session: mockSession,
        }),
        getUseCases: () => ({ prepareCoverUpload }),
        telemetry: telemetryMock,
      },
      { headers, fileType: 'image/webp' }
    );

    expect(expectOk(result)).toEqual({
      objectKey: 'books/generated.webp',
      cacheControl: 'public, max-age=31536000, immutable',
    });

    expect(prepareCoverUpload).toHaveBeenCalledWith({
      currentUserId: mockUser.id,
      fileType: 'image/webp',
    });
    expect(startSpanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: expect.objectContaining({
          'file.mime_type': 'image/webp',
          'operation.name': 'book.coverUpload.beforeUpload',
          'upload.route': 'bookCover',
        }),
        name: 'book.coverUpload.beforeUpload',
        op: 'upload.before_upload',
      }),
      expect.any(Function)
    );
  });

  it('maps unauthenticated users to a rejected upload (stable key)', async () => {
    const result = await handleBookCoverBeforeUpload(
      {
        getCurrentSession: async () => null,
        getUseCases: () => ({ prepareCoverUpload: vi.fn() }),
        telemetry: telemetryMock,
      },
      { headers, fileType: 'image/png' }
    );

    expect(expectErr(result)).toMatchObject({
      name: 'UploadRejectedError',
      messageKey: 'book:manager.uploadErrors.NOT_AUTHENTICATED',
    });
  });

  it('maps expected use-case failures to rejected uploads (stable keys)', async () => {
    const forbiddenResult = await handleBookCoverBeforeUpload(
      {
        getCurrentSession: async () => ({
          user: mockUser,
          session: mockSession,
        }),
        getUseCases: () => ({
          prepareCoverUpload: async () =>
            Result.Ok({ type: 'book_cover_upload_forbidden' as const }),
        }),
        telemetry: telemetryMock,
      },
      { headers, fileType: 'image/png' }
    );

    expect(expectErr(forbiddenResult)).toMatchObject({
      name: 'UploadRejectedError',
      messageKey: 'book:manager.uploadErrors.UNAUTHORIZED',
    });

    const invalidTypeResult = await handleBookCoverBeforeUpload(
      {
        getCurrentSession: async () => ({
          user: mockUser,
          session: mockSession,
        }),
        getUseCases: () => ({
          prepareCoverUpload: async () =>
            Result.Ok({
              type: 'book_cover_upload_invalid_file_type' as const,
            }),
        }),
        telemetry: telemetryMock,
      },
      { headers, fileType: 'text/plain' }
    );

    expect(expectErr(invalidTypeResult)).toMatchObject({
      name: 'UploadRejectedError',
      messageKey: 'book:manager.uploadErrors.invalid_file_type',
    });
  });
});
