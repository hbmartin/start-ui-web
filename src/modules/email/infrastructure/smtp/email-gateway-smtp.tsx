import { Result } from '@bloodyowl/boxed';
import { render } from '@react-email/render';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { connect, type Socket } from 'node:net';
import { createInterface } from 'node:readline';
import type { ReactElement } from 'react';

import {
  EMAIL_PROVIDER_SMTP,
  type EmailGateway,
  type EmailMetadata,
  type EmailTransactionContext,
  type RecordEmailSendAttemptInput,
  type SendEmailParams,
} from '@/modules/email';
import {
  AppError,
  toEmailProviderMessageId,
  toEmailRecipientList,
  type TransactionRunner,
} from '@/modules/kernel';
import { getEmailConfig } from '@/modules/kernel/backend';

type EmailGatewaySmtpDeps = {
  statusTransactionRunner: TransactionRunner<EmailTransactionContext>;
};

type SendEmailResult = Awaited<ReturnType<EmailGateway['sendEmail']>>;

type SmtpServerConfig = {
  host: string;
  port: number;
  username?: string;
  password?: string;
};

type SmtpMessage = {
  from: string;
  recipients: string[];
  raw: string;
};

const smtpTimeoutMs = 15_000;

const recipientToStatusValue = (recipient: SendEmailParams['to']) =>
  toEmailRecipientList(
    Array.isArray(recipient) ? recipient.join(', ') : recipient
  );

