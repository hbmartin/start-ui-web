# Architecture rules

Quick reference for agents. The authoritative source is `AGENTS.md` + `ARCHITECTURE.md`.

## Imports

- Cross-module imports go through public gates only: `index.ts`, `server.ts`, `client.ts`, `presentation.ts`. Never deep-import another module's `domain/`, `application/`, `infrastructure/`, `transport/`. Exception: `kernel` is universally importable.
- `src/components/`, `src/hooks/`, `src/lib/` may not import any module's `domain/`, `application/`, `infrastructure/`, `transport/`. They may import other modules' public gates only when truly needed.
- `process.env` is allowed only in `src/modules/kernel/infrastructure/config/` and a small allowlist of config files. Use `envClient` / `envServer`.
- `drizzle-orm` / `pg` / `postgres` are allowed only in `*/infrastructure/`, `src/composition/`, `drizzle/`.
- `better-auth` server APIs (`betterAuth`, `drizzleAdapter`, server-side plugins) are allowed only in `src/modules/auth/infrastructure/` and `src/composition/auth.ts`. `better-auth/react` and `better-auth/client/plugins` are allowed in `src/modules/auth/presentation/client.ts` (will be wrapped in stable hooks during Phase 2).
- `src/features/` and `src/server/` are forbidden; if you are tempted to add either, use a module instead.

## Schemas

- `src/modules/*/presentation/schema.ts` may not import `i18next` or `react-i18next`. Emit error codes (e.g., `error: 'book:common.title.required'`); the UI translates at render through `src/components/form/form-field-error.tsx`.

## Errors

- Throw `AppError` from `src/modules/kernel/domain/errors/app-error.ts`, not `new Error(...)`, anywhere in application/transport/infrastructure code. Tests are exempt.
- Use-cases return `{ ok: true, value }` / `{ ok: false, reason }` for expected outcomes; reserve thrown errors for exceptional invariants.

## Routes

- TanStack Start route loaders that read search params must declare `loaderDeps`. Validate search with `validateSearch`. Undeclared loader dependencies break caching and preloading.
- Route guards (`beforeLoad`) are UI/navigation gates, not security boundaries. Server functions and HTTP handlers must validate session/permissions independently.

## Logging

- Do not log tokens, secrets, passwords, or `Authorization` headers. Use structured objects with an `event` key.

## Redirects

- Validate redirect targets against an allowlist. Do not pass raw `req.X.Y` into `redirect()` or `Response.redirect()`.

## Tests

- `*.unit.spec.ts` for unit/integration tests (Vitest node project).
- `*.browser.spec.tsx` for component tests (Vitest browser project with Playwright runner).
- `e2e/*.spec.ts` for end-to-end (Playwright).
- `*.fixture.tsx` for Cosmos design fixtures (not a substitute for browser tests on form/page logic).
