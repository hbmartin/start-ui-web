import { faker } from '@faker-js/faker';
import { notInArray, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';

import {
  getSeedAccountEmails,
  isProdRuntimeEnvironment,
} from '@/modules/kernel/infrastructure/config/env-schema';
import { getDefaultDbClient } from '@/modules/kernel/infrastructure/db/client';
import { user } from '@/modules/kernel/infrastructure/db/schema';

import { emphasis } from './_utils';

/**
 * Seed accounts are never hardcoded: their emails come from SEED_ADMIN_EMAIL /
 * SEED_USER_EMAIL when provided, otherwise a fresh random local address is
 * generated per run. `randomBytes` is used instead of faker so the address is
 * not made predictable by the deterministic `faker.seed()` call in index.ts.
 */
const randomSeedEmail = (role: string) =>
  `${role}-${randomBytes(8).toString('hex')}@seed.local`;

const { adminEmail: adminEmailOverride, userEmail: userEmailOverride } =
  getSeedAccountEmails();
const adminEmail = (
  adminEmailOverride ?? randomSeedEmail('admin')
).toLowerCase();
const userEmail = (userEmailOverride ?? randomSeedEmail('user')).toLowerCase();

const seedOnboardedAt = new Date('2024-01-01T00:00:00.000Z');

export async function createUsers() {
  console.log(`⏳ Seeding users`);
  const db = getDefaultDbClient();

  let createdCounter = 0;
  const [countRow] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(user)
    .where(notInArray(user.email, [userEmail, adminEmail]));
  const existingRandomUserCount = countRow?.count ?? 0;

  const usersToSeed = Array.from(
    { length: Math.max(0, 98 - existingRandomUserCount) },
    () => ({
      name: faker.person.fullName(),
      email: faker.internet.email().toLowerCase(),
      emailVerified: true,
      role: 'user' as const,
    })
  );

  if (usersToSeed.length > 0) {
    const inserted = await db
      .insert(user)
      .values(usersToSeed)
      .onConflictDoNothing()
      .returning({ id: user.id });
    createdCounter += inserted.length;
  }

  const [insertedUser] = await db
    .insert(user)
    .values({
      name: 'User',
      email: userEmail,
      emailVerified: true,
      onboardedAt: seedOnboardedAt,
      role: 'user',
    })
    .onConflictDoNothing()
    .returning({ id: user.id });
  if (insertedUser) {
    createdCounter += 1;
  }

  const [insertedAdmin] = await db
    .insert(user)
    .values({
      name: 'Admin',
      email: adminEmail,
      emailVerified: true,
      role: 'admin',
      onboardedAt: seedOnboardedAt,
    })
    .onConflictDoNothing()
    .returning({ id: user.id });
  if (insertedAdmin) {
    createdCounter += 1;
  }

  console.log(
    `✅ ${existingRandomUserCount} existing random users 👉 ${createdCounter} users created`
  );

  // Never disclose seeded credentials on a production runtime.
  if (!isProdRuntimeEnvironment()) {
    console.log(`👉 Admin connect with: ${emphasis(adminEmail)}`);
    console.log(`👉 User connect with: ${emphasis(userEmail)}`);
  }
}
