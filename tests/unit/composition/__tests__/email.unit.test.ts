import { Result } from '@bloodyowl/boxed';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EmailOverrides } from '@/composition/email';
import type { EmailStatusRepository } from '@/modules/email';
import { toEmailIdempotencyKey, toEmailRecipientList } from '@/modules/kernel';

const testState = vi.hoisted(() => {
  const makeEmailConfig = () => ({
    resendApiKey: 'resend-api-key',
    resendWebhookSecret: 'resend-webhook-secret',
    resendWebhookMaxBytes: 1_000_000,
    server: undefined as string | undefined,
    from: 'Start UI <noreply@example.com>',
    deliveryDisabled: true,
  });

  return {
    emailConfig: makeEmailConfig(),
    makeEmailConfig,
  };
});

vi.mock('@/modules/kernel/backend', () => ({
  createTelemetryLogger: () => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
  getEmailConfig: () => testState.emailConfig,
}));

const makeStatusRepository = (): EmailStatusRepository =>
  ({
    recordSendAttempt: vi.fn(async () =>
      Result.Ok({
        type: 'email_status_recorded' as const,
        record: null,
      })
    ),
    upsertStatusByExternalId: vi.fn(),
    getByExternalId: vi.fn(),
    listRecent: vi.fn(),
    countByStatus: vi.fn(),
  }) as unknown as EmailStatusRepository;

const makeOverrides = (): EmailOverrides => ({
  db: {} as NonNullable<EmailOverrides['db']>,
  emailStatusRepository: makeStatusRepository(),
});

describe('email composition', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    Object.assign(testState.emailConfig, testState.makeEmailConfig());
    const { __resetEmailComposition } = await import('@/composition/email');
    __resetEmailComposition();
  });

  it('selects the SMTP gateway when EMAIL_SERVER is configured', async () => {
    testState.emailConfig.server = 'smtp://127.0.0.1:1025';
    const { getEmailGateway } = await import('@/composition/email');

    const result = await getEmailGateway(makeOverrides()).sendEmail({
      to: toEmailRecipientList('user@example.com'),
      subject: 'Login code',
      template: createElement('div', null, '123456'),
      idempotencyKey: toEmailIdempotencyKey('key-1'),
    });

    expect(result).toMatchObject({
      tag: 'Ok',
      value: {
        type: 'email_send_skipped',
        provider: 'smtp',
      },
    });
  });

  it('selects the Resend gateway when EMAIL_SERVER is not configured', async () => {
    const { getEmailGateway } = await import('@/composition/email');

    const result = await getEmailGateway(makeOverrides()).sendEmail({
      to: toEmailRecipientList('user@example.com'),
      subject: 'Login code',
      template: createElement('div', null, '123456'),
      idempotencyKey: toEmailIdempotencyKey('key-1'),
    });

    expect(result).toMatchObject({
      tag: 'Ok',
      value: {
        type: 'email_send_skipped',
        provider: 'resend',
      },
    });
  });
});
