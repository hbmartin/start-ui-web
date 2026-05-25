import * as Sentry from '@sentry/tanstackstart-react';

import { envClient } from '@/platform/env/client';

let clientInitialized = false;

export const isSentryEnabled = () => Boolean(envClient.VITE_SENTRY_DSN);

export function initSentryForRouter(router: unknown) {
  if (clientInitialized || !isSentryEnabled()) return;
  if (typeof window === 'undefined') return;
  clientInitialized = true;

  Sentry.init({
    dsn: envClient.VITE_SENTRY_DSN,
    sendDefaultPii: false,
    tracesSampleRate: envClient.VITE_SENTRY_TRACES_SAMPLE_RATE,
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
  });
}

export function captureRouteError(error: unknown) {
  if (!isSentryEnabled()) return;
  Sentry.captureException(error);
}
