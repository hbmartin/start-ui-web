# Fitness Functions

Evolutionary fitness functions for this hexagonal modular monolith. They build
on the existing Layer-1 conformance suite (dependency-cruiser, the
`tests/architecture` suite, Sheriff, Semgrep, CodeQL, Stryker, Knip) by adding
**evolvability metrics**, a **unified scorecard**, a **ratchet gate**, an
**agentic feedback loop**, and **runtime budgets**.

## What gets measured

Per module (`src/modules/*`), the collector computes:

- **Coupling** — afferent (Ca) / efferent (Ce) / instability `I = Ce/(Ce+Ca)`
  from dependency-cruiser's native folder metrics.
- **Abstractness** `A` — abstract declarations / total declarations (ts-morph,
  declaration-level; presentation `.tsx` excluded by default).
- **Distance from the main sequence** `D = |A + I − 1|` (lower is better).
- **Complexity** — cyclomatic + cognitive per function, aggregated to
  max/mean/p90 (ts-morph).
- **Churn / hotspots** — `cognitive × change-frequency` from git history
  (nightly only; degrades gracefully on shallow clones).

Plus ingested Layer-1 signals: dependency-cruiser violations + circular count,
the architecture test suite result, jscpd duplication %, Sheriff violations, and
bundle sizes. Everything is aggregated into
`test-results/fitness/fitness-scorecard.{json,md}`.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm fitness:metrics` | Compute + write the scorecard (report-only) |
| `pnpm fitness:metrics:check` | Ratchet gate against the committed baseline (CI) |
| `pnpm fitness:baseline` | Rewrite `fitness/baseline.json` from current metrics |
| `pnpm fitness:nightly` | Full scorecard including churn/hotspots |
| `pnpm sarif` | Emit + merge SARIF (dependency-cruiser + fitness) |
| `pnpm size-limit` / `:json` | Bundle budgets against the built client output |
| `pnpm fitness:sheriff` | Record the Sheriff signal for the collector |

## The ratchet

`fitness/baseline.json` is the committed snapshot; `fitness/thresholds.json` is
the hand-tunable gate config. `--check` fails CI only on **new-code
regressions**: a regression in a module **not** in the current diff is
downgraded to a warning, so repo-wide metric drift (e.g. a tool upgrade) cannot
hard-fail a PR. Absolute invariants — a **new circular dependency**, the
duplication / bundle / Sheriff ceilings — always gate.

After an intentional improvement (or an accepted increase), re-run
`pnpm fitness:baseline` and commit the updated baseline to ratchet the recorded
values.

## Agentic feedback loop

`.claude/settings.json` wires `scripts/fitness/claude-architecture-hook.mjs` as
a PostToolUse (Write|Edit) + Stop hook. On a boundary violation it returns
`{"decision":"block","reason":...}` so a coding agent iterates until the
architecture checks pass. Tool outputs are also emitted as SARIF 2.1.0 and
uploaded to GitHub code-scanning by the `fitness` CI job.

## Calibration notes (ratchet-first rollout)

- **Bundle budgets** — `.size-limit.json` globs `.output/public/**/*.{js,css}`
  with placeholder limits. Confirm the glob against a real `pnpm build`, seed
  `fitness/baseline.json.bundle` from the first CI build, then tighten
  `.size-limit.json` limits. The size-limit CI step is `continue-on-error`
  until calibrated.
- **Duplication** — baseline is the measured ~3.97% (jscpd); the strict
  `pnpm jscpd` (threshold 0) is available for manual runs, while CI gates
  duplication through the fitness ratchet.
- **Sheriff** — currently clean (0 violations) and wired into `check` + the
  `architecture` CI job.
