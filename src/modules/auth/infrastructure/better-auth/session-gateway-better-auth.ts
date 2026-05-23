import type { SessionGateway } from '../../application/ports/session-gateway';
import type { Session } from '../../domain/session';
import { auth } from './auth';

export class SessionGatewayBetterAuth implements SessionGateway {
  async getSession(headers: Headers): Promise<Session | null> {
    const result = await auth.api.getSession({ headers });
    if (!result) return null;
    return result as Session;
  }
}
