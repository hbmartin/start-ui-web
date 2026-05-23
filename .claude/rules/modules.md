# Module rules

Quick reference. The authoritative source is `AGENTS.md` + `ARCHITECTURE.md`.

## Shape

```
src/modules/<feature>/
  index.ts            ← public gate: domain types, ports, factory, constants
  server.ts           ← optional: server-only public API
  client.ts           ← optional: client-only public API
  presentation.ts     ← optional: React components for external mounting
  factory.ts          ← createXxxUseCases(deps): pure
  config/             ← optional: typed configuration parsing
  domain/             ← pure types, policies, errors; no IO
  application/
    ports/            ← interfaces the use cases need from outside
    use-cases/        ← orchestration; returns Result<T> unions
    cache/            ← optional: cache policies (cache-aside)
  infrastructure/
    drizzle/          ← repository adapters
    <vendor>/         ← provider-specific adapters
  transport/
    http/             ← HTTP handler functions
    tanstack/         ← TanStack server function wrappers
    upload/           ← optional
  presentation/
    app/              ← public app surface
    manager/          ← admin surface
    queries.ts        ← TanStack Query queryOptions for this module
    schema.ts         ← Zod schemas (NO i18n imports — error codes only)
```

Only add a folder when you need it.

## Layer dependency rules

| Layer | Allowed | Forbidden |
|---|---|---|
| `domain/` | Pure TS, kernel domain types. | React, router, Query, infrastructure, transport, SDKs. |
| `application/` | Own domain, own ports, kernel domain + application ports. | Infrastructure, transport, React, router, Query. |
| `infrastructure/` | Own ports, own domain, kernel, SDKs. | Other modules' internals. |
| `transport/` | Own application (via composition), own domain types, kernel transport helpers. | Own infrastructure directly, other modules' internals. |
| `presentation/` | Own queries/schemas, kernel presentation, other modules' public gates, `src/components`, `src/hooks`, `src/lib`. | Own infrastructure directly. |

## Public gates

Cross-module imports must go through exactly one of:

| File | What it exports |
|---|---|
| `index.ts` | Domain types, port interfaces, factory function, stable constants/schemas. |
| `server.ts` | Server-only public API (composed use-case accessors, server context helpers). |
| `client.ts` | Client-only public API (config constants, form schemas, browser hooks). |
| `presentation.ts` | React components, the module's `queries` object. |

`kernel` is the only module whose internals other modules may import.

## Composition root

`src/composition/<feature>.ts` is the only place outside `infrastructure/` and the `kernel` composition root that constructs adapters and wires the factory.

```ts
const buildFooUseCases = (overrides?: FooCompositionOverrides) => {
  const kernel = getKernel({ overrides });
  return createFooUseCases({
    fooRepository: overrides?.fooRepository ?? new FooRepositoryDrizzle(kernel.db),
    logger: kernel.logger,
  });
};

const getCachedFooUseCases = createCachedFactory(() => buildFooUseCases());

export function getFooUseCases(options?: { overrides?: FooCompositionOverrides }) {
  if (hasDefinedOverrides(options?.overrides)) return buildFooUseCases(options.overrides);
  return getCachedFooUseCases(false);
}
```

## Adding a module

1. Create `src/modules/<feature>/` with at minimum `domain/`, `application/{ports,use-cases}/`, `infrastructure/`, `presentation/`, `factory.ts`, `index.ts`.
2. Add `server.ts`, `client.ts`, `presentation.ts` only when external consumers exist.
3. Add `src/composition/<feature>.ts` using `createCachedFactory`.
4. At minimum: one use-case unit test under `application/__tests__/`; one `*.browser.spec.tsx` if there is form or page logic.
5. Update the module table in `ARCHITECTURE.md`.

## Results and errors

- Use-cases return `{ ok: true, value }` / `{ ok: false, reason: '...' }` for expected outcomes.
- Throw `AppError` (`src/modules/kernel/domain/errors/app-error.ts`) for exceptional invariants.
- Never `throw new Error(...)` in application/transport/infrastructure code.
