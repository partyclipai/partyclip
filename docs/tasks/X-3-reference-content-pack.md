---
id: X-3
title: Reference content pack (constitution, ministries, regular.yaml)
layer: cross-cutting
status: blocked
branch: feature/reference-content-pack
target_phase: Phase 1
codebase: docs
depends_on: []
blocks: []
blocked_by: Cross-repo tracker — work happens in the partyclip-content repo; not claimable via /task-start in this repo.
---

# X-3 — Reference content pack (constitution, ministries, `regular.yaml`)

## Goal

Provide a worked-example content pack so a real issue can travel the pipeline end to end.
The partyclip runtime is content-free; a deployment supplies its constitution, ministries,
agent personas, and pipeline definitions. Phase 1's "issue → `PUBLISHED`" demonstration needs
a minimal but real such pack.

## Background

- The framework runtime ships zero party content — see `docs/architecture.md`,
  "Constitution and disclaimers loaded from a separate content repo".
- That repo is `partyclipai/partyclip-content`, a sibling of this repository. Its
  `constitution/`, `ministries/`, and `pipelines/` directories are not yet populated.
- This row exists so the Phase-1 dependency is **visible on the board**, even though the work
  itself is not done in this repository.

## Scope (in)

In the **`partyclip-content`** repository:

- A sample charter plus a handful of constitution articles with stable IDs.
- A sample ministry definition or two.
- A `pipelines/regular.yaml` pipeline definition exercising the default stage sequence.

## Scope (out)

- Any change to the framework repository — content lives only in `partyclip-content`.
- A full reference deployment — only the minimum needed to exercise the pipeline.

## Acceptance criteria

- [ ] `partyclip-content` has a sample constitution (charter + articles).
- [ ] `partyclip-content` has at least one sample ministry definition.
- [ ] `partyclip-content` has a `pipelines/regular.yaml` definition.

## Implementation notes

- **This is a cross-repo tracker.** `/task-start`, `scripts/new-worktree.sh`, and the PR /
  `task-finish` flow govern *this* framework repository only — they do not apply here. Do the
  work directly in the `partyclip-content` repo. When that content lands, mark this row
  `done` by hand.
- `L4-D` (the end-to-end test) deliberately does **not** hard-depend on this task — it ships
  its own minimal in-repo fixture so it is not blocked on cross-repo content.

## Open questions

- Should `partyclip-content` get its own task board mirroring this workflow? Out of scope
  here; raise separately if the content repo grows enough to need one.
