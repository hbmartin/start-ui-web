import { createFileRoute } from '@tanstack/react-router';
import { fallback, zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';

import { PageError } from '@/platform/components/errors/page-error';

import {
  LayoutLogin,
  PageOnboarding,
  requireOnboardingRoute,
} from '@/modules/auth/presentation';

export const Route = createFileRoute('/onboarding/')({
  validateSearch: zodValidator(
    z.object({
      redirect: fallback(z.string(), '').optional(),
    })
  ),
  beforeLoad: ({ context, location }) =>
    requireOnboardingRoute({ context, location }),
  component: RouteComponent,
  errorComponent: () => <PageError type="error-boundary" />,
});

function RouteComponent() {
  return (
    <LayoutLogin>
      <PageOnboarding />
    </LayoutLogin>
  );
}
