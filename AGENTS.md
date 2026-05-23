# Agent Instructions for start-ui-web

This is the canonical entry point for any coding agent or new contributor. Read this first, then `ARCHITECTURE.md` for the deep dive.

## What this codebase is

A TanStack Start application (Vite + Nitro runtime) in TypeScript, organized as a modular monolith with hexagonal architecture per feature module. UI uses Base UI React + Tailwind 4 (shadcn-style primitives). Data uses Drizzle ORM over Postgres. Auth uses better-auth (kept behind ports so it can be swapped). Server state uses TanStack Query.

## Canonical commands

Always use these instead of running the underlying tools directly.

| Command | Purpose |
|---|---|
| `pnpm dev` | Start dev server (with PGlite for local Postgres). |
| `pnpm check` | Fast static checks: format, lint, typecheck, depcruise, semgrep, audit (parallel). |
| `pnpm test` | Vitest unit + browser projects, no watch. |
| `pnpm test:affected` | Run only tests touching changed files. |
| `pnpm build` | Production build. |
| `pnpm verify` | Full pre-merge gate: `check` + `test` + `build`. |
| `pnpm test:e2e` | Playwright end-to-end (long; CI runs it on PRs). |
| `pnpm format:changed` | Auto-format only changed files (pre-commit-safe). |

After any change: `pnpm format:changed && pnpm check && pnpm test:affected`.
Before opening a PR: `pnpm verify`.

## Where things live

```
src/
  modules/<feature>/   vertical-slice business modules (hex layers, see below)
  modules/kernel/      cross-cutting primitives: db, logger, clock, errors, ids, cache, auth context
  composition/         DI wiring; the only place outside infrastructure that may import SDKs
  routes/              TanStack Start file-based routes (thin, delegate to module presentation)
  layout/              app and manager shells (page-layout, nav)
  components/          headless UI primitives — no module imports allowed
  hooks/               framework-agnostic UI hooks — no module imports allowed
  lib/                 pure utilities (zod helpers, dayjs config, tailwind utilities)
  emails/              React Email templates
  env/                 typed env via @t3-oss/env-core
tools/                 build-time scripts (no runtime imports)
e2e/                   Playwright tests
drizzle/               schema, migrations, seed
```

## Public-gate rules (enforced by depcruise + semgrep)

Other modules must import your module **only through one of these four files**:

| File | Contents |
|---|---|
| `index.ts` | Domain types, port interfaces, factory function, stable constants. |
| `server.ts` | Server-only public API (composition accessors, server context helpers). |
| `client.ts` | Client-only public API (config constants, form schemas, React hooks). |
| `presentation.ts` | React components mounted by routes/layouts/other modules. |

No deep imports of another module's `domain/`, `application/`, `infrastructure/`, `transport/`. `kernel` is the one exception — other modules may import its internals (logger port, error types, etc.).

## Layer rules per module

| Layer | Allowed dependencies | Forbidden |
|---|---|---|
| `domain/` | Pure TypeScript, kernel domain types. | React, router, Query, infrastructure, transport, SDKs. |
| `application/` | Own domain, own ports, kernel domain, kernel application ports. | Infrastructure, transport, React, router, Query. |
| `infrastructure/` | Own ports, own domain, kernel, SDKs. | Other modules' internals. |
| `transport/` | Own application (via factory + composition), own domain types, kernel transport helpers. | Own infrastructure directly, other modules' internals. |
| `presentation/` | Own queries/schemas, kernel presentation, other modules' public gates, `src/components`, `src/hooks`, `src/lib`. | Own infrastructure directly. |

## Adding a new feature module

1. Create `src/modules/<feature>/` with at minimum `domain/`, `application/{ports,use-cases}/`, `infrastructure/`, `presentation/`, `factory.ts`, `index.ts`.
2. Add public-gate files (`server.ts`, `client.ts`, `presentation.ts`) only when consumers exist.
3. Create `src/composition/<feature>.ts` using `createCachedFactory` from `src/composition/shared/singleton.ts`.
4. Add at least one use-case unit test under `application/__tests__/` with in-memory port mocks.
5. Add at least one browser test under `presentation/` if the module has form or page logic.
6. Update `ARCHITECTURE.md`'s module list.

The current modules: `account`, `auth`, `book`, `genre`, `kernel`, `runtime-config`, `user`. `dashboard`, `demo`, `devtools`, `home`, `build-info` are added in Phase 3 of the reorganization.

## Common pitfalls (machine-enforced)

- **`presentation/schema.ts` may not import `i18next` / `react-i18next`.** Schemas emit error codes; UI maps codes to translations.
- **`process.env` is only allowed in `kernel/infrastructure/config`** and a small allowlist of config files. Use `envClient` / `envServer`.
- **No `new Error(...)`** in application/transport/infrastructure. Throw `AppError` from `kernel/domain/errors/app-error`. Tests are exempt.
- **No `better-auth`** server imports outside `src/modules/auth/infrastructure/` and `src/composition/auth.ts`. The client-side `better-auth/react` is allowed in `auth/presentation/client.ts` until Phase 2 wraps it in stable hooks.
- **Routes that read search params in a loader must declare `loaderDeps`.** Undeclared dependencies break caching and preloading.
- **No session tokens** in client-facing code; pass `sessionId` and resolve server-side.
- **No `redirect({ to: req.X.Y })`** with raw request input; validate against an allowlist.
- **No logging of tokens, secrets, passwords, or `Authorization` headers.**

## Tests

| Type | Location | Tool |
|---|---|---|
| Unit | `*.unit.spec.ts` next to source | Vitest (node project) |
| Browser/component | `*.browser.spec.tsx` next to source | Vitest browser + Playwright runner |
| E2E | `e2e/*.spec.ts` | Playwright |
| Design fixtures | `*.fixture.tsx` next to component | React Cosmos |

Use the cheapest test that proves the behavior. Critical business logic (auth, payments, data-loss paths) deserves stronger coverage and may need browser tests.

## When checks fail

1. Capture the failing command and the first relevant error.
2. Identify whether the failed files are touched by your change.
3. Prefer a code/test fix over suppression. If you suppress, scope it narrowly with a reason.
4. New failure from your change → fix before merge. Pre-existing baseline failure in touched code → fix when practical. Baseline failure outside your scope → report, do not weaken the gate.
5. If a class of failure is likely to recur, add a regression guardrail (depcruise rule, semgrep rule, or test).

Never disable a guardrail to make a change pass without documenting the risk and asking for review.

## Related docs

- `ARCHITECTURE.md` — full architectural map, public-gate matrix, composition root mechanics, decision tree.
- `README.md` — user-facing getting-started.
- `.claude/rules/architecture.md`, `.claude/rules/modules.md` — short rule sheets for agent quick-reference.
