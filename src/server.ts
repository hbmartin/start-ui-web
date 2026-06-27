import { wrapFetchWithSentry } from '@sentry/tanstackstart-react';
import handler, {
  createServerEntry,
  type ServerEntry,
} from '@tanstack/react-start/server-entry';
import { randomUUID } from 'node:crypto';
import '../instrument.server.mjs';
// Fail-closed configuration validation at server boot. This module self-invokes
// validateServerConfig() on load, so a production process with insecure or
// missing configuration (weak AUTH_SECRET, cleartext DB/Redis URLs, …) refuses
// to start instead of failing lazily on the first request. Must run before any
// request handling below.
import '@/modules/kernel/infrastructure/config/server';

import type { AppStartRequestContext } from './start';

const requestHandler: ServerEntry = wrapFetchWithSentry({
  fetch(request) {
    return handler.fetch(request, {
      context: {
        requestId: randomUUID(),
      } satisfies AppStartRequestContext,
    });
  },
});

export default createServerEntry(requestHandler);
