import type { Session } from '../../domain/session';

export interface SessionGateway {
  getSession(headers: Headers): Promise<Session | null>;
}
