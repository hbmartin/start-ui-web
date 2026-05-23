# Architecture

This document is the deep-reference companion to `AGENTS.md`. Read `AGENTS.md` first for the canonical-commands and "where do I put X" summary; read this for the why and the full map.

## At a glance

```
Browser, admin UI, external systems
        │
        ▼
   TanStack Start (Vite + Nitro)
        │
        ├──▶ routes/              file-based routes, thin
        │      └──▶ layout/       page chrome (nav, layout)
        │             └──▶ modules/<feature>/presentation/   React components
        │
        ├──▶ routes/api/          HTTP route handlers
        │      └──▶ modules/<feature>/transport/http/        HTTP adapters
        │
        ├──▶ TanStack server functions
        │      └──▶ modules/<feature>/transport/tanstack/    server function adapters
        │
        └──▶ composition/         DI wiring (singletons + overrides)
               └──▶ modules/<feature>/factory.ts             pure use-case factory
                      └──▶ application/use-cases/            orchestration
                             └──▶ application/ports/         IO contracts
                                    └──▶ infrastructure/     SDKs, Drizzle, Resend, better-auth
                             └──▶ domain/                    pure business types and policies
```

Dependency direction is strictly inward: transport/presentation → composition → application use-cases → domain; use-cases consume ports; infrastructure implements ports.

## Module shape

Every business module under `src/modules/` follows the same shape. Folders are added only when needed.

```
modules/<feature>/
  index.ts            ← public gate: domain types, ports, factory, constants
  server.ts           ← optional: server-only public API
  client.ts           ← optional: client-only public API
  presentation.ts     ← optional: React components for external mounting
  factory.ts          ← pure function: takes dependency instances → returns use cases
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
    upload/           ← optional: upload-specific transport
  presentation/
    app/              ← public app surface
    manager/          ← admin surface
    queries.ts        ← TanStack Query queryOptions for this module
    schema.ts         ← Zod schemas (NO i18n imports — error codes only)
```

### Public-gate matrix

| File | Read by | Exports |
|---|---|---|
| `index.ts` | Any module, any layer. | Domain types, port interfaces, factory function, stable constants/schemas. |
| `server.ts` | Routes, server functions, server-side composition. | Server-only context helpers (`withProtectedContext`, `assertPermission`), composed use-case accessors. |
| `client.ts` | Client-side React components, presentation of other modules. | Form schemas, config constants, browser hooks. |
| `presentation.ts` | Routes, layouts, other modules' presentation. | React components (`PageX`, `FormX`, `LayoutX`), the module's `queries` object. |

Anything else is private. The depcruise rule `no-cross-feature-deep-import` enforces this.

## Layer responsibilities

### Domain

Pure TypeScript. Defines entities, value objects, branded IDs, schemas, invariants, domain errors, pure decision functions.

Cannot import: React, router, Query, infrastructure, transport, ORMs, HTTP clients, SDKs, env.

Reference example: `src/modules/book/domain/book.ts`, `src/modules/book/domain/book-policy.ts`.

### Application

Owns use cases and orchestration. Coordinates repositories, gateways, clocks, ID generators, loggers through ports. Owns transaction boundaries, cache policy, idempotency, retries, dedupe, side-effect sequencing.

Returns explicit result unions for expected business outcomes (`{ ok: true, value }` / `{ ok: false, reason }`); throws `AppError` only for exceptional or invariant violations.

Cannot import: infrastructure adapters, transport, React, router, Query.

Reference example: `src/modules/book/application/use-cases/create-book.ts`, `src/modules/book/application/ports/book-repository.ts`.

### Infrastructure

Implements ports. Adapters translate external details (SDK shapes, DB rows, vendor errors) into application-level contracts. Vendor SDKs (Drizzle, better-auth, Resend, Better-Upload) live here and nowhere else.

Reference example: `src/modules/book/infrastructure/drizzle/book-repository-drizzle.ts`.

### Transport

Translates wire protocol into application calls. Parses/validates request bodies, headers, query strings, signatures. Maps domain/application errors to protocol responses.

Cannot contain business rules; cannot import its own infrastructure directly (must go through composition).

Reference example: `src/modules/book/transport/http/book-handlers.ts`, `src/modules/book/transport/tanstack/book-server-functions.ts`.

### Presentation

React components, queries, schemas. Consumes the module's own application via composition (server-side, via composed handlers) or via TanStack Query (client-side, via `queries.ts`).

Schemas in `presentation/schema.ts` emit error codes; the UI translates at render via `src/lib/zod/zod-error-to-message.ts` and `src/components/form/form-field-error.tsx`. **No `i18next` import in schemas.**

Reference example: `src/modules/book/presentation/app/page-book.tsx`, `src/modules/book/presentation/queries.ts`, `src/modules/book/presentation/schema.ts`.

## Composition root

`src/composition/<feature>.ts` is the only place where infrastructure adapters and use cases are wired together (outside infrastructure itself, which constructs SDKs).

Pattern:

