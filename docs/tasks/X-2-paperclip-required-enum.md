---
id: X-2
title: Revisit paperclip_required enum (hermes compat)
layer: cross-cutting
status: todo
branch: feature/paperclip-required-enum
target_phase: Phase 1
codebase: packages
depends_on: []
blocks: []
---

# X-2 — Revisit `paperclip_required` enum (hermes compat)

## Goal

Resolve a Phase 0 carry-over. The `paperclip_required` enum value was kept verbatim during
the paperclip → partyclip rename for Hermes-adapter compatibility, and `ADR-001`'s appendix
accepted it as a deliberate leak to revisit in Phase 1. This task is that checkpoint: decide
to keep it (and document why) or change it (and sync every layer).

## Background

- The paperclip → partyclip migration preserved `paperclip_required` (and the third-party
  `lucide-react` `Paperclip` icon) rather than renaming it, to avoid breaking Hermes-adapter
  compatibility. `ADR-001`'s appendix documents this as an accepted Phase-0 leak pending a
  Phase-1 revisit.
- The enum value lives in shared adapter-skill types under `packages/shared` and is
  referenced by adapter code.
- `AGENTS.md §11` describes the fork's external-only Hermes adapter story, which is the
  compatibility constraint to weigh.

## Scope (in)

- Evaluate whether `paperclip_required` should be renamed, removed, or kept.
- If kept: document the rationale (and update `ADR-001` or add a short note) so it is no
  longer an open carry-over.
- If changed: synchronise the change across `packages/db` → `packages/shared` → `server` →
  `ui` per `AGENTS.md §5.2`, and confirm Hermes-adapter compatibility is not broken.

## Scope (out)

- The `lucide-react` `Paperclip` icon (third-party dependency) — out of scope; note only.
- Any broader adapter-skill schema redesign.

## Acceptance criteria

- [ ] A decision is recorded — keep (with documented rationale) or change.
- [ ] If changed: contracts are synced across db/shared/server/ui and typecheck passes.
- [ ] The Phase 0 carry-over is closed — no longer an open item.

## Implementation notes

- This task may legitimately close as a documented "keep" with no code change — that is a
  valid outcome as long as the rationale is written down.

## Open questions

- None blocking — the task itself is the decision.
