import { createFileRoute } from '@tanstack/react-router';

import { useShouldShowNav } from '@/app/shell/presentation';
import { bookQueries } from '@/modules/book/client';
import { AppPageBook as PageBook } from '@/modules/book/presentation';
import { observedLoader } from '@/platform/router/route-observability';
import { parseRouteBookId, parseRouteScopeKey } from '@/routes/-route-params';

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