```ts
const buildFooUseCases = (overrides?: FooCompositionOverrides) => {
  const kernel = getKernel({ overrides });
  return createFooUseCases({
    fooRepository: overrides?.fooRepository ?? new FooRepositoryDrizzle(kernel.db),
    logger: kernel.logger,
    // …
  });
};

const getCachedFooUseCases = createCachedFactory(() => buildFooUseCases());

export function getFooUseCases(options?: { overrides?: FooCompositionOverrides }) {
  if (hasDefinedOverrides(options?.overrides)) return buildFooUseCases(options.overrides);
  return getCachedFooUseCases(false);
}
```

Production calls `getFooUseCases()` and gets a cached singleton. Tests call `getFooUseCases({ overrides: { fooRepository: inMemoryRepo } })` and get a fresh instance.

Reference files: `src/composition/shared/singleton.ts` (the `createCachedFactory` helper), `src/composition/kernel.ts` (the kernel composition root), `src/composition/book.ts` (a clean exemplar).

## Module map

| Module | Owns | Public gates |
|---|---|---|
| `kernel` | Cross-cutting primitives: db, logger, clock, ID generator, cache, transaction runner, permission checker, errors, branded IDs, env, email infrastructure, storage infrastructure, HTTP/transport helpers. | `index.ts` |
| `account` | Authenticated user's own profile and account-info operations. | `index.ts`, `server.ts`, `presentation.ts` |
| `auth` | Sessions, sign-in flows, permissions; better-auth confined to `infrastructure/`. | `index.ts`, `server.ts`, `client.ts`, `presentation.ts` |
| `book` | Book CRUD, list, upload, presentation. | `index.ts`, `server.ts`, `presentation.ts` |
| `genre` | Genre selection (used by `book`). | `index.ts`, `server.ts`, `presentation.ts` |
| `runtime-config` | Server-pushed env identity and feature flags. | `index.ts`, `server.ts`, `presentation.ts` |
| `user` | Admin user management. | `index.ts`, `server.ts`, `presentation.ts` |

Planned additions during the in-flight reorganization (Phase 3): `dashboard`, `demo`, `devtools`, `home`, `build-info`. See `MIGRATION_NOTES` below.

## Routes and entry points

`src/routes/` is TanStack Start file-based routing. Routes are thin — they import presentation components from modules and wire layouts. The `routeTree.gen.ts` is auto-generated and committed.

Subtrees:
- `routes/app/` — authenticated app surface.
- `routes/manager/` — admin surface (separate guard).
- `routes/login/` — public auth flows.
- `routes/api/` — public HTTP endpoints (`auth.$.ts`, `upload.ts`, `dev.email.$template.ts`).
- `routes/__root.tsx` — root layout, providers, devtools panels.

Search params in a loader must be validated with `validateSearch` and passed through `loaderDeps`. Undeclared loader dependencies break caching and preloading correctness.

Authentication and authorization in routes:
- `beforeLoad` on `_authenticated`-style layout routes is the standard guard for redirect-on-unauthenticated.
- Route guards are UI/navigation gates, not security boundaries. Server functions and HTTP handlers must validate session and permissions independently.

## Data layer

- Schema: `drizzle/schema/*.ts`.
- Migrations: `drizzle/migrations/`, generated via `pnpm db:generate`; never hand-edit.
- Local development uses PGlite (in-memory Postgres).
- Repositories live in each module's `infrastructure/drizzle/` and implement a port. They translate DB rows into domain records and DB errors into `AppError`.
- Raw SQL goes through `escapeLikePattern()` helpers in the kernel; the `unescaped-like-pattern` semgrep rule enforces it.

## Error model

`AppError` is the base for structured application errors (`src/modules/kernel/domain/errors/app-error.ts`). It carries:

- `code: string` — stable identifier (e.g., `BOOK_DUPLICATE`).
- `category: 'bad_request' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'rate_limit' | 'system'`.
- `status: number` — HTTP mapping.
- Optional `details` (only exposed when `exposeDetails: true`).

Central mappers:
- `src/modules/kernel/transport/http/error-mapper.ts` for HTTP responses.
- `src/modules/kernel/transport/tanstack/result-mapper.ts` for TanStack server function errors.

Use-cases return discriminated results (`{ ok: true, value }` / `{ ok: false, reason: '...' }`) for expected outcomes. Throw `AppError` only for exceptional invariants.

## Observability

- Logger port: `src/modules/kernel/application/ports/logger.ts`, Pino adapter in `src/modules/kernel/infrastructure/logger/pino.ts`.
- Composition resolves the production logger and passes it as `kernel.logger`.
- Log structured objects with an `event` key. Include request IDs, event IDs, external IDs, correlation IDs.
- Never log tokens, secrets, passwords, `Authorization` headers. Enforced by the `token-or-secret-logging` semgrep rule.

## Caching

`src/modules/kernel/application/cache/` provides cache-aside helpers; the cache gateway port lives at `src/modules/kernel/application/ports/cache-gateway.ts`. The kernel composition supplies an in-memory cache by default. Repositories persist data; use-cases decide cache policy and invalidation.

## UI and presentation kernel

