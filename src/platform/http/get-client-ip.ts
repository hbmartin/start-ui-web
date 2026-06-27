/**
 * Best-effort client IP extraction from common proxy headers.
 *
 * `X-Forwarded-For` is a comma-separated trail where each proxy appends the
 * address it saw. Only the entries appended by *trusted* proxies are
 * meaningful; everything to the left can be forged by the original caller.
 * Callers pass `trustedProxyDepth` (the number of trusted proxy hops in front
 * of the app, configured via `TRUSTED_PROXY_DEPTH`) so the genuine client IP is
 * read `depth` hops from the end rather than the attacker-controllable
 * leftmost entry.
 *
 * This function is intentionally pure and free of module/config imports so it
 * can live in `src/platform`: the configured depth is injected by callers.
 *
 * IMPORTANT: the result is best-effort defense-in-depth (rate limiting,
 * abuse logging) only. It MUST NOT be used for authorization decisions, and it
 * is only trustworthy when a known edge/proxy sets these headers and
 * `trustedProxyDepth` matches that topology. Returns `undefined` when no
 * candidate header is present.
 */
export function getClientIp(
  request: Request,
  options: { trustedProxyDepth?: number } = {}
): string | undefined {
  const depth = options.trustedProxyDepth ?? 1;

  const forwardedFor = request.headers.get('X-Forwarded-For');
  if (forwardedFor) {
    const parts = forwardedFor
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (parts.length > 0) {
      // Walk `depth` hops back from the end. With one trusted proxy (depth=1)
      // that is the rightmost entry, which only the immediate trusted proxy can
      // append; entries to its left are attacker-supplied and ignored. Clamp to
      // the leftmost entry when the configured depth meets or exceeds the number
      // of hops (misconfiguration or a request that skipped a proxy).
      const index = depth >= parts.length ? 0 : parts.length - depth;
      return parts[index] ?? parts[0];
    }
  }

  // A single trusted proxy typically sets X-Real-IP instead of X-Forwarded-For.
  const realIp = request.headers.get('X-Real-IP')?.trim();
  if (realIp) return realIp;

  const cfConnectingIp = request.headers.get('CF-Connecting-IP')?.trim();
  if (cfConnectingIp) return cfConnectingIp;

  return undefined;
}
