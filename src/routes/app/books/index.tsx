import { createFileRoute } from '@tanstack/react-router';

import { bookQueries } from '@/modules/book/client';
import { AppPageBooks as PageBooks } from '@/modules/book/presentation';
import { toScopeKey } from '@/modules/kernel';
import { observedLoader } from '@/platform/router/route-observability';

const parseRouteScopeKey = (value: string) => {
  const parsed = toScopeKey(value);
  if (parsed.isError()) throw parsed.getError();
  return parsed.get();
};

export const Route = createFileRoute('/app/books/')({
  loader: observedLoader('/app/books/', ({ context }) =>
    context.queryClient.ensureInfiniteQueryData(
      bookQueries.getAllInfinite({
        scopeKey: parseRouteScopeKey(context.scopeKey),
      })
    )
  ),
  component: RouteComponent,
});

function RouteComponent() {
  return <PageBooks />;
}
