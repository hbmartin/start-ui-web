import type { Session } from '../../domain/session';
import type { AuthUseCaseDeps } from './types';

export async function getCurrentSession(
  deps: AuthUseCaseDeps,
  input: { headers: Headers }
): Promise<Session | null> {
  return deps.sessionGateway.getSession(input.headers);
}
