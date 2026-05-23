import type { PermissionRequest } from '@/modules/kernel/application/ports/permission-checker';

export type { PermissionRequest };

export interface AuthorizationGateway {
  userHasPermission(input: {
    userId: string;
    permissions: PermissionRequest;
    headers: Headers;
  }): Promise<boolean>;
}
