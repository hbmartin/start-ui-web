import { z } from 'zod';

import {
  baseEnvSchema,
  isProdRuntimeEnvironment,
  parseEnv,
  zNonEmptyEnvString,
} from './env-schema';

const PLACEHOLDER_EMAIL_SECRET_VALUES = new Set([
  'changeme',
  'change-me',
  'change_me',
  'replace me',
  'secret',
  'webhook-secret',
]);

const isPlaceholderEmailSecret = (value: string) =>
  PLACEHOLDER_EMAIL_SECRET_VALUES.has(value.trim().toLowerCase());

const emailEnvSchema = baseEnvSchema
  .extend({
    RESEND_API_KEY: zNonEmptyEnvString(),
    RESEND_WEBHOOK_SECRET: z.string().trim().optional(),
    RESEND_WEBHOOK_MAX_BYTES: z.coerce.number().int().positive().optional(),
    EMAIL_FROM: zNonEmptyEnvString(),
    EMAIL_DELIVERY_DISABLED: z.stringbool().default(false),
  })
  .superRefine((env, ctx) => {
    if (!isProdRuntimeEnvironment(env)) return;

    if (isPlaceholderEmailSecret(env.RESEND_API_KEY)) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'Update RESEND_API_KEY for production',
      });
    }

    if (
      env.RESEND_WEBHOOK_SECRET &&
      isPlaceholderEmailSecret(env.RESEND_WEBHOOK_SECRET)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_WEBHOOK_SECRET'],
        message:
          'RESEND_WEBHOOK_SECRET must not use a placeholder value in production',
      });
    }
  });

export type EmailConfig = {
  resendApiKey: string;
  resendWebhookSecret?: string;
  resendWebhookMaxBytes: number;
  from: string;
  deliveryDisabled: boolean;
};

let cachedEmailConfig: EmailConfig | undefined;

export function getEmailConfig(): EmailConfig {
  if (cachedEmailConfig) return cachedEmailConfig;

  const env = parseEnv(emailEnvSchema);
  cachedEmailConfig = {
    resendApiKey: env.RESEND_API_KEY,
    resendWebhookSecret: env.RESEND_WEBHOOK_SECRET,
    resendWebhookMaxBytes: env.RESEND_WEBHOOK_MAX_BYTES ?? 1_000_000,
    from: env.EMAIL_FROM,
    deliveryDisabled: env.EMAIL_DELIVERY_DISABLED,
  };
  return cachedEmailConfig;
}
