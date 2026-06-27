import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createServerEntry: vi.fn((entry: unknown) => entry),
  handlerFetch: vi.fn(async () => new Response('ok')),
  wrapFetchWithSentry: vi.fn((entry: unknown) => entry),
}));

vi.mock('@sentry/tanstackstart-react', () => ({
  wrapFetchWithSentry: mocks.wrapFetchWithSentry,
}));

vi.mock('@tanstack/react-start/server-entry', () => ({
  default: {
    fetch: mocks.handlerFetch,
  },
  createServerEntry: mocks.createServerEntry,
}));

// The server entry imports the config boot module for its fail-closed
// self-invoking `validateServerConfig()` side effect. Stub it here so the unit
// test does not require a full production env to load `@/server`.
vi.mock('@/modules/kernel/infrastructure/config/server', () => ({}));

describe('server entry', () => {
  it('passes a request id through Start request context', async () => {
    const server = (await import('@/server')).default as {
      fetch: (request: Request) => Promise<Response>;
    };
    const request = new Request('https://app.example/');

    await server.fetch(request);

    expect(mocks.handlerFetch).toHaveBeenCalledWith(
      request,
      expect.objectContaining({
        context: {
          requestId: expect.any(String),
        },
      })
    );
  });

  it('wires fail-closed config validation at boot (H1 regression)', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/server.ts'),
      'utf8'
    );
    // validateServerConfig() self-invokes when this module loads, so the import
    // must be present in the server entry for boot-time validation to run.
    expect(source).toContain(
      "import '@/modules/kernel/infrastructure/config/server'"
    );
  });
});
