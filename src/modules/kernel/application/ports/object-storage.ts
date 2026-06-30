/**
 * Provider-neutral object-storage upload port.
 *
 * Abstracts the presigned-upload mechanism so transport and composition do not
 * depend on a specific upload SDK. The current adapter is better-upload + S3
 * (`infrastructure/storage`), but any provider can implement this port. A route
 * `prepare` hook rejects an upload by raising `UploadRejectedError`
 * (`domain/errors/upload-rejected-error`).
 */

export type ObjectUploadPrepared = {
  /** Server-generated storage object key. The client never controls this. */
  objectKey: string;
  /** Optional `Cache-Control` pinned on the stored object. */
  cacheControl?: string;
};

export type ObjectUploadRouteDefinition = {
  fileTypes: string[];
  maxFileSize: number;
  /**
   * Resolve the server-decided object key (+ optional cache-control) for an
   * incoming upload, or reject it by raising `UploadRejectedError`.
   */
  prepare: (ctx: {
    headers: Headers;
    fileType: string;
  }) => Promise<ObjectUploadPrepared>;
};

export type ObjectUploadRequestHandler = (
  request: Request
) => Promise<Response>;

export type ObjectStoragePort = {
  /**
   * Build an HTTP handler that serves presigned uploads for the given named
   * routes.
   */
  createUploadRequestHandler: (
    routes: Record<string, ObjectUploadRouteDefinition>
  ) => ObjectUploadRequestHandler;
};
