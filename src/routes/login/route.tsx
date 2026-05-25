import { createFileRoute, Outlet } from '@tanstack/react-router';

import { PageError } from '@/platform/components/errors/page-error';

import {
  GuardPublicOnly,
  LayoutLogin,
  redirectAuthenticatedRoute,
} from '@/modules/auth/presentation';

export const Route = createFileRoute('/login')({
  beforeLoad: ({ context }) => redirectAuthenticatedRoute({ context }),
  component: RouteComponent,
  notFoundComponent: () => <PageError type="404" />,
  errorComponent: () => <PageError type="error-boundary" />,
});

function RouteComponent() {
  return (
    <GuardPublicOnly>
      <LayoutLogin>
        <Outlet />
      </LayoutLogin>
    </GuardPublicOnly>
  );
}
