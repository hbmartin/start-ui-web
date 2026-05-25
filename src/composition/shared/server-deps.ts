import { getKernel, type Kernel } from '@/composition/kernel';

import type { ProtectedContext } from '@/modules/auth/server';

export const getKernelForCtx = (ctx: ProtectedContext): Kernel =>
  getKernel({
    logger: {
      info: (event, fields) => ctx.logger.info(fields ?? {}, event),
      warn: (event, fields) => ctx.logger.warn(fields ?? {}, event),
      error: (event, fields) => ctx.logger.error(fields ?? {}, event),
    },
  });

export type ProtectedRunner = <T>(
  fn: (ctx: ProtectedContext) => Promise<T>
) => Promise<T>;
