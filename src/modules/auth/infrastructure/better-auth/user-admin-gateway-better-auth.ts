import type { UserAdminGateway } from '../../application/ports/user-admin-gateway';
import { auth } from './auth';

export class UserAdminGatewayBetterAuth implements UserAdminGateway {
  async removeUser(input: {
    userId: string;
    headers: Headers;
  }): Promise<boolean> {
    const response = await auth.api.removeUser({
      body: { userId: input.userId },
      headers: input.headers,
    });
    return response.success;
  }

  async revokeUserSessions(input: {
    userId: string;
    headers: Headers;
  }): Promise<boolean> {
    const response = await auth.api.revokeUserSessions({
      body: { userId: input.userId },
      headers: input.headers,
    });
    return response.success;
  }

  async revokeUserSession(input: {
    sessionToken: string;
    headers: Headers;
  }): Promise<boolean> {
    const response = await auth.api.revokeUserSession({
      body: { sessionToken: input.sessionToken },
      headers: input.headers,
    });
    return response.success;
  }
}
