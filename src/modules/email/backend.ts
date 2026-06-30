import type { Logger, TransactionRunner } from '@/modules/kernel';
import {
  appErrorToResponse,
  createTransactionRunner,
  getDefaultDbClient,
  getEmailConfig,
  getHttpConfig,
} from '@/modules/kernel/backend';

import { createEmailUseCases, type EmailTransactionContext } from './index';
import { createEmailStatusRepository } from './infrastructure/drizzle/email-status-repository-drizzle';
import { EmailGatewayResend } from './infrastructure/resend/email-gateway-resend';
import { ResendWebhookVerifier } from './infrastructure/resend/resend-webhook-verifier';
import { EmailGatewaySmtp } from './infrastructure/smtp/email-gateway-smtp';
import {
  createResendWebhookHandlers,
  type ResendWebhookHandlers,
} from './transport/http/resend-webhook-handlers';

export {
  createEmailStatusRepository,
  EmailGatewayResend,
  EmailGatewaySmtp,
  ResendWebhookVerifier,
};

/**
 * Telemetry-backed observability is injected by the caller (the HTTP route
 * sources it from `getKernel().logger`). This server gate stays free of the
 * telemetry service-locator and of `@/composition`, which would otherwise form
 * a dependency cycle through `composition/email`.
 */
export type ResendWebhookRequestDeps = {
  logger?: Pick<Logger, 'warn'>;
};

type EmailServerRuntimeDeps = {
  handlers: ResendWebhookHandlers;
};

const createEmailStatusTransactionRunner =
  (): TransactionRunner<EmailTransactionContext> => {
    const db = getDefaultDbClient();
    const transactionRunner = createTransactionRunner(db);

    return {
      run: (work, options) =>
        transactionRunner.run(
          (tx) =>
            work({
              emailStatusRepository: createEmailStatusRepository({ db: tx }),
            }),
          options
        ),
    };
  };

const createDefaultEmailUseCases = () => {
  const db = getDefaultDbClient();
  return createEmailUseCases({
    emailStatusRepository: createEmailStatusRepository({ db }),
    transactionRunner: createEmailStatusTransactionRunner(),
  });
};

const getDeps = (deps: ResendWebhookRequestDeps): EmailServerRuntimeDeps => ({
  handlers: createResendWebhookHandlers({
    getUseCases: createDefaultEmailUseCases,
    logger: deps.logger,
    maxBodyBytes: getEmailConfig().resendWebhookMaxBytes,
    trustedProxyDepth: getHttpConfig().trustedProxyDepth,
    verifier: new ResendWebhookVerifier(),
  }),
});

export async function handleResendWebhookRequest(
  request: Request,
  deps: ResendWebhookRequestDeps = {}
) {
  try {
    const { handlers } = getDeps(deps);
    return await handlers.receive(request);
  } catch (error) {
    return appErrorToResponse(error);
  }
}
