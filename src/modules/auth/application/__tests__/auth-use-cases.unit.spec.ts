import { describe, expect, it, vi } from 'vitest';

import type { AuthEmailPort } from '../ports/auth-email-port';
import type { AuthorizationGateway } from '../ports/authorization-gateway';
import type { SessionGateway } from '../ports/session-gateway';
import type { UserAdminGateway } from '../ports/user-admin-gateway';
import type { Session } from '../../domain/session';
import { createAuthUseCases } from '../../factory';

const session: Session = {
  user: {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Test',
    emailVerified: true,
    image: null,
    role: 'user',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    onboardedAt: new Date('2026-01-01'),
  },
  session: {
    id: 'session-1',
    userId: 'user-1',
    expiresAt: new Date('2026-12-31'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    token: 'tok',
  },
};

const makeDeps = (overrides?: {
  sessionGateway?: Partial<SessionGateway>;
  authorizationGateway?: Partial<AuthorizationGateway>;
  authEmailPort?: Partial<AuthEmailPort>;
  userAdminGateway?: Partial<UserAdminGateway>;
}) => ({
  sessionGateway: {
    getSession: vi.fn(async () => session),
    ...overrides?.sessionGateway,
  } as SessionGateway,
  authorizationGateway: {
    userHasPermission: vi.fn(async () => true),
    ...overrides?.authorizationGateway,
  } as AuthorizationGateway,
  authEmailPort: {
    sendSignInOtp: vi.fn(async () => {}),
    ...overrides?.authEmailPort,
  } as AuthEmailPort,
  userAdminGateway: {
    removeUser: vi.fn(async () => true),
    revokeUserSessions: vi.fn(async () => true),
    revokeUserSession: vi.fn(async () => true),
    ...overrides?.userAdminGateway,
  } as UserAdminGateway,
});

describe('auth use cases', () => {
  it('returns session from the gateway', async () => {
    const deps = makeDeps();
    const useCases = createAuthUseCases(deps);

    const result = await useCases.getCurrentSession({ headers: new Headers() });

    expect(result).toEqual(session);
    expect(deps.sessionGateway.getSession).toHaveBeenCalledOnce();
  });

  it('returns null when there is no session', async () => {
    const deps = makeDeps({
      sessionGateway: { getSession: vi.fn(async () => null) },
    });
    const useCases = createAuthUseCases(deps);

    expect(
      await useCases.getCurrentSession({ headers: new Headers() })
    ).toBeNull();
  });

  it('delegates checkPermission to the gateway', async () => {
    const deps = makeDeps();
    const useCases = createAuthUseCases(deps);

    const allowed = await useCases.checkPermission({
      userId: 'user-1',
      permissions: { book: ['create'] },
      headers: new Headers(),
    });

    expect(allowed).toBe(true);
    expect(deps.authorizationGateway.userHasPermission).toHaveBeenCalledWith({
      userId: 'user-1',
      permissions: { book: ['create'] },
      headers: expect.any(Headers),
    });
  });

  it('delegates sendSignInOtp to the email port', async () => {
    const deps = makeDeps();
    const useCases = createAuthUseCases(deps);

    await useCases.sendSignInOtp({
      email: 'a@b.com',
      otp: '123456',
      language: 'en',
    });

    expect(deps.authEmailPort.sendSignInOtp).toHaveBeenCalledWith({
      email: 'a@b.com',
      otp: '123456',
      language: 'en',
    });
  });

  it('delegates user-admin operations to the gateway', async () => {
    const deps = makeDeps();
    const useCases = createAuthUseCases(deps);
    const headers = new Headers();

    await useCases.removeUser({ userId: 'user-1', headers });
    await useCases.revokeUserSessions({ userId: 'user-1', headers });
    await useCases.revokeUserSession({ sessionToken: 'tok', headers });

    expect(deps.userAdminGateway.removeUser).toHaveBeenCalledWith({
      userId: 'user-1',
      headers,
    });
    expect(deps.userAdminGateway.revokeUserSessions).toHaveBeenCalledWith({
      userId: 'user-1',
      headers,
    });
    expect(deps.userAdminGateway.revokeUserSession).toHaveBeenCalledWith({
      sessionToken: 'tok',
      headers,
    });
  });
});
