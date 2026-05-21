---
name: task-list
description: List ready-to-claim tasks from docs/tasks/ with one-sentence summaries, sorted by target phase. Use when the user invokes /task-list or asks what's available, what's ready to work on, what tasks are waiting, or wants to pick a task to start.
---

# Task List

Print the partyclip Phase 1 tasks that are ready to be claimed: status `todo` AND all
dependencies satisfied. Pairs with `/task-start <ID>` — pick an ID from the output and start it.

**Trigger:** User invokes `/task-list` or asks what's available / ready / unblocked / waiting.

## 1. Scan tasks

- Glob `docs/tasks/*.md` excluding `README.md` and `TEMPLATE.md`.
- Read each file's YAML frontmatter.

## 2. Filter to "ready"

Include a task only if **all** of the following hold:

- `status:` is `todo`
- `target_phase:` is not `deferred`
- Every entry in `depends_on:` is resolved:
  - Task ID like `L4-A` → matching file `docs/tasks/<ID>-*.md` has `status: done`
  - Decision ID like `ADR-5` / `ADR-005` → a file `docs/adr/ADR-NNN-*.md` exists (match the
    number with or without zero-padding)

Tasks that are `claimed`, `in_progress`, `review`, `done`, `blocked`, or
`target_phase: deferred` are **not** ready and must not be listed.

## 3. Build the one-sentence summary

For each included task:

- Read the body and find the `## Goal` section. The summary is the **first sentence** of that
  section.
- If `## Goal` is missing or empty, fall back to the frontmatter `title`.
- Trim to one sentence (cut at the first `.`, `?`, or `!`); strip trailing whitespace.

## 4. Sort

Primary key: `target_phase` ascending — `Phase 1` before `Phase 2` before anything else.
Secondary key: task `id` ascending alphabetically (so `L4-A` before `L4-B`, `L*` before `X*`).

## 5. Print

Format:

```
Ready to claim (N task(s)):

  L4-A   Wire pipeline executor to agent runner + live model adapter   [Phase 1]
         Make the patch pipeline actually run agents.

  X-1    CI timeout mitigation for adapter-utils SSH/sandbox tests      [Phase 1]
         Make CI green deterministically.

  ...
```

If `N == 0`, print:

```
No tasks ready — every todo task has unsatisfied dependencies. Open a task's docs/tasks/ file
to see its depends_on, or check docs/strategy/delivery-plan.md.
```

## 6. Hint

After the list, print:

```
Pick an ID and run /task-start <ID> to claim it.
```

## Notes

- "Ready" means actively waiting for an agent to claim. Don't list deferred, blocked, or
  in-flight work — those are tracked separately in `docs/tasks/README.md`.
- Do not modify any files; this skill is read-only.
- Keep the output dense — one summary line per task, no full bodies. The user pivots to the
  task file (or `/task-start`) for detail.
