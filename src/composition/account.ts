import {
  type AccountRepository,
  createAccountUseCases,
} from '@/modules/account';
import { AccountRepositoryDrizzle } from '@/modules/account/infrastructure/drizzle/account-repository-drizzle';

import { getKernel, type Kernel } from './kernel';
import { createCachedFactory } from './shared/singleton';

export type AccountOverrides = {
  kernel?: Kernel;
  accountRepository?: AccountRepository;
};

const factory = createCachedFactory((overrides?: AccountOverrides) => {
  const kernel = overrides?.kernel ?? getKernel();
  return createAccountUseCases({
    accountRepository:
      overrides?.accountRepository ?? new AccountRepositoryDrizzle(kernel.db),
    clock: kernel.clock,
    logger: kernel.logger,
  });
});

export const getAccountUseCases = factory.get;

/** Test-only. */
export const __resetAccountComposition = factory.reset;
