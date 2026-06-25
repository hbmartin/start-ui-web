import { faker } from '@faker-js/faker';

import {
  isProdRuntimeEnvironment,
  isProductionSeedAllowed,
} from '@/modules/kernel/infrastructure/config/env-schema';
import { getDefaultDbClient } from '@/modules/kernel/infrastructure/db/client';

import { createBooks } from './book';
import { createUsers } from './user';

const SEED = 0x5eed;

/**
 * The seed provisions demo accounts, including a known-email `admin@admin.com`
 * admin (see ./user.ts). Running it against a production database would plant a
 * default admin account, so refuse unless the operator explicitly opts in with
 * ALLOW_PROD_SEED=true.
 */
function assertSeedAllowed() {
  if (isProdRuntimeEnvironment() && !isProductionSeedAllowed()) {
    throw new Error(
      'Refusing to seed in a production environment. This would create demo ' +
        'accounts (including admin@admin.com). Set ALLOW_PROD_SEED=true to override.'
    );
  }
}

async function main() {
  assertSeedAllowed();
  faker.seed(SEED);
  await createBooks();
  await createUsers();
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    await getDefaultDbClient().$close();
  } catch (closeError) {
    console.error(closeError);
    process.exitCode = 1;
  }
}
