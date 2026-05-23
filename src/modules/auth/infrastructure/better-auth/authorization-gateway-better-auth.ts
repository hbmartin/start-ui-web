import type { AuthorizationGateway } from '../../application/ports/authorization-gateway';
import { auth } from './auth';

export class AuthorizationGatewayBetterAuth implements AuthorizationGateway {
  async userHasPermission(input: {
    userId: string;
    permissions: Record<string, readonly string[]>;
    headers: Headers;
  }): Promise<boolean> {
    const result = await auth.api.userHasPermission({
      body: { userId: input.userId, permissions: input.permissions },
      headers: input.headers,
    });
    if (result.error) return false;
    return result.success;
  }
}
