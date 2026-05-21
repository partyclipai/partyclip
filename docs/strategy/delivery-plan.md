# partyclip — Delivery Plan

Status: ACTIVE | Updated: 2026-05-21 | Strategic context: [`roadmap.md`](./roadmap.md)

Translates the roadmap into a definition of done, a branch model, and a pointer to the live
task board.

## 1. Phase 1 — definition of done

Phase 1 closes when all of the following hold:

- A canned issue travels the full patch pipeline —
  `DRAFTING → CRITIQUE → RISK_ASSESS → EXECUTOR → BIAS_MIRROR → AWAITING_SIGNOFF → PUBLISHED` —
  driven by real agent runs.
- End-to-end run cost is produced and logged per stage and per patch.
- Audit-log replay reconstructs patch state from the genesis event.
- Operator sign-off, intercept, kill, and override are each recorded as audit events.
- The news-ingest plugin runs out-of-process.

The board's `L4-A`/`L4-B`/`L4-C` tasks plus `L4-D` (the end-to-end test) are the remaining
work to reach this bar.

## 2. Branch model

partyclip uses plain git — **no git-flow CLI**.

- Integration branch: `develop`. All feature work merges here via PR.
- Release branch: `master`.
- Feature branches: `feature/<short-kebab>`, cut from `develop`. Names are short; the full
  task ID goes in the PR title/body, not the branch.
- Each task runs in its own git worktree so several agents work in parallel without branch
  switches colliding — see [`../../CLAUDE.md`](../../CLAUDE.md) and `scripts/new-worktree.sh`.

Commit and PR conventions are defined in [`../../AGENTS.md`](../../AGENTS.md): conventional
commits, and the mandatory `.github/PULL_REQUEST_TEMPLATE.md` (Thinking Path / What Changed /
Verification / Risks / Model Used / Checklist). This delivery plan does not restate them.

## 3. Decisions

Non-obvious architectural calls are recorded as ADRs in [`../adr/`](../adr/), using the
existing table-header format — `ADR-001`..`ADR-004` are the precedent. A task that needs a
decision before it can proceed cites the ADR in its `depends_on:` as `ADR-NNN`; `/task-start`
and `/task-list` treat an `ADR-NNN` dependency as satisfied once a file
`docs/adr/ADR-NNN-*.md` exists.

There is **no** `docs/strategy/decisions/` directory and no `D-E<n>` scheme — ADRs in
`docs/adr/` are the single decision record.

## 4. The board

[`../tasks/README.md`](../tasks/README.md) is the live task board. It is the local Phase-1
development tracker; it coexists with — and does not replace — Paperclip control-plane issues
(see `AGENTS.md §5`). Use the markdown board for framework-build tasks worked by parallel
Claude sessions; use Paperclip issues for control-plane-coordinated work.
