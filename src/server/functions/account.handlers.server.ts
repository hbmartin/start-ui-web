import { z } from 'zod';

import { zFormFieldsOnboarding } from '@/features/auth/schema';
import { zUser } from '@/features/user/schema';
import type { ProtectedContext } from '@/server/middlewares.server';

const submitOnboarding = async (
  ctx: ProtectedContext,
  data: z.infer<ReturnType<typeof zFormFieldsOnboarding>>
) => {
  ctx.logger.info('Update user');
  await ctx.db.user.update({
    where: { id: ctx.user.id },
    data: {
      ...data,
      onboardedAt: new Date(),
    },
  });
};

const updateInfo = async (
  ctx: ProtectedContext,
  data: { name?: string | null }
) => {
  ctx.logger.info('Update user');
  await ctx.db.user.update({
    where: { id: ctx.user.id },
    data: {
      name: data.name ?? '',
    },
  });
};

export type AccountHandlers = {
  submitOnboarding: typeof submitOnboarding;
  updateInfo: typeof updateInfo;
};

export const handlers: AccountHandlers = {
  submitOnboarding,
  updateInfo,
};

export const zUpdateInfoInput = () => zUser().pick({ name: true });