`src/components/`, `src/hooks/`, `src/lib/` together form the UI kernel — primitives and utilities that any module's presentation may consume. They may not import any module's internals (only kernel internals and other modules' public gates, and only when truly needed).

`src/layout/` provides app and manager page chrome (`PageLayout`, navs). Routes mount presentation components inside these layouts.

`src/providers.tsx` wires global providers (theme, query client, demo-mode drawer).

The `QueryClientProvider` and shared `queryClient` will move into `modules/kernel/presentation/tanstack-query/` in Phase 4 so the new "lib may not import modules" rule holds cleanly.

## Configuration

`src/env/client.ts` and `src/env/server.ts` use `@t3-oss/env-core` for typed env. The `raw-env-access-outside-kernel` semgrep rule blocks `process.env` outside kernel infrastructure and a small list of config files.

## Tests and guardrails

| Tool | Role |
|---|---|
| TypeScript 6 | Compile-time contracts. |
| oxlint + oxfmt | Rust-based linter and formatter. |
| dependency-cruiser (`.dependency-cruiser.cjs`) | Layer and module-boundary rules. |
| semgrep (`.semgrep.yml`) | Pattern-based security and architecture rules. |
| Vitest (`*.unit.spec.ts`) | Unit + integration. |
| Vitest browser (`*.browser.spec.tsx`) | Component tests via Playwright runner. |
| Playwright (`e2e/`) | End-to-end. |
| React Cosmos (`*.fixture.tsx`) | Design workshop fixtures. |
| knip | Orphan/dead-code detection. |
| jscpd | Duplicate-code detection. |
| Lefthook | Pre-commit hooks (`format:changed`, `lint`). |

When a guardrail must be added (because a regression class repeats), prefer the cheapest enforceable form: a depcruise rule for import shape, a semgrep rule for syntactic patterns, a unit test for logical invariants, a browser test for UI behavior.

## Decisions (and rejected alternatives)

| Decision | Why | Rejected |
|---|---|---|
| `src/composition/` instead of `app/composition/` | TanStack Start owns `src/routes/`; `src/app/` would collide with route conventions. | `app/composition/` per generic-architecture doc; nothing in TanStack Start uses `src/app/`. |
| `src/components/`, `hooks/`, `lib/` stay at `src/` root as the UI kernel | Conventional shadcn-style layout; familiar to incoming React devs. | Moving them under `modules/kernel/presentation/` — kernel is server-heavy; muddles its role. |
| `sheriff-core` removed; dep-cruiser alone | Dep-cruiser already enforces vertical-slice and layer rules; sheriff was unconfigured. | Configure sheriff — adds maintenance burden for redundant coverage. |
| `AGENTS.md` only; no `CLAUDE.md` | Modern Claude Code reads `AGENTS.md` natively; single source of truth. | Symlink or duplicate file — drift risk or symlink portability concerns. |
| Auth port surface: `SessionGateway`, `AuthorizationGateway`, `SignInGateway`, `AuthEmailPort` | Designed for swap to WorkOS: each port is one capability with one adapter implementation; nothing else changes. | Single `auth-gateway` port — couples session/permission/sign-in swap paths. |
| Zod schemas emit error codes; UI translates | Decouples schema from i18n runtime; same schema reusable server-side. | `zod-i18n-map` lib — adds dep for a 30-line helper. |
| One agent-readable instruction file (`AGENTS.md`) plus the deep `ARCHITECTURE.md` | Two layers serve two audiences (quick scan vs. deep dive) without duplication. | One giant file — harder to scan in agent context windows. |

## MIGRATION_NOTES

The codebase moved from a `src/server/` legacy layout to the current hexagonal-modular layout in two waves (Hexagonal-architecture-followup and Canonical-Script-Surface PRs in `git log`). A subsequent partial migration finished the layer split for `book`, `user`, `account`, `genre`, `kernel`. A planned reorganization (in flight) finishes:

1. **`auth` application layer** — extracts `SessionGateway`, `AuthorizationGateway`, `SignInGateway`, `AuthEmailPort` ports. The raw `better-auth` instance is confined to `infrastructure/` and `composition/auth.ts`. Designed to make a future better-auth → WorkOS swap a Phase-2-shaped change.
2. **`runtime-config` full hex split** — adds `domain/`, `application/{ports,use-cases}/`, `infrastructure/env/` so feature flags can grow without restructuring.
3. **Zod schemas decoupled from i18n** — schemas emit error codes; UI maps codes to translations.
4. **`src/features/` deleted** — its contents move into new modules (`dashboard`, `demo`, `devtools`, `home`, `build-info`) as adapters composed via injection. Build-time pieces move under `tools/`. The directory is then forbidden by depcruise and semgrep.
5. **Presentation testing minimum bar** — every module's `presentation/` adds at least one page-level and one form-level `*.browser.spec.tsx`.
6. **UI kernel boundary tightened** — `src/components/|hooks/|lib/` may only import kernel internals and other modules' public gates; enforced by depcruise. `QueryClientProvider` and `queryClient` move into `modules/kernel/presentation/tanstack-query/`.

Do not reintroduce `src/server/` or `src/features/`. Both are deliberate exits, guarded by `legacy-server-import` and (planned) `no-src-features` rules.
