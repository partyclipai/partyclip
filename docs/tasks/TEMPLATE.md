---
id: <ID>                  # L<n>-<letter> (e.g. L4-A) or X-<n> (e.g. X-5)
title: <one-line title>
layer: <L0 | L1 | L2 | L3 | L4 | L5 | L6 | cross-cutting>
status: todo              # todo | claimed | in_progress | review | done | blocked
branch: feature/<short-kebab>
target_phase: Phase 1     # Phase 1 | Phase 2 | deferred
codebase: <server | ui | cli | packages | plugins | docs | multiple>
depends_on: []            # task IDs (e.g. L4-A) and/or ADR refs (e.g. ADR-005)
blocks: []                # task IDs this one blocks
# agent: <name>           # added when status → in_progress
# started: <YYYY-MM-DD>   # added when status → in_progress
# blocked_by: <reason>    # added when status → blocked
---

# <ID> — <title>

## Goal

What this task delivers and why it matters. One or two short paragraphs.

## Background

Context and current state. Cite code as `file:line` and decisions as `ADR-NNN`. State what
already exists so the next agent does not re-discover it.

## Scope (in)

- The work, broken into work packages if large.

## Scope (out)

- Explicitly excluded, with the reason — or the task that owns it instead.

## Acceptance criteria

- [ ] Each item independently verifiable.

## Implementation notes

Sequencing, risks, gotchas, pointers to the code that matters.

## Open questions

Unresolved decisions. Suggest recording any non-obvious one as an `ADR-NNN` in `docs/adr/`.
