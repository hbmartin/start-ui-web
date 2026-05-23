# Quality Verification Guide

This guide describes a reusable quality system for a TypeScript application that is maintained by humans, CI actions, and coding agents. It is intentionally generic: copy it into a future app, then replace the example scripts and tools with the ones used by that app.

## Goals

- Catch correctness, security, architecture, and integration regressions before merge.
- Make local verification, agent verification, and CI verification use the same commands.
- Keep failures actionable by separating fast feedback from slower confidence checks.
- Treat generated code and agent-authored code as first-class changes that must pass the same gates as human-authored code.
- Make baseline failures explicit so new work is not blocked by unrelated old issues, while still preventing new regressions.

## Quality Layers

| Layer | Purpose | Typical tools | Required where |
| --- | --- | --- | --- |
| Formatting | Stable diffs and consistent style | Biome, Prettier | Local, agent, CI |
| Linting | Bug-prone patterns and code health | Biome, ESLint, oxlint | Local, agent, CI |
| Type checking | Static API and data-shape correctness | TypeScript, tsgo | Local, agent, CI |
| Unit tests | Pure logic and component contracts | Vitest, Jest, Testing Library | Local, agent, CI |
| Integration tests | Adapters, databases, queues, external boundaries | PGlite, Testcontainers, MSW | Local for touched areas, CI |
| End-to-end tests | User workflows and browser behavior | Playwright, Cypress | CI and release branches |
| Architecture checks | Layer boundaries and import ownership | dependency-cruiser, Sheriff, custom rules | Local, agent, CI |
| Security checks | Vulnerabilities and unsafe patterns | Semgrep, CodeQL, npm/pnpm audit, secret scanning | CI, local for touched sensitive areas |
| Build checks | Production bundle and framework rules | `next build`, Vite build, Remix build | CI, release branches, agents after relevant changes |
| Coverage and mutation checks | Test adequacy for critical logic | Coverage reports, Stryker | CI scheduled or critical-path PRs |

## Standard Pnpm Scripts

Every app should expose stable script names so contributors, agents, and CI do not need to understand tool-specific details.

```json
{
  "scripts": {
    "format": "biome check --write .",
    "format:check": "biome check .",
    "format:changed": "node scripts/format-changed.mjs",
    "lint": "biome check --error-on-warnings .",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:affected": "node scripts/run-affected-tests.mjs",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "build": "next build",
    "depcruise": "depcruise --config .dependency-cruiser.js src app components",
    "semgrep": "semgrep scan --config semgrep.yml --error --quiet",
    "security:audit": "pnpm audit --audit-level high",
    "check": "run-p -n lint typecheck depcruise semgrep security:audit",
    "verify": "pnpm format:check && pnpm check && pnpm test && pnpm build"
  }
}
```

Recommended conventions:

- `format` may modify files; `format:check` must be read-only for CI.
- `format:changed` is useful for agents and local work because it avoids rewriting the whole repository.
- `check` should run static verification only: lint, typecheck, dependency boundaries, security scans, and configuration validation.
- `test` should run the normal test suite without watch mode.
- `verify` should be the complete pre-merge confidence command. CI can split it into parallel jobs, but the meaning should remain the same.
- If a tool is optional locally, the script should fail with a clear installation message or provide a documented fallback.

## Local Development Gate

Before opening a pull request, run the smallest set of checks that covers the changed surface:

```bash
pnpm format:changed
pnpm check
pnpm test:affected
```

Run broader checks when the change affects shared code, configuration, build behavior, security boundaries, data migrations, or framework routing:

```bash
pnpm test
pnpm build
pnpm test:e2e
```

Local verification should prefer fast, deterministic checks. Slow checks are still valuable, but they should be reserved for changed critical paths, release branches, nightly schedules, or PRs that touch shared infrastructure.

## Agent Verification Rules

Coding agents should follow the same gate as human contributors and should make their verification choices visible in their final response.

Agent rules:

