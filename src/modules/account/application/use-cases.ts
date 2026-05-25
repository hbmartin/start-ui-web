import type { RequestScope } from '@/modules/auth';
import type { Clock } from '@/modules/kernel/application/ports/clock';
import type { Logger } from '@/modules/kernel/application/ports/logger';
import { toUserId } from '@/modules/kernel/domain/ids';

import type { AccountRepository } from './ports/account-repository';
import type { AccountUpdateResult } from '../domain/account';
import { normalizeAccountName } from '../domain/account';
import { isAccountNamePresent } from '../domain/account-policy';

export type AccountUseCaseDeps = {
  accountRepository: AccountRepository;
  clock: Clock;
  logger: Logger;
};

export type UseCaseResult<T, TReason extends string> =
  | { ok: true; value: T }
  | { ok: false; reason: TReason };

export type SubmitOnboardingInput = {
  scope: RequestScope;
  name: string;
};

export async function submitOnboarding(
  deps: AccountUseCaseDeps,
  input: SubmitOnboardingInput
): Promise<UseCaseResult<AccountUpdateResult, 'invalid' | 'not_found'>> {
  if (!isAccountNamePresent(input.name))
    return { ok: false, reason: 'invalid' };

  const currentUserId = toUserId(input.scope.userId);
  deps.logger.info('account.submit_onboarding', {
    event: 'account.submit_onboarding',
    userId: currentUserId,
  });
  const value = await deps.accountRepository.submitOnboarding(currentUserId, {
    name: normalizeAccountName(input.name),
    onboardedAt: deps.clock.now(),
  });
  if (!value) return { ok: false, reason: 'not_found' };
  return { ok: true, value };
}

export type UpdateAccountInfoInput = {
  scope: RequestScope;
  name: string;
};

export async function updateAccountInfo(
  deps: AccountUseCaseDeps,
  input: UpdateAccountInfoInput
): Promise<UseCaseResult<AccountUpdateResult, 'invalid' | 'not_found'>> {
  if (!isAccountNamePresent(input.name))
    return { ok: false, reason: 'invalid' };

  const currentUserId = toUserId(input.scope.userId);
  deps.logger.info('account.update_info', {
    event: 'account.update_info',
    userId: currentUserId,
  });
  const value = await deps.accountRepository.updateInfo(currentUserId, {
    name: normalizeAccountName(input.name),
  });
  if (!value) return { ok: false, reason: 'not_found' };
  return { ok: true, value };
}

export function createAccountUseCases(deps: AccountUseCaseDeps) {
  return {
    submitOnboarding: (input: SubmitOnboardingInput) =>
      submitOnboarding(deps, input),
    updateInfo: (input: UpdateAccountInfoInput) =>
      updateAccountInfo(deps, input),
  };
}

export type AccountUseCases = ReturnType<typeof createAccountUseCases>;
