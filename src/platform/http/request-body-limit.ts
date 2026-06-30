/**
 * Defense-in-depth cap on inbound server-function request bodies. Server
 * functions in this app carry small JSON payloads (ids, names, pagination,
 * search terms), so a generous fixed ceiling bounds memory/storage abuse from
 * oversized payloads without affecting legitimate calls. The per-field `.max()`
 * bounds in the transport validators are the primary control; this is a coarse
 * whole-body backstop. (CWE-770 / CWE-400.)
 *
 * Routes that legitimately accept larger bodies (telemetry ingest, the Resend
 * webhook) are router handlers, not server functions, and enforce their own
 * separate body caps — so this limit does not apply to them.
 */
export const MAX_SERVER_FN_BODY_BYTES = 1_048_576; // 1 MiB

/**
 * True when the request's declared `Content-Length` exceeds `maxBytes`. A
 * missing or unparseable `Content-Length` returns `false`: the header is
 * advisory and a streamed body without it is out of scope for this cheap
 * pre-read check (mirroring the webhook handler's pre-read guard).
 */
export const exceedsDeclaredBodyLimit = (
  request: Request,
  maxBytes: number = MAX_SERVER_FN_BODY_BYTES
): boolean => {
  const header = request.headers.get('Content-Length');
  if (header === null) return false;
  const length = Number(header);
  return Number.isFinite(length) && length > maxBytes;
};
