---
id: X-1
title: CI timeout mitigation for adapter-utils SSH/sandbox tests
layer: cross-cutting
status: todo
branch: feature/ci-timeout-mitigation
target_phase: Phase 1
codebase: packages
depends_on: []
blocks: []
---

# X-1 — CI timeout mitigation for adapter-utils SSH/sandbox tests

## Goal

Make CI green deterministically. A set of `adapter-utils` SSH/sandbox tests time out because
they need a live SSH server that CI does not provision. They are a Phase 0 carry-over and are
currently not handled deliberately — CI should either run them with proper provisioning or
mark them opt-in with a documented reason.

## Background

- The Phase 0 → Phase 1 migration recorded ~14 pre-existing SSH/sandbox test timeouts in
  `packages/adapter-utils` as a carry-over item to resolve in Phase 1.
- The CI gate is `.github/workflows/pr.yml` (policy validation → typecheck/test/build → e2e
  → canary dry-run).
- `AGENTS.md §7` defines the verification tiers — `pnpm test` is the cheap Vitest default;
  browser/release suites are opt-in. The SSH/sandbox suite needs a similar explicit tier.

## Scope (in)

- Decide and implement the mitigation: make the SSH/sandbox suite opt-in, or add a CI
  timeout + retry, or split it into a separately-gated job, or provision an SSH service in CI.
- Update `.github/workflows/` accordingly.
- Document the decision so the next contributor understands why those tests behave specially.

## Scope (out)

- Rewriting the SSH/sandbox tests themselves to not need a server.
- Broader CI restructuring beyond this suite.

## Acceptance criteria

- [ ] CI is green deterministically — no intermittent SSH/sandbox timeouts.
- [ ] The SSH/sandbox tests are either run with real provisioning or explicitly marked
      opt-in, with the reason documented.
- [ ] `pnpm test` behaviour for everyday work is unchanged (still cheap, still green).

## Implementation notes

- Prefer the lowest-friction option that keeps the tests *runnable* on demand — silently
  deleting coverage is not the goal.
- **Upstream prior art (surfaced by the X-6 triage, cluster (b)).** Upstream paperclip already
  improved the shared `scripts/run-vitest-stable.mjs` runner that partyclip also ships — pull or
  port these before reinventing a mitigation: `47920f9c` (#5147 "Speed up PR CI critical path")
  and `81d18f2d` (#6137 "speed up PR verify workflow"). Cherry-pick per `docs/upstream-sync.md`
  (record the SHAs without advancing the survey baseline, as X-4/X-5 did). The CI fix is absorbed
  here in X-1 rather than as a separate task.

## Open questions

- None blocking.
