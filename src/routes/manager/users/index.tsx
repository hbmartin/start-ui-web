import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';

import { isForbiddenRouteContext } from '@/modules/auth/presentation';
import { toScopeKey } from '@/modules/kernel';
import { userQueries } from '@/modules/user/client';
import { PageUsers } from '@/modules/user/presentation';
import { observedLoader } from '@/platform/router/route-observability';

const parseRouteScopeKey = (value: string) => {
  const parsed = toScopeKey(value);
  if (parsed.isError()) throw parsed.getError();
  return parsed.get();
};

export const Route = createFileRoute('/manager/users/')({
  validateSearch: zodValidator(
    z.object({
      searchTerm: z.string().prefault(''),
    })
  ),
  search: {
    middlewares: [stripSearchParams({ searchTerm: '' })],
  },
  loaderDeps: ({ search: { searchTerm } }) => ({ searchTerm }),
  component: RouteComponent,
  loader: observedLoader('/manager/users/', ({ context, deps }) => {
    if (isForbiddenRouteContext(context)) return undefined;

    return context.queryClient.ensureInfiniteQueryData(
      userQueries.getAllInfinite({
        scopeKey: parseRouteScopeKey(context.scopeKey),
        searchTerm: deps.searchTerm,
      })
    );
  }),
});

function RouteComponent() {
  const search = Route.useSearch();
  return <PageUsers search={search} />;
}
