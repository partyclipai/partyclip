---
id: X-5
title: Claude model refresh — sync claude-local model list with upstream
layer: cross-cutting
status: todo
branch: feature/claude-model-refresh
target_phase: Phase 1
codebase: packages
depends_on: []
blocks: []
---

# X-5 — Claude model refresh — sync claude-local model list with upstream

## Goal

Bring the `claude-local` adapter's model catalog up to date with upstream's "Claude model
refresh". partyclip is a soft fork of `paperclipai/paperclip` (fork point `685ee84e`,
2026-05-05); upstream has since added a newer Opus that our adapter does not list.

Small and low-risk. It usefully *precedes* `L4-A` (wire pipeline executor to agent runner +
live model adapter): running the pipeline against a real model adapter is cleaner when the
current model IDs are already available. This is a soft ordering, not a hard dependency — see
Implementation notes.

## Background

- Upstream commit `5153b01a` (#6953) "Add Claude model refresh" (2026-05-29) updates the
  model list in `packages/adapters/claude-local/src/index.ts`.
- Upstream's `claude-local` model IDs are now: `claude-opus-4-8`, `claude-opus-4-7`,
  `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-sonnet-4-5-20250929`, `claude-haiku-4-6`,
  `claude-haiku-4-5-20251001`.
- partyclip's `claude-local` already has all of those **except `claude-opus-4-8`** — that is
  the single missing delta. The `models` array is at
  `packages/adapters/claude-local/src/index.ts:6-13`; its current newest Opus is
  `claude-opus-4-7` (line 7). `claude-opus-4-8` is the most recent Opus.
- The `cheap` model profile and the adapter's default model both point at `claude-sonnet-4-6`
  (`index.ts:21`) — adding an Opus does not change the default, but confirm that explicitly.
- Cherry-pick + version-bump convention lives in `docs/upstream-sync.md`: `UPSTREAM_VERSION`
  (repo root) holds the SHA of the most recent absorbed upstream commit and must be bumped
  whenever you cherry-pick.

## Scope (in)

- Add `claude-opus-4-8` to the `models` array in
  `packages/adapters/claude-local/src/index.ts`, with a label matching the existing
  convention (`Claude Opus 4.8`).
- Reconcile any other deltas vs. upstream's set so the lists match modulo intentional
  partyclip differences.
- Verify default-model selection and the `cheap` model profile / any labels and aliases are
  still correct after the change.
- If cherry-picking upstream `5153b01a` directly, bump `UPSTREAM_VERSION` per
  `docs/upstream-sync.md`.

## Scope (out)

- Adding entirely new adapters (`grok-local`, `cursor-cloud`) — those are `X-6` triage items.
- Changing the adapter framework or the `AdapterModelProfileDefinition` schema.

## Acceptance criteria

- [ ] `claude-local`'s model list matches upstream's set modulo intentional differences.
- [ ] `claude-opus-4-8` is present and selectable as a model id.
- [ ] Default-model selection and the `cheap` profile remain valid (unchanged unless
      intentionally updated).
- [ ] `pnpm -r typecheck` passes.
- [ ] `pnpm test` is green for the `claude-local` package.

## Implementation notes

- Smallest-footprint change — ideally a one-line addition to the `models` array plus, if
  cherry-picking, the `UPSTREAM_VERSION` bump.
- Cherry-pick path: follow `docs/upstream-sync.md` (`git cherry-pick 5153b01a`, then bump
  `UPSTREAM_VERSION` to the latest absorbed upstream SHA). A rename conflict on
  `@paperclipai` / `Paperclip` identifiers is unlikely in this file but watch for it per the
  upstream-sync conflict list.
- This unblocks cleaner `L4-A` work even without a formal dependency edge: L4-A's live model
  adapter is easier to validate against current model IDs. Land X-5 first if both are in
  flight, but do not gate L4-A on it.

## Open questions

- None blocking.
