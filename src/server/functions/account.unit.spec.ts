import { describe, expect, it } from 'vitest';

import { handlers } from '@/server/functions/account.handlers.server';
import {
  createAuthenticatedContext,
  mockDb,
  mockUserHasPermission,
} from '@/server/functions/test-utils';

describe('account handlers', () => {
  describe('submitOnboarding', () => {
    const onboardingInput = { name: 'Test User' };

    it('should update the user with onboarding data', async () => {
      await handlers.submitOnboarding(
        createAuthenticatedContext(),
        onboardingInput
      );

      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          name: 'Test User',
          onboardedAt: expect.any(Date),
        }),
      });
    });

    it('should not require any specific permission', async () => {
      await handlers.submitOnboarding(
        createAuthenticatedContext(),
        onboardingInput
      );

      expect(mockUserHasPermission).not.toHaveBeenCalled();
    });
  });

  describe('updateInfo', () => {
    const updateInput = { name: 'Updated Name' };

    it('should update the user name', async () => {
      await handlers.updateInfo(createAuthenticatedContext(), updateInput);

      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { name: 'Updated Name' },
      });
    });

    it('should not require any specific permission', async () => {
      await handlers.updateInfo(createAuthenticatedContext(), updateInput);

      expect(mockUserHasPermission).not.toHaveBeenCalled();
    });
  });
});
