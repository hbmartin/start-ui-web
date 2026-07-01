export const SIDE_EFFECT_ROUTE_PATHNAMES = ['/logout'] as const;

const protectedNavigationPathnames = new Set<string>(
  SIDE_EFFECT_ROUTE_PATHNAMES
);

const stripTrailingSlashes = (pathname: string) => {
  if (pathname.length <= 1) return pathname;

  let end = pathname.length;
  while (end > 1 && pathname.charCodeAt(end - 1) === 47) end -= 1;
  return pathname.slice(0, end);
};

export const normalizeNavigationPathname = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;

  const hashIndex = trimmed.indexOf('#');
  const withoutHash = hashIndex === -1 ? trimmed : trimmed.slice(0, hashIndex);
  const searchIndex = withoutHash.indexOf('?');
  const pathname =
    searchIndex === -1 ? withoutHash : withoutHash.slice(0, searchIndex);

  return stripTrailingSlashes(pathname);
};

export const isProtectedNavigationPath = (pathname: string) => {
  const normalizedPathname = normalizeNavigationPathname(pathname);
  return (
    normalizedPathname !== null &&
    protectedNavigationPathnames.has(normalizedPathname)
  );
};