const splitRecipients = (
  recipient: SendEmailParams['to'] | undefined
): string[] => {
  if (!recipient) return [];
  const values = Array.isArray(recipient) ? recipient : [recipient];

  return values.flatMap((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  );
};

const extractAddress = (value: string) => {
  const trimmed = value.trim();
  const start = trimmed.lastIndexOf('<');
  if (start < 0) return trimmed;

  const end = trimmed.indexOf('>', start + 1);
  if (end <= start) return trimmed;

  return trimmed.slice(start + 1, end).trim();
};

const sanitizeHeaderValue = (value: string) =>
  value.replace(/[\r\n]+/g, ' ').trim();

const encodeHeaderValue = (value: string) => {
  const sanitized = sanitizeHeaderValue(value);
  if (/^[\x20-\x7e]*$/.test(sanitized)) return sanitized;
  return `=?UTF-8?B?${Buffer.from(sanitized, 'utf8').toString('base64')}?=`;
};

const dotStuff = (value: string) =>
  value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');

const smtpExternalId = (idempotencyKey: string) =>
  toEmailProviderMessageId(
    `smtp_${createHash('sha256').update(idempotencyKey).digest('hex')}`
  );

const providerErrorMetadata = (error: unknown): EmailMetadata => {
  const metadata: EmailMetadata = {
    providerError: {
      provider: EMAIL_PROVIDER_SMTP,
      message: error instanceof Error ? error.message : String(error),
    },
  };

  return metadata;
};

const idempotencyKeyError = () =>
  new AppError({
    code: 'EMAIL_IDEMPOTENCY_KEY_REQUIRED',
    category: 'system',
    status: 500,
    message: 'Email sends require a non-empty idempotency key',
  });

const missingEmailServerError = () =>
  new AppError({
    code: 'EMAIL_SMTP_SERVER_NOT_CONFIGURED',
    category: 'system',
    status: 500,
    message: 'EMAIL_SERVER must be configured for SMTP email delivery',
  });

const unsupportedEmailServerError = (server: string) =>
  new AppError({
    code: 'EMAIL_SMTP_SERVER_UNSUPPORTED',
    category: 'system',
    status: 500,
    message: 'EMAIL_SERVER must use the smtp:// protocol',
    details: { server },
  });

const smtpProtocolError = (
  message: string,
  details?: Record<string, unknown>
) =>
  new AppError({
    code: 'EMAIL_SMTP_PROTOCOL_ERROR',
    category: 'system',
    status: 500,
    message,
    ...(details ? { details } : {}),
  });

const smtpTimeoutError = () =>
  new AppError({
    code: 'EMAIL_SMTP_TIMEOUT',
    category: 'system',
    status: 504,
    message: 'SMTP connection timed out',
  });

const parseSmtpServer = (server: string): SmtpServerConfig => {
  const url = new URL(server);
  if (url.protocol !== 'smtp:') {
    throw unsupportedEmailServerError(server);
  }

  const port = url.port ? Number.parseInt(url.port, 10) : 25;
  return {
    host: url.hostname === '0.0.0.0' ? '127.0.0.1' : url.hostname,
    port,
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
  };
};

const buildSmtpMessage = (input: {
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo: string[];
  subject: string;
  html: string;
  text: string;
  messageId: string;
  headers?: Record<string, string>;
}): SmtpMessage => {
  const boundary = `start-ui-${createHash('sha256')
    .update(input.messageId)
    .digest('hex')}`;
  const recipients = [...input.to, ...input.cc, ...input.bcc];
  const headers = [
    `From: ${sanitizeHeaderValue(input.from)}`,
    `To: ${input.to.map(sanitizeHeaderValue).join(', ')}`,
    ...(input.cc.length
      ? [`Cc: ${input.cc.map(sanitizeHeaderValue).join(', ')}`]
      : []),
    ...(input.replyTo.length
      ? [`Reply-To: ${input.replyTo.map(sanitizeHeaderValue).join(', ')}`]
      : []),
    `Subject: ${encodeHeaderValue(input.subject)}`,
    `Message-ID: <${sanitizeHeaderValue(input.messageId)}>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ...(input.headers
      ? Object.entries(input.headers).map(
          ([key, value]) =>
            `${sanitizeHeaderValue(key)}: ${sanitizeHeaderValue(value)}`
        )
      : []),
  ];
  const raw = [
    ...headers,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.text,
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.html,
    `--${boundary}--`,
    '',
  ].join('\r\n');

  return {
    from: extractAddress(input.from),
    recipients: recipients.map(extractAddress),
    raw,
  };
};

const parseSmtpCode = (line: string) => {
  const code = Number.parseInt(line.slice(0, 3), 10);
  if (Number.isNaN(code)) {
    throw smtpProtocolError('Malformed SMTP response', { response: line });
  }
  return code;
};

const readSmtpResponse = async (
  lines: AsyncIterator<string>,
  command: string
) => {
  const responseLines: string[] = [];

  while (true) {
    const result = await lines.next();
    if (result.done) {
      throw smtpProtocolError('SMTP connection closed while waiting', {
        command,
      });
    }

    responseLines.push(result.value);
    if (/^\d{3} /.test(result.value)) {
      return {
        code: parseSmtpCode(result.value),
        text: responseLines.join('\n'),
      };
    }
  }
};

const expectSmtpResponse = async (
  lines: AsyncIterator<string>,
  command: string,
  expectedCodes: number[]
) => {
  const response = await readSmtpResponse(lines, command);
  if (!expectedCodes.includes(response.code)) {
    throw smtpProtocolError('SMTP command failed', {
      code: response.code,
      command,
      response: response.text,
    });
  }
  return response;
};

const writeSmtpLine = (socket: Socket, line: string) => {
  socket.write(`${line}\r\n`);
};

const sendSmtpMessage = async (
  config: SmtpServerConfig,
  message: SmtpMessage
) => {
  const socket = connect({ host: config.host, port: config.port });
  let socketError: Error | undefined;
  socket.on('error', (error) => {
    socketError = error;
  });
  socket.setTimeout(smtpTimeoutMs);
  socket.on('timeout', () => {
    socket.destroy(smtpTimeoutError());
  });
  const lineReader = createInterface({ input: socket, crlfDelay: Infinity });
  const lines = lineReader[Symbol.asyncIterator]();

  try {
    await once(socket, 'connect');
    await expectSmtpResponse(lines, 'greeting', [220]);

    writeSmtpLine(socket, 'EHLO start-ui.local');
    await expectSmtpResponse(lines, 'EHLO', [250]);

    if (config.username || config.password) {
      const auth = Buffer.from(
        `\0${config.username ?? ''}\0${config.password ?? ''}`,
        'utf8'
      ).toString('base64');
      writeSmtpLine(socket, `AUTH PLAIN ${auth}`);
      await expectSmtpResponse(lines, 'AUTH PLAIN', [235]);
    }

    writeSmtpLine(socket, `MAIL FROM:<${message.from}>`);
    await expectSmtpResponse(lines, 'MAIL FROM', [250]);

    for (const recipient of message.recipients) {
      writeSmtpLine(socket, `RCPT TO:<${recipient}>`);
      await expectSmtpResponse(lines, 'RCPT TO', [250, 251]);
    }

    writeSmtpLine(socket, 'DATA');
    await expectSmtpResponse(lines, 'DATA', [354]);
    socket.write(`${dotStuff(message.raw)}\r\n.\r\n`);
    await expectSmtpResponse(lines, 'message body', [250]);

    writeSmtpLine(socket, 'QUIT');
    await expectSmtpResponse(lines, 'QUIT', [221]);
  } catch (error) {
    throw socketError ?? error;
  } finally {
    lineReader.close();
    socket.end();
  }
};

export class EmailGatewaySmtp implements EmailGateway {
  private readonly statusTransactionRunner: TransactionRunner<EmailTransactionContext>;

  constructor(deps: EmailGatewaySmtpDeps) {
    this.statusTransactionRunner = deps.statusTransactionRunner;
  }

  private recordSendAttempt(input: RecordEmailSendAttemptInput) {
    return this.statusTransactionRunner.run(({ emailStatusRepository }) =>
      emailStatusRepository.recordSendAttempt(input)
    );
  }

  private upsertStatusByExternalId(
    input: SendEmailParams,
    externalId: ReturnType<typeof smtpExternalId>
  ) {
    const recipient = recipientToStatusValue(input.to);
    return this.statusTransactionRunner.run(({ emailStatusRepository }) =>
      emailStatusRepository.upsertStatusByExternalId({
        provider: EMAIL_PROVIDER_SMTP,
        externalId,
        recipient,
        subject: input.subject,
        status: 'sent',
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata,
      })
    );
  }

  async sendEmail(
    input: SendEmailParams
  ): ReturnType<EmailGateway['sendEmail']> {
    if (!input.idempotencyKey.trim()) {
      return Result.Error(idempotencyKeyError());
    }

    const emailConfig = getEmailConfig();
    if (emailConfig.deliveryDisabled) {
      return Result.Ok({
        type: 'email_send_skipped',
        provider: EMAIL_PROVIDER_SMTP,
      });
    }
    const emailServer = emailConfig.server;
    if (!emailServer) {
      return Result.Error(missingEmailServerError());
    }

    const recipient = recipientToStatusValue(input.to);
    const attemptResult = await this.recordSendAttempt({
      provider: EMAIL_PROVIDER_SMTP,
      recipient,
      subject: input.subject,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
    });
    if (attemptResult.isError()) return Result.Error(attemptResult.getError());

    const attempt = attemptResult.get().record;
    if (attempt.externalId) {
      return Result.Ok({
        type: 'email_send_recorded',
        provider: EMAIL_PROVIDER_SMTP,
        externalId: attempt.externalId,
      });
    }

    const recordFailedAttempt = async (
      metadata?: EmailMetadata
    ): Promise<SendEmailResult | null> => {
      const failedAttemptResult = await this.recordSendAttempt({
        provider: EMAIL_PROVIDER_SMTP,
        recipient,
        subject: input.subject,
        idempotencyKey: input.idempotencyKey,
        status: 'send_failed',
        metadata: {
          ...input.metadata,
          ...metadata,
        },
      });
      if (failedAttemptResult.isError()) {
        return Result.Error(failedAttemptResult.getError());
      }

      const failedAttempt = failedAttemptResult.get().record;
      if (failedAttempt.externalId) {
        return Result.Ok({
          type: 'email_send_recorded',
          provider: EMAIL_PROVIDER_SMTP,
          externalId: failedAttempt.externalId,
        });
      }

      return null;
    };

    const renderFailed = async (error: unknown): Promise<SendEmailResult> => {
      const failedAttempt = await recordFailedAttempt(
        providerErrorMetadata(error)
      );
      if (failedAttempt) return failedAttempt;

      return Result.Error(
        new AppError({
          code: 'EMAIL_RENDER_FAILED',
          category: 'system',
          status: 500,
          message: 'Failed to render email',
          cause: error,
        })
      );
    };

    const htmlResult = await Result.fromPromise(
      render(input.template as ReactElement)
    );
    if (htmlResult.isError()) {
      return renderFailed(htmlResult.getError());
    }

    const textResult = await Result.fromPromise(
      render(input.template as ReactElement, {
        plainText: true,
      })
    );
    if (textResult.isError()) {
      return renderFailed(textResult.getError());
    }

    const html = htmlResult.get();
    const text = textResult.get();
    const externalId = smtpExternalId(input.idempotencyKey);
    const serverResult = await Result.fromPromise(
      Promise.resolve().then(() =>
        sendSmtpMessage(
          parseSmtpServer(emailServer),
          buildSmtpMessage({
            from: emailConfig.from,
            to: splitRecipients(input.to),
            cc: splitRecipients(input.cc),
            bcc: splitRecipients(input.bcc),
            replyTo: splitRecipients(input.replyTo),
            subject: input.subject,
            html,
            text,
            messageId: `${externalId}@start-ui.local`,
            headers: input.headers,
          })
        )
      )
    );
    if (serverResult.isError()) {
      const failedAttempt = await recordFailedAttempt(
        providerErrorMetadata(serverResult.getError())
      );
      if (failedAttempt) return failedAttempt;

      return Result.Error(
        new AppError({
          code: 'EMAIL_SEND_FAILED',
          category: 'system',
          status: 500,
          message: 'Failed to send email',
          cause: serverResult.getError(),
        })
      );
    }

    const upsertResult = await this.upsertStatusByExternalId(input, externalId);
    if (upsertResult.isError()) return Result.Error(upsertResult.getError());

    return Result.Ok({
      type: 'email_send_recorded',
      provider: EMAIL_PROVIDER_SMTP,
      externalId,
    });
  }
}
