import { createFileRoute } from '@tanstack/react-router';

import { isForbiddenRouteContext } from '@/modules/auth/presentation';
import { bookQueries } from '@/modules/book/client';
import { PageBookUpdate } from '@/modules/book/presentation';
import { observedLoader } from '@/platform/router/route-observability';
import { parseRouteBookId, parseRouteScopeKey } from '@/routes/-route-params';

export const Route = createFileRoute('/manager/books/$id/update/')({
  loader: observedLoader(
    '/manager/books/$id/update/',
    ({ context, params }) => {
      if (isForbiddenRouteContext(context)) return undefined;

      return context.queryClient.ensureQueryData(
        bookQueries.getById({
          id: parseRouteBookId(params.id),
          scopeKey: parseRouteScopeKey(context.scopeKey),
        })
      );
    }
  ),
  component: RouteComponent,
});

function RouteComponent() {
  const params = Route.useParams();
  return <PageBookUpdate bookId={parseRouteBookId(params.id)} />;
}
