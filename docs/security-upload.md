# Upload Security: Book Covers

## Summary

Book covers are uploaded **directly from the browser to S3/MinIO** through a
[better-upload](https://github.com/Nic13Gamer/better-upload) presigned `PUT`,
and served from a **public** bucket (`VITE_S3_BUCKET_PUBLIC_URL`). The
application server never sees the file bytes, so it cannot scan or transcode
them. This is a **documented, accepted residual risk** — we harden how covers
are requested and served instead of building an upload-scanning pipeline.

## What the server already enforces

The upload flow is locked down at the boundary; the relevant code:

- `src/modules/book/transport/upload/book-cover.ts` — `onBeforeUpload` hook.
- `src/modules/book/application/use-cases/prepare-book-cover-upload.ts` —
  permission + object-key derivation.
- `src/modules/book/domain/book-policy.ts` — MIME allowlist, size limit,
  object-key format, pinned `Cache-Control`.
- `src/composition/book-upload.ts` — router wiring.
- `src/modules/kernel/infrastructure/storage/better-upload.ts` /
  `src/modules/kernel/infrastructure/config/storage.ts` — S3 client + config.

Controls in place:

1. **Admin only.** `prepareBookCoverUpload` requires the
   `book: ['create', 'update']` permission before any presigned URL is issued.
   An unauthenticated or unauthorized caller is rejected
   (`security.upload_rejected` is logged).
2. **MIME allowlist (twice).** The MIME type is checked against
   `bookCoverAcceptedFileTypes` (`image/png`, `image/jpeg`, `image/webp`,
   `image/gif`) both by better-upload's `fileTypes` (it refuses to presign any
   other type) and by `createBookCoverObjectKey` (no extension ⇒
   `book_cover_upload_invalid_file_type`).
3. **Content-Type pinned to a validated MIME.** better-upload signs the `PUT`
   with `Content-Type: file.type`, and `file.type` can only be one of the
   allowlisted image types above. The browser cannot have the object stored
   with an arbitrary Content-Type such as `text/html`.
4. **Server-generated object key.** The key is `books/<generatedId>.<ext>`
   where `<generatedId>` comes from the server `IdGenerator` and `<ext>` is
   derived from the validated MIME. The client filename is never used in the
   key, so there is no path traversal or key-collision vector.
5. **Size limit.** `bookCoverMaxFileSizeBytes` (10 MB) is enforced server-side.
6. **Pinned `Cache-Control`.** The presign sets
   `Cache-Control: public, max-age=31536000, immutable` (`bookCoverCacheControl`)
   so the client cannot pick its own caching directive. Keys are unique per
   upload and never overwritten, so immutable caching is safe.

7. **Per-caller upload-key binding.** When the presign is issued, the
   server-generated object key is bound to the requesting user in a short-lived
   store (`BookCoverStorage.rememberUpload`, 30-minute TTL). When a book write
   persists a `coverId`, the binding is verified and one-shot **consumed**
   (`consumeUpload`); a key that was never issued to this caller (or whose window
   expired) is rejected with `book_cover_unowned`. This stops a caller from
   attaching an arbitrary or another user's object key to a book
   (CWE-472 / CWE-639). The binding is only required when the cover actually
   changes, so editing other book fields never needs a fresh upload.
   *Topology note:* the binding store is the shared `SecondaryStore` — durable
   and cross-instance only with Upstash configured; with the in-memory default a
   presign and its later save must land on the same instance.
8. **Object reclamation (delete-on-change).** When a book's cover is replaced or
   a book is deleted, the superseded object is deleted from the bucket
   (`BookCoverStorage.deleteObject`, a SigV4-signed `DELETE` through the same S3
   client). This is best-effort: a delete failure is logged
   (`book.cover_object.delete_failed`) but never fails the book write. It does
   not reclaim a cover that was uploaded but never saved to any book.

## Residual risk

The only remaining risk is an **admin** uploading a non-image payload that
nonetheless carries an allowlisted image MIME (e.g. an HTML/script file sent as
`image/png`). Because the server never inspects the bytes, such a file would be
stored. The damage is bounded by **how the public bucket serves it**, which is
why the bucket policy below is required rather than optional.

This is low severity because (a) only authenticated admins can upload, (b) the
content-type is pinned to an image MIME, and (c) the public bucket is a separate
origin from the app, so even an HTML payload cannot read app cookies or run in
the app's origin.

## Required public-bucket configuration

The bucket behind `VITE_S3_BUCKET_PUBLIC_URL` **must** be configured so that
user-uploaded objects can never be interpreted as active content by a browser:

1. **`X-Content-Type-Options: nosniff`** on every served object, so browsers do
   not MIME-sniff a payload into `text/html`.
2. **Never serve user content as `text/html` or `application/xhtml+xml`.** Pin
   or whitelist response content-types to the image set above. The stored
   Content-Type is already constrained server-side (control 3); the bucket/CDN
   must not override it back to an HTML type.
3. **Separate origin from the app.** Already satisfied: covers are served from
   `VITE_S3_BUCKET_PUBLIC_URL`, which is a different origin than the
   application. Keep it that way — do not proxy the public bucket under the app
   origin.
4. **`Content-Disposition`.** Ideally serve objects with a `Content-Disposition`
   that avoids inline HTML rendering (e.g. `inline` with a safe filename, or
   `attachment` for non-displayable types). better-upload's presign API does
   **not** expose a way to set `Content-Disposition` on the object cleanly, so
   it is **not** set at upload time and must be enforced by bucket/CDN response
   headers. (`Cache-Control` *is* settable through the presign and is pinned;
   see control 6.)

With `nosniff` + a non-HTML content-type, a mislabeled HTML payload downloads or
renders as a broken image instead of executing, which neutralizes the residual
risk.

## Why not server-side scanning

Direct-to-bucket presigned uploads are the point of better-upload: the app
server stays out of the byte path for scalability and cost. Inserting an
AV/transcode pipeline would mean either proxying every upload through the app or
adding an async post-processing service — disproportionate for an admin-only,
MIME-allowlisted, separate-origin cover image. The bucket policy above is the
proportionate mitigation.