- Inspect existing scripts and project instructions before changing files.
- Add or update tests with every behavior change.
- Run format, static checks, and relevant tests after edits.
- Run the full test suite and build after broad refactors, shared component changes, dependency changes, security changes, or generated code updates.
- Do not hide failing checks. Report the command, the failing area, and whether it appears related to the current change.
- Treat pre-existing failures as baseline only when the touched files and changed behavior are unrelated.
- Never weaken architecture, security, or test gates to make a change pass without documenting and reviewing the risk.
- Prefer targeted follow-up guardrails when a regression class is discovered, such as a Semgrep rule, dependency-boundary rule, or regression test.

For repositories that use an `AGENTS.md` file, include the project-specific required command sequence there. Example:

```md
After making changes, run:

- `pnpm format:changed`
- `pnpm check`
- `pnpm test`

Also run `pnpm build` when the change touches framework config, routing, server actions, environment loading, or shared UI.
```

## CI Action Design

CI should be faster than a single serial `pnpm verify` command while still enforcing the same quality contract.

Recommended jobs:

| Job | Trigger | Commands |
| --- | --- | --- |
| Install | Pull request, main | `corepack prepare pnpm@11.1.3 --activate`, `pnpm install --frozen-lockfile` |
| Format and lint | Pull request, main | `pnpm format:check`, `pnpm lint` |
| Typecheck | Pull request, main | `pnpm typecheck` |
| Architecture | Pull request, main | `pnpm depcruise`, boundary-specific checks |
| Security static analysis | Pull request, main, schedule | `pnpm semgrep`, CodeQL, secret scanning |
| Dependency audit | Pull request, main, schedule | `pnpm security:audit` |
| Unit and integration tests | Pull request, main | `pnpm test` |
| Build | Pull request, main | `pnpm build` |
| E2E | Main, release, selected PRs | `pnpm test:e2e` |
| Coverage | Main, release, selected PRs | `pnpm test:coverage` |
| Mutation testing | Schedule, critical modules | Stryker or equivalent |

Example GitHub Actions shape:

```yaml
name: Verify

on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pinned-sha>
      - uses: pnpm/action-setup@<pinned-sha>
        with:
          version: 11.1.3
      - uses: actions/setup-node@<pinned-sha>
        with:
          node-version-file: .node-version
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm format:check
      - run: pnpm check
      - run: pnpm test
      - run: pnpm build
```

For larger apps, split these commands into parallel jobs and upload artifacts such as coverage, test reports, dependency graphs, build logs, and Playwright traces.

## Architecture and Boundary Checks

Quality gates should enforce the intended architecture, not just style.

Useful checks:

- Dependency direction: UI or transport can call application code; application can call domain ports; domain cannot import framework, database, or infrastructure code.
- Module ownership: feature modules should not deep-import another feature module's infrastructure.
- Barrel exports: public module indexes should expose stable contracts, not every internal adapter.
- Server/client separation: server-only code should not enter client bundles.
- Workflow/runtime separation: sandboxed workflow files should not import Node-only packages.
- Public API surface: route handlers, server actions, and webhooks should parse and validate external input before calling use cases.

Automate these rules with dependency-cruiser, Sheriff, ESLint boundaries, Semgrep, or custom scripts. When a bug is caused by an architectural bypass, add a rule so the same bypass cannot reappear silently.

## Security Checks

Security verification should include both dependency risk and application-specific misuse patterns.

Baseline checks:

- Dependency audit for known vulnerable packages.
- Secret scanning in CI and pre-commit hooks.
- Static rules for dangerous APIs, unsafe redirects, missing authorization, raw SQL misuse, and unsafe deserialization.
- Threat-model validation for changes to authentication, authorization, payments, webhooks, cryptography, logging, and CI configuration.
- Software composition visibility through lockfile review, SBOM generation, or dependency inventory.

Security scans can produce noisy baseline findings. Keep a documented allowlist or risk register, and require new findings to be triaged before merge.

## Test Strategy

Use the cheapest test that proves the behavior.

