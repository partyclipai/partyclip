# CLAUDE.md

Entry point for Claude agents working in this repo.

**Read [`AGENTS.md`](./AGENTS.md) first** — it is the canonical contributor guide: engineering
rules, the db → shared → server → ui contract-sync rule, commit conventions, the mandatory
PR template, and the Definition of Done. This file covers only the Claude task workflow
layered on top; on commits and PRs it defers to `AGENTS.md`.

## Task workflow

Phase 1 work is tracked as a markdown task board:

- Start at [`docs/tasks/README.md`](./docs/tasks/README.md) — the board, claim protocol,
  status legend.
- Strategy lives in [`docs/strategy/`](./docs/strategy/): `roadmap.md` (the 7-layer
  architecture and phase model) and `delivery-plan.md` (Phase 1 definition of done, branch
  model, decision convention).
- The board is the local Phase-1 dev tracker. It coexists with Paperclip control-plane issues
  (`AGENTS.md §5`) — it does not replace them.

## Skills

- `/task-list` — list ready-to-claim tasks (status `todo` with all dependencies satisfied).
- `/task-start <ID>` — claim a task, provision its worktree + feature branch, enter it.
- `/task-finish` — push the branch, open the PR, flip the task to `review`.

## Subagents

Project subagents live in `.claude/agents/` (committed — every parallel worktree session gets
them). Reviewers are read-only: they report; the main session applies fixes. `/task-finish`
runs the relevant ones as the pre-PR convention gate.

- `pr-reviewer` — branch vs. partyclip conventions: conventional commits, PR-template
  compliance (incl. Model Used), branch naming, task frontmatter, spec co-edits.
- `server-reviewer` — `server/` review: company-scoping, actor permissions, the error model,
  activity logging, pipeline/agent-runner correctness.
- `ui-reviewer` — `ui/` review: routes vs. API surface, company-selection context, surfaced
  API errors, design-system adherence.
- `schema-contract-reviewer` — enforces the db → shared → server → ui contract-sync rule.
- `spec-verifier` — reports `docs/specs/*.md` drift against code, in its own context.
- `task-author` — drafts a new `docs/tasks/<ID>-*.md` in the standard frontmatter + section
  format.

## Parallel task work: git worktrees

Several Claude sessions run in parallel, one per task. They cannot share a single checkout —
`git checkout` in one session moves `HEAD` for all of them. Each task runs in its own **git
worktree**: a separate folder with its own branch, one shared `.git`.

- The main checkout stays on `develop` — the clean reference. Don't do task work in it; run
  `/task-start` from it.
- `/task-start <ID>` does the setup: it claims the task on `develop`, then runs
  `scripts/new-worktree.sh <ID>` to create the `feature/` branch and a sibling worktree
  (`../partyclip-<id>`), copying the git-ignored files a fresh checkout needs (`.env`,
  `.claude/settings.local.json`, `.partyclip/` — each if present).
- `node_modules` is not carried over — run `pnpm install` in the worktree if the task needs
  deps. The PGlite dev DB (`data/`) is recreated per worktree by `pnpm dev`.
- After the task's PR merges: `git worktree remove ../partyclip-<id>`.

partyclip uses plain git — `feature/<short-kebab>` branches off `develop`, no git-flow CLI.

## Package manager

pnpm only. `pnpm -r typecheck`, `pnpm test` (the cheap Vitest default), `pnpm build`. See
`AGENTS.md §7` for the full verification tiers.
