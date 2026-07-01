import { createFileRoute, notFound } from '@tanstack/react-router';

import { isForbiddenRouteContext } from '@/modules/auth/presentation';
import { toScopeKey, toUserId } from '@/modules/kernel';
import { userQueries } from '@/modules/user/client';
import { PageUser } from '@/modules/user/presentation';
import { observedLoader } from '@/platform/router/route-observability';

const parseRouteUserId = (value: string) => {
  const parsed = toUserId(value);
  if (parsed.isError()) throw notFound();
  return parsed.get();
};

const parseRouteScopeKey = (value: string) => {
  const parsed = toScopeKey(value);
  if (parsed.isError()) throw parsed.getError();
  return parsed.get();
};

export const Route = createFileRoute('/manager/users/$id/')({
  loader: observedLoader('/manager/users/$id/', ({ context, params }) => {
    if (isForbiddenRouteContext(context)) return undefined;

    return context.queryClient.ensureQueryData(
      userQueries.getById({
        id: parseRouteUserId(params.id),
        scopeKey: parseRouteScopeKey(context.scopeKey),
      })
    );
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const params = Route.useParams();
  return <PageUser userId={parseRouteUserId(params.id)} />;
}
