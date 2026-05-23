import type { PermissionRequest } from '../ports/authorization-gateway';
import type { AuthUseCaseDeps } from './types';

export async function checkPermission(
  deps: AuthUseCaseDeps,
  input: {
    userId: string;
    permissions: PermissionRequest;
    headers: Headers;
  }
): Promise<boolean> {
  return deps.authorizationGateway.userHasPermission(input);
}
