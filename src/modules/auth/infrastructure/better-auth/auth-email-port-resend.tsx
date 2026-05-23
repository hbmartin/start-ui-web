import i18n from '@/lib/i18n';

import TemplateLoginCode from '@/emails/templates/login-code';
import { sendEmail } from '@/modules/kernel/infrastructure/email/resend';

import type {
  AuthEmailPort,
  SendSignInOtpInput,
} from '../../application/ports/auth-email-port';

export class AuthEmailPortResend implements AuthEmailPort {
  async sendSignInOtp(input: SendSignInOtpInput): Promise<void> {
    await sendEmail({
      to: input.email,
      subject: i18n.t('emails:loginCode.subject', { lng: input.language }),
      template: (
        <TemplateLoginCode language={input.language} code={input.otp} />
      ),
    });
  }
}