- Unit tests for pure domain logic, data mappers, reducers, validation schemas, and failure branches.
- Component tests for rendering, accessibility, async state transitions, and user interactions.
- Integration tests for repositories, database migrations, queues, webhooks, external API adapters, and cache behavior.
- E2E tests for workflows that cross multiple boundaries and must keep working after framework or deployment changes.
- Contract tests for third-party payloads and webhook signatures.
- Regression tests for every production bug or review finding that could recur.

Coverage should be interpreted by risk. A critical payment, auth, webhook, or data-loss path needs stronger coverage and often mutation testing. A low-risk presentational component may only need focused component tests.

## Database and Migration Checks

For apps with a database, CI should verify that migrations and schema state are coherent.

Recommended checks:

- Migration files are generated by the approved tool, not hand-edited.
- Migration journal and snapshots are valid.
- Migrations apply cleanly to an empty database.
- Current schema does not drift from generated migrations.
- Raw SQL paths have integration tests against a real or realistic driver.
- Rollback or forward-fix procedures are documented for risky migrations.

Agents should never edit generated migration files manually unless the repository explicitly allows it.

## Build and Runtime Checks

A passing test suite is not enough if the production build has different constraints.

Build verification should catch:

- Framework-specific server/client import violations.
- Missing or invalid environment configuration.
- Route, page, and metadata generation errors.
- Tree-shaking or bundling issues.
- Runtime restrictions for edge, serverless, worker, or workflow environments.
- Type issues that only appear under production build settings.

CI should run the production build on every PR that touches app code, framework config, package versions, environment loading, routing, or server/runtime boundaries.

## Baselines and Failure Triage

Every quality gate should distinguish three cases:

- New failure caused by the change: fix it before merge.
- Existing baseline failure in touched code: fix it when practical; otherwise document why it is out of scope and create follow-up work.
- Existing baseline failure outside the touched scope: report it, keep the current change focused, and do not weaken the gate.

When a check fails:

1. Capture the failing command and first relevant error.
2. Identify whether the failed files are touched by the change.
3. Prefer a code or test fix over a suppression.
4. If adding a suppression, scope it narrowly and include a reason.
5. Add a regression guardrail when the failure represents a repeatable class of bug.

## Review Bots and Agent Tools

Automated reviewers are useful when they complement deterministic checks.

Good uses:

- Summarizing risky diffs for human review.
- Pointing out missing tests or architectural inconsistencies.
- Running static analysis with a second engine.
- Reviewing prompt, security, and observability changes against project rules.
- Detecting generated-code drift or missing documentation updates.

Limits:

- Review bots should not be the only enforcement mechanism for security or correctness.
- Findings should be mapped back to deterministic checks when possible.
- Repeated review comments should become tests, lint rules, Semgrep rules, or dependency-boundary rules.

## Release Readiness Checklist

Before release, verify:

- `pnpm verify` or the CI equivalent is passing.
- Required environment variables are configured in each deployment environment.
- Database migrations have been dry-run and reviewed.
- Security scans have no untriaged new findings.
- E2E tests cover the critical user journeys.
- Observability is in place for the changed paths: structured logs, metrics, traces, and alert routing.
- Rollback or forward-fix steps are documented for risky changes.
- Known baseline failures are documented with owners and follow-up tasks.

## Adoption Plan for a New App

1. Define the standard `pnpm` script names before adding many tools.
2. Add formatter, linter, typecheck, unit test, and build gates first.
3. Add dependency-boundary and security checks once the architecture has stable layers.
4. Add integration tests for persistence, queues, webhooks, and third-party adapters.
5. Add E2E tests for the highest-value user workflows.
6. Add coverage thresholds only after the test suite is meaningful.
7. Add mutation testing for critical modules after normal tests are stable.
8. Document agent instructions and CI requirements in the repo root.
9. Keep a short baseline register for accepted findings and revisit it regularly.

The quality system should stay boring and explicit. Contributors should know which command to run, CI should run the same checks every time, and agents should leave behind enough verification detail for a reviewer to trust the change.
