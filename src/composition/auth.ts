import {
  type AuthEmailPort,
  type AuthorizationGateway,
  createAuthUseCases,
  type SessionGateway,
  type UserAdminGateway,
} from '@/modules/auth';
import { AuthEmailPortResend } from '@/modules/auth/infrastructure/better-auth/auth-email-port-resend';
import { AuthorizationGatewayBetterAuth } from '@/modules/auth/infrastructure/better-auth/authorization-gateway-better-auth';
import { SessionGatewayBetterAuth } from '@/modules/auth/infrastructure/better-auth/session-gateway-better-auth';
import { UserAdminGatewayBetterAuth } from '@/modules/auth/infrastructure/better-auth/user-admin-gateway-better-auth';

import { hasDefinedOverrides } from './shared/overrides';
import { createCachedFactory } from './shared/singleton';

export {
  type Auth,
  auth,
} from '@/modules/auth/infrastructure/better-auth/auth';

export type AuthCompositionOverrides = {
  sessionGateway?: SessionGateway;
  authorizationGateway?: AuthorizationGateway;
  authEmailPort?: AuthEmailPort;
  userAdminGateway?: UserAdminGateway;
};

const buildAuthUseCases = (overrides?: AuthCompositionOverrides) => {
  return createAuthUseCases({
    sessionGateway: overrides?.sessionGateway ?? new SessionGatewayBetterAuth(),
    authorizationGateway:
      overrides?.authorizationGateway ?? new AuthorizationGatewayBetterAuth(),
    authEmailPort: overrides?.authEmailPort ?? new AuthEmailPortResend(),
    userAdminGateway:
      overrides?.userAdminGateway ?? new UserAdminGatewayBetterAuth(),
  });
};

const getCachedAuthUseCases = createCachedFactory(() => buildAuthUseCases());

export function getAuthUseCases(options?: {
  overrides?: AuthCompositionOverrides;
}) {
  const overrides = options?.overrides;
  if (hasDefinedOverrides(overrides)) {
    return buildAuthUseCases(overrides);
  }
  return getCachedAuthUseCases(false);
}
