import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

import type { AccountUseCases } from '@/modules/account';
import type { ProtectedContext } from '@/modules/auth/server';
import { throwServerFnErrorForReason } from '@/modules/kernel/transport/tanstack/result-mapper';

export const zSubmitOnboardingInput = () =>
  z.object({ name: z.string().trim().min(1) });
export const zUpdateInfoInput = () =>
  z.object({ name: z.string().trim().min(1) });

type ProtectedRunner = <T>(
  fn: (ctx: ProtectedContext) => Promise<T>
) => Promise<T>;

type AccountServerFunctionDeps = {
  getDeps: () => Promise<{
    useCases: (ctx: ProtectedContext) => AccountUseCases;
    withProtectedMutation: ProtectedRunner;
  }>;
};

const mapReason = (reason: string): never =>
  throwServerFnErrorForReason(reason, {
    invalid: { code: 'BAD_REQUEST', message: 'Account name is required' },
    not_found: { code: 'NOT_FOUND', message: 'Account not found' },
  });

export const createAccountServerFunctions = ({
  getDeps,
}: AccountServerFunctionDeps) => ({
  accountSubmitOnboarding: createServerFn({ method: 'POST' })
    .inputValidator(zSubmitOnboardingInput())
    .handler(async ({ data }) => {
      const { useCases, withProtectedMutation } = await getDeps();
      return withProtectedMutation(async (ctx) => {
        const result = await useCases(ctx).submitOnboarding({
          scope: ctx.scope,
          name: data.name,
        });
        if (!result.ok) mapReason(result.reason);
      });
    }),

  accountUpdateInfo: createServerFn({ method: 'POST' })
    .inputValidator(zUpdateInfoInput())
    .handler(async ({ data }) => {
      const { useCases, withProtectedMutation } = await getDeps();
      return withProtectedMutation(async (ctx) => {
        const result = await useCases(ctx).updateInfo({
          scope: ctx.scope,
          name: data.name,
        });
        if (!result.ok) mapReason(result.reason);
      });
    }),
});

export type AccountServerFunctions = ReturnType<
  typeof createAccountServerFunctions
>;
