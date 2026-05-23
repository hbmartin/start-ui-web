import type { AuthUseCaseDeps } from './types';

export async function sendSignInOtp(
  deps: AuthUseCaseDeps,
  input: { email: string; otp: string; language: string }
): Promise<void> {
  await deps.authEmailPort.sendSignInOtp(input);
}
