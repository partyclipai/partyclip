---
name: task-start
description: Claim a task from docs/tasks/, validate dependencies, set frontmatter to in_progress, then provision an isolated git worktree on the task's feature branch and switch the session into it. Use when the user invokes /task-start <ID> or asks to start work on a task ID like L4-A.
---

# Task Start

Claim a task from the partyclip Phase 1 task board (`docs/tasks/`), provision an isolated git
worktree for it, and switch this session into that worktree. Pairs with `/task-finish`.

**Trigger:** User invokes `/task-start <ID>` (e.g. `/task-start L4-A`) or asks to start work
on a specific task ID.

Each task runs in its own worktree so several Claude sessions can work different tasks in
parallel without branch switches colliding — see `CLAUDE.md`, "Parallel task work: git
worktrees".

## 1. Locate the task

- Glob `docs/tasks/<ID>-*.md`. Exactly one match expected.
- If zero matches: report `Task <ID> not found under docs/tasks/.` and stop.
- If multiple matches: list them and ask the user to disambiguate.
- Read the file.

## 2. Validate state

- **Run from the main checkout.** This skill creates a *new* worktree, so it must not run
  inside an existing one. If `git rev-parse --git-dir` differs from
  `git rev-parse --git-common-dir`, the session is already in a linked worktree — stop and
  tell the user to run `/task-start` from the main checkout (the one on `develop`).
- **Status check:** the task's `status:` frontmatter must be `todo` or `claimed`.
  - If `in_progress`, `review`, or `done`: tell the user and stop unless they explicitly
    confirm overriding.
  - If `blocked`: report the `blocked_by:` reason and stop.
- **Working tree check:** `git status --porcelain` must be empty. If not, ask the user to
  commit or stash.
- **Branch check:** must be on `develop`. If not, run `git checkout develop` after confirming
  with the user.

## 3. Validate dependencies

For each entry in the task's `depends_on:` list:

- If it matches `ADR-\d+` (a decision ID): confirm `docs/adr/ADR-NNN-*.md` exists (match the
  number with or without zero-padding). If not, report the missing ADR and stop.
- Otherwise (a task ID like `L4-A`): glob `docs/tasks/<ID>-*.md`, read it, confirm
  `status: done`. If any dependency is not `done`, list them and stop.

## 4. Resolve metadata

- **Branch:** read the task's `branch:` field (e.g. `feature/agent-invocation-wiring`).
- **Today's date:** `YYYY-MM-DD` from the system clock.
- **Agent name:** default to `git config user.name`. Ask the user only if they want to
  override.

## 5. Claim the task on develop

While still on `develop` in the main checkout, edit the task file frontmatter:

- `status: todo` → `status: in_progress`
- add `agent: <agent name>` and `started: <today>` after the `blocks:` line — todo tasks
  carry no such fields yet

Edit `docs/tasks/README.md`: in the board table, change this task's `Status` column from
`todo` to `in_progress`.

Commit on develop:

```
git add docs/tasks/<task-file> docs/tasks/README.md
git commit -m "chore(tasks): claim <ID> for <agent>"
```

The claim lives on `develop` so every worktree sees it — worktrees share one `.git`. Do not
push automatically; let the user push when convenient. This is a conventional, board-keeping
commit with no trailer; *code* commit conventions follow `AGENTS.md`.

## 6. Provision the worktree

Run the provisioning script. It creates the task's `feature/` branch off `develop` (so it
includes the claim commit), adds a sibling worktree folder, and copies the git-ignored files
a fresh checkout needs:

```
scripts/new-worktree.sh <ID>
```

The script prints the new worktree's absolute path as its last stdout line — capture it. If
it errors (e.g. the branch already exists, meaning the task is already claimed), report the
message and stop; do not continue.

## 7. Enter the worktree

Call the `EnterWorktree` tool with `path` set to the worktree path from step 6. This switches
the session into the worktree, already on the task's feature branch. Work the task here for
the rest of the session. Do not call `ExitWorktree` mid-task — the worktree persists until
the task's PR merges and the user removes it.

## 8. Report

Now inside the worktree, print:

- The task's title, goal, and acceptance criteria from the task file body
- Any open questions noted in the task
- The active branch and the worktree path
- Reminder of `/task-finish` to wrap up

## Notes

- Do not skip the dependency check. The point of the per-task `depends_on:` is to prevent
  agents from claiming work whose prerequisites aren't merged yet.
- partyclip uses plain git, not the git-flow CLI. The feature branch is created by
  `new-worktree.sh` via `git worktree add -b feature/… develop` — git flow cannot create a
  branch in a separate worktree anyway. `/task-finish` publishes it with plain `git push`.
- Do not amend or rewrite the claim commit later — it's the audit trail.
- If the task needs dependencies in the worktree, run `pnpm install` there (worktrees do not
  inherit `node_modules`).
