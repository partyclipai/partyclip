---
id: X-4
title: Cherry-pick upstream SSH/remote-exec env-leak security fixes
layer: cross-cutting
status: review
branch: feature/upstream-ssh-env-sanitization
target_phase: Phase 1
codebase: packages
depends_on: []
blocks: []
agent: Umut Tuncer
started: 2026-06-05
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

- [x] `packages/adapter-utils/src/remote-execution-env.ts` exists and is wired into
      `server-utils.ts` / `execution-target.ts`.
- [x] Host `process.env` no longer leaks into the Pi and OpenCode remote SSH probes, covered
      by the ported tests.
- [x] The affected `adapter-utils` and adapter tests pass under `pnpm test`.
- [x] `UPSTREAM_VERSION` is updated to the absorbed upstream SHA.
- [x] No renamed paperclip identifiers reintroduced — no `@paperclipai`, `PAPERCLIP_`, or
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

## Resolution

Cherry-picked the four commits oldest-first onto `feature/upstream-ssh-env-sanitization`:
`6c090f84` → `028c5aa0` → `44c365de` → `f6bad8f6` (upstream author preserved, committed here;
clean conventional messages carrying provenance). Outcome:

- `packages/adapter-utils/src/remote-execution-env.ts` added — the boundary sanitizer
  `sanitizeRemoteExecutionEnv`. `server-utils.ts`'s `sanitizeSshRemoteEnv` is now a thin wrapper
  over it; `execution-target.ts` applies it for SSH **and** sandbox transports; the pi-local and
  opencode-local probes send only the user-configured env across SSH instead of host `process.env`.
- **No blanket rename.** partyclip's rename is selective — SCREAMING_SNAKE `PARTYCLIP_*` constants
  and the `@partyclipai` npm scope are renamed, but internal camelCase identifiers keep `Paperclip`
  (`sanitizeSshRemoteEnv`, `stringifyPaperclipWakePayload`, …). No `PAPERCLIP_` / `@paperclipai`
  was added.
- **Real merge decisions (not find-and-replace).** The 3-way merge bundled upstream-only code into
  the conflict regions that `f6bad8f6` did not add and partyclip does not support: the
  `preferredShellForSandbox` import (`sandbox-shell.ts` absent), the
  `ensureAdapterExecutionTargetRuntimeCommandInstalled` test describe (function absent), and two
  sandbox it-blocks using `adapterExecutionTargetUsesPaperclipBridge` / a `shellCommand` target
  field partyclip lacks. All dropped; only what `f6bad8f6` actually introduced was kept. The
  divergence was self-contained and mechanical to identify, so no ADR was needed.
- **`UPSTREAM_VERSION`:** recorded the four absorbed SHAs but did **not** advance the survey
  baseline past the fork point. As a soft fork doing selective picks, advancing to `f6bad8f6`
  would hide the still-unreviewed commits between the fork and it from the routine survey and the
  `X-6` triage. (Same principle as `X-5`.)
- Verified: `pnpm -r typecheck` (exit 0); `adapter-utils` 37/37 incl. the new sanitizer tests;
  `pi-local` + `opencode-local` 28/28. No SSH-server-dependent test was exercised (those remain the
  `X-1` concern).
