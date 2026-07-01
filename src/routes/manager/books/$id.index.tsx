import { createFileRoute, notFound } from '@tanstack/react-router';

import { isForbiddenRouteContext } from '@/modules/auth/presentation';
import { bookQueries } from '@/modules/book/client';
import { ManagerPageBook as PageBook } from '@/modules/book/presentation';
import { toBookId, toScopeKey } from '@/modules/kernel';
import { observedLoader } from '@/platform/router/route-observability';

const parseRouteBookId = (value: string) => {
  const parsed = toBookId(value);
  if (parsed.isError()) throw notFound();
  return parsed.get();
};

const parseRouteScopeKey = (value: string) => {
  const parsed = toScopeKey(value);
  if (parsed.isError()) throw parsed.getError();
  return parsed.get();
};

export const Route = createFileRoute('/manager/books/$id/')({
  loader: observedLoader('/manager/books/$id/', ({ context, params }) => {
    if (isForbiddenRouteContext(context)) return undefined;

    return context.queryClient.ensureQueryData(
      bookQueries.getById({
        id: parseRouteBookId(params.id),
        scopeKey: parseRouteScopeKey(context.scopeKey),
      })
    );
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const params = Route.useParams();
  return <PageBook bookId={parseRouteBookId(params.id)} />;
}
