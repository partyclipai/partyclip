---
id: X-7
title: Cherry-pick upstream adapter/remote-sandbox hardening fixes
layer: cross-cutting
status: in_progress
branch: feature/adapter-sandbox-hardening
target_phase: Phase 1
codebase: packages
depends_on: []
blocks: []
agent: Umut Tuncer
started: 2026-06-05
---

# X-7 — Cherry-pick upstream adapter/remote-sandbox hardening fixes

## Goal

A second Tier-1 security/stability pull from upstream `paperclipai/paperclip`, sibling to X-4.
X-4 was scoped to the SSH env-leak cluster only; the X-6 upstream-sync triage's credibility
scan surfaced a separate cluster of remote-sandbox / workspace hardening commits in
`packages/adapter-utils` (and the adapters that consume it) that X-4 did not cover. partyclip
ships the same adapter-utils sandbox/remote plumbing, so these fixes apply here too.

`docs/upstream-sync.md` lists security fixes, shared-infra bug fixes, and performance/stability
work as cherry-pick categories — these three commits fall squarely in them, so absorbing them
is policy-aligned, not discretionary.

## Background

partyclip is a soft fork of `paperclipai/paperclip`, forked at `685ee84e` (2026-05-05).
`UPSTREAM_VERSION` (repo root) holds the fork-point SHA and is the cherry-pick baseline;
`docs/upstream-sync.md` defines the sync procedure and the selective-rename conventions.

Candidate commits in range `685ee84e..upstream/master`, all touching `packages/adapter-utils`
and/or `packages/adapters` (newest first):

- `d1a8c873` (#5922) `fix(remote-sandbox): harden host workspace resumes`.
- `b24c6909` (#5685) Harden remote sandbox runtime probes, timeouts, and installs.
- `12cb7b40` (#5444) Harden remote workspace sync and restore flows.

This mirrors X-4's workflow exactly — see X-4's `## Resolution`
(`docs/tasks/X-4-upstream-ssh-env-sanitization.md`) for the established pattern: cherry-pick
oldest-first, resolve partyclip rename divergences as a **selective** rename, and record
absorbed SHAs in `UPSTREAM_VERSION` without advancing the survey baseline.

Two upstream commits from the same hardening neighbourhood are **deliberately excluded** (see
Scope (out)): `1bd44c8a` (#5967, Cloudflare-sandbox-specific) and `68f69975` (#5292,
control-plane / issue hardening, a paperclip-product primitive).

partyclip's rename is selective, not blanket: SCREAMING_SNAKE `PARTYCLIP_*` constants and the
`@partyclipai` npm scope are renamed; internal camelCase `Paperclip` identifiers
(`sanitizeSshRemoteEnv`, `stringifyPaperclipWakePayload`, …) are kept. Verify each conflict
hunk is a real divergence, not a blanket find-and-replace — X-4 found upstream-only code
bundled into conflict regions that partyclip does not support and had to be dropped.

## Scope (in)

- Re-confirm each of the three commits still applies against the current fork state, and
  re-scope: some may be entangled with later commits (as X-4's `f6bad8f6` keystone was) or
  partially overlap code X-4 already landed.
- Cherry-pick (or port equivalently, if cherry-pick is impractical) the three commits
  oldest-first onto this `feature/` branch: `12cb7b40` → `b24c6909` → `d1a8c873`.
- Resolve conflicts. Apply the selective rename (`PAPERCLIP_`→`PARTYCLIP_`, `@paperclipai`→the
  partyclip npm scope); keep internal camelCase `Paperclip` identifiers. Treat any conflict
  that touches partyclip-specific logic as a real merge decision, not a substitution.
- Run `pnpm -r typecheck` and the `adapter-utils` / affected-adapter test suites.
- Record the absorbed SHAs in `UPSTREAM_VERSION` the same way X-4 did — record the SHAs, do
  **not** advance the survey baseline (selective-pick policy).

## Scope (out)

- **`1bd44c8a` (#5967) Cloudflare-sandbox-specific hardening** — partyclip has no Cloudflare
  sandbox provider (only `e2b`), so the code path does not exist here.
- **`68f69975` (#5292) control-plane / issue hardening** — a paperclip-product primitive
  partyclip replaces; out of policy per `docs/upstream-sync.md`.
- The **SSH env-leak cluster** — already landed by X-4
  (`docs/tasks/X-4-upstream-ssh-env-sanitization.md`).
- **Broader adapter refactors** beyond what these three commits require — keep the change set
  minimal and reviewable.

## Acceptance criteria

- [ ] The three commits (`12cb7b40`, `b24c6909`, `d1a8c873`) are absorbed — or any genuinely
      inapplicable one is documented as skipped with a reason in the Resolution.
- [ ] `pnpm -r typecheck` is green (exit 0).
- [ ] The affected `adapter-utils` / adapter test suites pass.
- [ ] `UPSTREAM_VERSION` records the newly-absorbed SHAs **without** advancing the survey
      baseline past the fork point.
- [ ] No renamed paperclip identifiers reintroduced — no `@paperclipai`, `PAPERCLIP_`, or
      `Paperclip` (in its renamed form) strings added by this change, beyond the
      deliberately-preserved internal-identifier exceptions in `docs/upstream-sync.md`.
- [ ] The two excluded commits (`1bd44c8a`, `68f69975`) are noted as explicit skips with their
      reasons.

## Implementation notes

- Mirror X-4's workflow exactly — cite X-4's `## Resolution` and `docs/upstream-sync.md`
  ("Routine sync" + "What `UPSTREAM_VERSION` is"). Cherry-pick oldest-first so each later
  commit applies on top of the file shape the earlier ones established.
- Re-run the survey first, in case upstream or the fork state moved:
  `git fetch upstream && git log $(grep -E '^[a-f0-9]{40}$' UPSTREAM_VERSION)..upstream/master --oneline`.
  The upstream default branch is `upstream/master`.
- Watch for X-1 overlap: some sandbox tests need a live server. Run the hardening tests
  locally — the env-leak / hardening logic is unit-testable; the server-dependent suite remains
  the X-1 concern.
- The X-4 selective-rename gotcha applies: the 3-way merge can bundle upstream-only code
  (functions / imports / it-blocks partyclip lacks) into the conflict regions. Keep only what
  the picked commit actually introduces; drop the rest.

## Open questions

- None blocking. If a cherry-pick diverges materially from upstream (because partyclip's
  adapter-utils has drifted), record the porting decision in the commit body and this task's
  Resolution; add an `ADR-NNN` in `docs/adr/` only if a non-obvious architectural call is made.
