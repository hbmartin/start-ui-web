import { z } from 'zod';

import type { AccountUseCases } from '@/modules/account';
import type { ProtectedContext } from '@/modules/auth/backend';
import { unwrapApplicationResult } from '@/modules/kernel/transport/tanstack/result-mapper';

import { ACCOUNT_NAME_MAX_LENGTH } from '../../domain/account-policy';

const zAccountName = () =>
  z.string().trim().min(1).max(ACCOUNT_NAME_MAX_LENGTH);

export const zSubmitOnboardingInput = () => z.object({ name: zAccountName() });
export const zUpdateInfoInput = () => z.object({ name: zAccountName() });

type AccountHandlerDeps = {
  getUseCases: (ctx: ProtectedContext) => AccountUseCases;
};

const accountReasonConfig = {
  account_forbidden: { code: 'FORBIDDEN', message: 'Forbidden' },
  account_invalid: { code: 'BAD_REQUEST', message: 'Account name is required' },
  account_not_found: { code: 'NOT_FOUND', message: 'Account not found' },
  account_updated: () => undefined,
} as const;

export const createAccountHandlers = ({ getUseCases }: AccountHandlerDeps) => {
  const submitOnboarding = async (
    ctx: ProtectedContext,
    data: z.infer<ReturnType<typeof zSubmitOnboardingInput>>
  ) => {
    await unwrapApplicationResult(
      getUseCases(ctx).submitOnboarding({
        currentUserId: ctx.scope.userId,
        name: data.name,
      }),
      accountReasonConfig
    );
  };

  const updateInfo = async (
    ctx: ProtectedContext,
    data: z.infer<ReturnType<typeof zUpdateInfoInput>>
  ) => {
    await unwrapApplicationResult(
      getUseCases(ctx).updateInfo({
        currentUserId: ctx.scope.userId,
        name: data.name,
      }),
      accountReasonConfig
    );
  };

  return {
    submitOnboarding,
    updateInfo,
  };
};

export type AccountHandlers = ReturnType<typeof createAccountHandlers>;
