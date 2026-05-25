import type { QueryClient } from '@tanstack/react-query';
import { redirect } from '@tanstack/react-router';

import type { Permission, Role } from '@/modules/auth';
import { hasRolePermission } from '@/modules/auth';
import { authQueries } from '@/modules/auth/client';

type AuthRouteContext = {
  queryClient: QueryClient;
};

type RouteLocation = {
  href: string;
};

export class ForbiddenRouteError extends Error {
  constructor() {
    super('Forbidden route');
    this.name = 'ForbiddenRouteError';
  }
}

export const isForbiddenRouteError = (
  error: unknown
): error is ForbiddenRouteError => error instanceof ForbiddenRouteError;

const getDefaultAuthenticatedPath = (role: Role) => {
  if (hasRolePermission(role, { apps: ['manager'] })) return '/manager';
  if (hasRolePermission(role, { apps: ['app'] })) return '/app';
  return '/';
};

const getCurrentSession = (context: AuthRouteContext) =>
  context.queryClient.ensureQueryData(authQueries.currentSession());

export async function requireAuthenticatedRoute(input: {
  context: AuthRouteContext;
  location: RouteLocation;
  permissionApps?: Permission['apps'];
}) {
  const currentSession = await getCurrentSession(input.context);

  if (!currentSession) {
    throw redirect({
      to: '/login',
      search: { redirect: input.location.href },
    });
  }

  if (!currentSession.user.onboardedAt) {
    throw redirect({
      to: '/onboarding',
      search: { redirect: input.location.href },
    });
  }

  if (
    input.permissionApps &&
    !hasRolePermission(currentSession.user.role, {
      apps: input.permissionApps,
    })
  ) {
    throw new ForbiddenRouteError();
  }

  return {
    currentSession,
    scope: currentSession.scope,
    scopeKey: currentSession.scopeKey,
  };
}

export async function requireOnboardingRoute(input: {
  context: AuthRouteContext;
  location: RouteLocation;
}) {
  const currentSession = await getCurrentSession(input.context);

  if (!currentSession) {
    throw redirect({
      to: '/login',
      search: { redirect: input.location.href },
    });
  }

  if (currentSession.user.onboardedAt) {
    throw redirect({
      to: getDefaultAuthenticatedPath(currentSession.user.role),
    });
  }

  return {
    currentSession,
    scope: currentSession.scope,
    scopeKey: currentSession.scopeKey,
  };
}

export async function redirectAuthenticatedRoute(input: {
  context: AuthRouteContext;
}) {
  const currentSession = await getCurrentSession(input.context);

  if (!currentSession) return;

  if (!currentSession.user.onboardedAt) {
    throw redirect({
      to: '/onboarding',
    });
  }

  throw redirect({
    to: getDefaultAuthenticatedPath(currentSession.user.role),
  });
}
