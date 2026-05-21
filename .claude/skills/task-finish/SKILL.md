---
name: task-finish
description: Push the current feature branch, open a PR, and flip the task status to review. Use when the user invokes /task-finish or asks to finish/wrap up the current task and submit it for review.
---

# Task Finish

Wrap up an in-progress task: push the feature branch, open a PR, flip status to `review`.
Pairs with `/task-start`.

**Trigger:** User invokes `/task-finish` or asks to wrap up / submit / finish the current task.

## 1. Identify the task

- Run `git branch --show-current`. Must start with `feature/`. If not, report
  `Current branch is not a feature branch — /task-finish only runs from feature/*.` and stop.
- Compute the branch's task by globbing `docs/tasks/*.md` and matching frontmatter `branch:`
  against the current branch. Exactly one match expected.
- Read the task file. Verify `status: in_progress`. If not, ask the user before continuing.

## 2. Pre-PR review & checks (offer)

This is the convention gate before the PR opens. Offer the user both parts below; recommend
the review. Surface the offer once — do not run anything automatically.

### 2a. Convention review (recommended)

Launch the relevant subagents via the Agent tool (in parallel — one message, multiple calls).
Pick them from the task file's `codebase:` frontmatter, read in step 1:

- **`pr-reviewer`** — always. Conventional commits, PR-template compliance, branch naming,
  task frontmatter, spec co-edits.
- The codebase reviewer:
  - `server` → `server-reviewer`
  - `ui` → `ui-reviewer`
  - `packages` / `cli` / `plugins` → `schema-contract-reviewer` when the diff touches the
    db → shared → server → ui contract; otherwise no codebase reviewer
  - `multiple` → every reviewer whose codebase the diff touches (check
    `git diff develop...HEAD --stat`); always add `schema-contract-reviewer` if `packages/db`
    schema changed
  - `docs` → skip the codebase reviewers
- **`spec-verifier`** — also launch it if the diff changes documented behaviour, API
  contracts, or `docs/specs/`.

Tell each agent the current branch name and that the base is `develop`, so it scopes the diff.

Collect the reports. **Surface every `Blocking` finding to the user and stop** until they are
fixed or the user explicitly waives them. `Should fix` / `Nits` are reported but do not block.
A reviewer that passes clean gets a one-line OK.

### 2b. Mechanical checks (offer)

Ask the user whether to also run:

- `pnpm -r typecheck`
- `pnpm test` — the cheap Vitest default
- For a broad change: `pnpm test:run` and `pnpm build` (per `AGENTS.md §7`)

Browser suites (`pnpm test:e2e`, `pnpm test:release-smoke`) stay opt-in — run them only when
the change touches them. If the user says yes, run the requested checks and report results.
Do not block on warnings; only stop on hard failures.

## 3. Confirm there is real work

Run `git log develop..HEAD --oneline`. There must be at least one commit beyond the
`chore(tasks): claim` commit. If not, report `No commits beyond claim — nothing to submit.`
and stop.

## 4. Push the branch

```
git push -u origin HEAD
```

## 5. Open the PR

`AGENTS.md §10` makes `.github/PULL_REQUEST_TEMPLATE.md` mandatory — do **not** write an
ad-hoc PR body. Read that template and fill **every** section, deriving content from the task
file:

- **Thinking Path** — trace from project context (`docs/strategy/roadmap.md`, the task's
  `## Goal` + `## Background`) down to this change.
- **What Changed** — bullet list from your commits + the task's `## Scope (in)`.
- **Verification** — from the task's `## Acceptance criteria`; name the checks you ran in 2b.
- **Risks** — from the task's `## Open questions` / `## Implementation notes`.
- **Model Used** — fill in your own model identity: provider, exact model ID, context window,
  capabilities. Never leave a placeholder.
- **Checklist** — check every item.

Title: `<ID>: <task title from frontmatter>`. Run:

```
gh pr create --title "<title>" --body "$(cat <<'EOF'
... filled-in template ...
EOF
)"
```

Capture the PR URL. Greptile will also review the PR (per `CONTRIBUTING.md`) — mention that in
the report; the skill does not run it.

## 6. Flip status to review on develop

The `review` flip belongs on `develop` so the board reflects it immediately. `/task-finish`
runs from the task's worktree, which cannot `git checkout develop` — the main checkout holds
that branch. Make the change in the **main checkout** instead of switching branches:

- Find the main checkout — the first entry of `git worktree list` (the one on `develop`).
- In that directory, edit the task file frontmatter: `status: in_progress` → `status: review`.
- In that directory, edit `docs/tasks/README.md`: set this task's `Status` column to `review`.
- Commit there (it is already on `develop`); stage only these two files:

```
git -C <main-checkout> add docs/tasks/<task-file> docs/tasks/README.md
git -C <main-checkout> commit -m "chore(tasks): submit <ID> for review (#<pr-number>)"
```

The session stays in the worktree — no branch switch, nothing to return from.

(Legacy single-checkout fallback: if there is no separate worktree, `git checkout develop`,
make the same two edits, commit, then `git checkout feature/<suffix>`.)

## 7. Report

Print:

- The PR URL
- A reminder that on PR merge the next step is to flip the task status to `done` (manual for
  now; could be automated by a CI hook later)

## Notes

- Do not auto-merge.
- The claim/submit commits are conventional, board-bookkeeping commits with no trailer;
  *code* commit and PR conventions follow `AGENTS.md`.
- If `gh` is not authenticated, tell the user to run `gh auth login` and stop.
