import { createFileRoute, notFound } from '@tanstack/react-router';

import { useShouldShowNav } from '@/app/shell/presentation';
import { bookQueries } from '@/modules/book/client';
import { AppPageBook as PageBook } from '@/modules/book/presentation';
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

export const Route = createFileRoute('/app/books/$id/')({
  loader: observedLoader('/app/books/$id/', ({ context, params }) =>
    context.queryClient.ensureQueryData(
      bookQueries.getById({
        id: parseRouteBookId(params.id),
        scopeKey: parseRouteScopeKey(context.scopeKey),
      })
    )
  ),
  component: RouteComponent,
});

function RouteComponent() {
  useShouldShowNav('desktop-only');
  const params = Route.useParams();
  return <PageBook bookId={parseRouteBookId(params.id)} />;
}
