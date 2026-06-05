---
id: X-4
title: Cherry-pick upstream SSH/remote-exec env-leak security fixes
layer: cross-cutting
status: todo
branch: feature/upstream-ssh-env-sanitization
target_phase: Phase 1
codebase: packages
depends_on: []
blocks: []
---

# X-4 — Cherry-pick upstream SSH/remote-exec env-leak security fixes

## Goal

Close a known security gap that partyclip inherited but never patched. Upstream
(`paperclipai/paperclip`) landed a cluster of fixes that stop the host's `process.env` and
inherited shell env from leaking into remote SSH / sandbox execution. partyclip forked at
`685ee84e` (2026-05-05), before those fixes, and ships the same affected adapters
(`pi-local`, `opencode-local`, …) and `adapter-utils` plumbing — so the leak is present here.

`docs/upstream-sync.md` lists "Security fixes" as the #1 cherry-pick category, so absorbing
these is policy-aligned, not discretionary. This task cherry-picks (or ports) the four
commits, resolves the mechanical rename conflicts, and bumps `UPSTREAM_VERSION`.

## Background

Current state (verified in this checkout):

- `packages/adapter-utils/src/remote-execution-env.ts` does **not** exist — the upstream fix
  introduces it. Present today: `packages/adapter-utils/src/server-utils.ts`,
  `.../ssh.ts`, `.../execution-target.ts`.
- The affected adapters exist and are unpatched: `packages/adapters/pi-local/src/server/test.ts`
  and `packages/adapters/opencode-local/src/server/test.ts` (the SSH probe entry points).
- `UPSTREAM_VERSION` (repo root) holds the fork-point SHA `685ee84e…` and is the cherry-pick
  baseline; `docs/upstream-sync.md` defines the sync procedure and rename conventions.

The relevant upstream commits in range `685ee84e..upstream/master` (newest first):

- `f6bad8f6` (#5325) Sanitize remote execution envs at the boundary — **adds**
  `adapter-utils/src/remote-execution-env.ts`, refactors `server-utils.ts`, touches
  `execution-target.ts`.
- `44c365de` (#5275) Stop leaking host `process.env` into the remote Pi SSH probe —
  `adapters/pi-local/src/server/test.ts`, `adapter-utils/src/server-utils.ts`.
- `028c5aa0` (#5274) Stop leaking host `process.env` into the remote OpenCode SSH probe.
- `6c090f84` (#5142) Strip inherited host shell env from SSH remote execution —
  `adapter-utils/src/ssh.ts`, `server-utils.ts`.

Per `docs/upstream-sync.md`, expect rename conflicts during cherry-pick — they are mechanical:
`PAPERCLIP_` → `PARTYCLIP_`, `@paperclipai` → the partyclip npm scope (`@partyclipai`),
`Paperclip` → `partyclip`.

## Scope (in)

- Cherry-pick (or port equivalently, if cherry-pick is impractical) the four commits above
  onto this `feature/` branch: `f6bad8f6`, `44c365de`, `028c5aa0`, `6c090f84`.
- Add / port `packages/adapter-utils/src/remote-execution-env.ts` and the `server-utils.ts`,
  `ssh.ts`, `execution-target.ts` changes that depend on it.
- Apply the env-sanitization fix to both probes:
  `packages/adapters/pi-local/src/server/test.ts` and
  `packages/adapters/opencode-local/src/server/test.ts`.
- Resolve the mechanical rename conflicts (`PAPERCLIP_`→`PARTYCLIP_`, `@paperclipai`→partyclip
  scope, `Paperclip`→`partyclip`).
- Bump `UPSTREAM_VERSION` to the absorbed SHA, per `docs/upstream-sync.md`.

## Scope (out)

- Broader adapter refactors beyond what these four commits require — out of scope; keep the
  change set minimal and reviewable.
- Pulling unrelated adapter-hardening commits from the same upstream range — those belong to
  the X-6 upstream-triage task, not here.

## Acceptance criteria

- [ ] `packages/adapter-utils/src/remote-execution-env.ts` exists and is wired into
      `server-utils.ts` / `execution-target.ts`.
- [ ] Host `process.env` no longer leaks into the Pi and OpenCode remote SSH probes, covered
      by the ported tests.
- [ ] The affected `adapter-utils` and adapter tests pass under `pnpm test`.
- [ ] `UPSTREAM_VERSION` is updated to the absorbed upstream SHA.
- [ ] No renamed paperclip identifiers reintroduced — no `@paperclipai`, `PAPERCLIP_`, or
      `Paperclip` strings added by this change (the deliberately-preserved exceptions in
      `docs/upstream-sync.md` excepted).

## Implementation notes

- Follow the cherry-pick + `UPSTREAM_VERSION`-bump procedure in `docs/upstream-sync.md`
  ("Routine sync" and "What `UPSTREAM_VERSION` is"). Cherry-pick oldest-first
  (`6c090f84` → `028c5aa0` → `44c365de` → `f6bad8f6`) so each later commit applies on top of
  the file shape the earlier ones established.
- Rename conflicts here are expected to be mechanical (the three substitutions above). If a
  conflict is *not* mechanical — i.e. it touches partyclip-specific logic — stop and treat it
  as a real merge decision, not a find-and-replace.
- `f6bad8f6` is the keystone (it adds `remote-execution-env.ts`); the two probe commits and
  the SSH-env commit reference the boundary it establishes, so verify the import paths line up
  after all four are applied.
- Watch for overlap with `X-1` (CI SSH/sandbox test timeouts): the ported tests may land in
  the same suite `X-1` is mitigating. Run them locally; do not assume CI will exercise them.

## Open questions

- None blocking. If the cherry-pick of `f6bad8f6` diverges materially from upstream (because
  partyclip's `server-utils.ts` has drifted), record the porting decision as an `ADR-NNN` in
  `docs/adr/` rather than burying it in the commit message.
