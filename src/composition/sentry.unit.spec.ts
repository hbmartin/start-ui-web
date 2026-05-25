import { describe, expect, it, vi } from 'vitest';

const sentryMocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  init: vi.fn(),
  tanstackRouterBrowserTracingIntegration: vi.fn(() => 'router-tracing'),
}));

vi.mock('@sentry/tanstackstart-react', () => ({
  captureException: sentryMocks.captureException,
  init: sentryMocks.init,
  tanstackRouterBrowserTracingIntegration:
    sentryMocks.tanstackRouterBrowserTracingIntegration,
}));

vi.mock('@/platform/env/client', () => ({
  envClient: {
    VITE_SENTRY_DSN: '',
    VITE_SENTRY_TRACES_SAMPLE_RATE: 0,
  },
}));

describe('sentry composition', () => {
  it('is a no-op when no DSN is configured', async () => {
    const { captureRouteError, initSentryForRouter, isSentryEnabled } =
      await import('./sentry');

    expect(isSentryEnabled()).toBe(false);

    initSentryForRouter({});
    captureRouteError(new Error('boom'));

    expect(sentryMocks.init).not.toHaveBeenCalled();
    expect(sentryMocks.captureException).not.toHaveBeenCalled();
  });
});
