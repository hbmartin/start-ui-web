/**
 * Best-effort client IP extraction from common proxy headers.
 *
 * Order of preference: Cloudflare's `CF-Connecting-IP`, the first hop of
 * `X-Forwarded-For`, then `X-Real-IP`. These headers are set by the
 * platform/edge proxy. They are forgeable by direct callers, so the result is
 * suitable only for best-effort, defense-in-depth rate limiting — never for
 * authorization decisions. Returns `undefined` when no candidate is present.
 */
export function getClientIp(request: Request): string | undefined {
  const cfConnectingIp = request.headers.get('CF-Connecting-IP')?.trim();
  if (cfConnectingIp) return cfConnectingIp;

  const forwardedFor = request.headers.get('X-Forwarded-For');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get('X-Real-IP')?.trim();
  if (realIp) return realIp;

  return undefined;
}
