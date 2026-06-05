# Task tracker — Phase 1

Status: ACTIVE | Updated: 2026-06-05

This directory is the trackable unit-of-work board for partyclip's Phase 1 cycle. Each `*.md`
file — except this `README.md` and `TEMPLATE.md` — is one task with frontmatter status.
Multiple agents work in parallel by claiming different tasks.

Strategic context: [`../strategy/roadmap.md`](../strategy/roadmap.md)
Definition of done and branch model: [`../strategy/delivery-plan.md`](../strategy/delivery-plan.md)

## Claim protocol (for agents)

1. **Pick a task** whose `status: todo` and whose `depends_on` IDs are all `done`.
2. **Edit the task file frontmatter** in a single commit on `develop`:
   - set `status: in_progress`
   - set `agent: <your-name-or-id>`
   - set `started: <YYYY-MM-DD>`
3. **Open the branch** named in the task's `branch:` field — `feature/<short-kebab>`, plain
   git off `develop`.
4. **Update status** as you go: `in_progress` → `review` (PR open) → `done` (merged).
5. **If blocked**, set `status: blocked` and add a `blocked_by:` reason in frontmatter.
6. **On done**, tick the relevant row in the board table below in the same commit that flips
   status.

Two agents must not claim the same task. If a task is already `in_progress` or `claimed`,
pick another. `/task-start <ID>` automates steps 1–3 and provisions the task's worktree;
`/task-finish` automates the step-4 `review` flip and opens the PR.

## Status legend

- `todo` — open, unclaimed
- `claimed` — picked up but no branch yet
- `in_progress` — branch open, work happening
- `review` — PR open, awaiting merge
- `done` — merged into `develop`
- `blocked` — see `blocked_by:` in the task file

## Board

Phase 1 is governance-layer work, so every task sits in **L4 — Governance & Audit** or in
**Cross-cutting**. Layers L0–L3, L5, L6 carry no Phase 1 tasks; later phases populate them.

### L4 — Governance & Audit

| ID | Title | Status | Branch | Phase | Depends on |
|---|---|---|---|---|---|
| [L4-A](./L4-A-agent-invocation-wiring.md) | Wire pipeline executor to agent runner + live model adapter | todo | `feature/agent-invocation-wiring` | Phase 1 | — |
| [L4-B](./L4-B-cost-production.md) | Cost production from the live model adapter | todo | `feature/pipeline-cost-production` | Phase 1 | L4-A |
| [L4-C](./L4-C-observability-aggregates.md) | Observability aggregates — cost + rejection-rate dashboard | todo | `feature/observability-aggregates` | Phase 1 | L4-B |
| [L4-D](./L4-D-pipeline-e2e-test.md) | End-to-end pipeline test (canned issue → PUBLISHED) | todo | `feature/pipeline-e2e-test` | Phase 1 | L4-A, L4-B |

### Cross-cutting

| ID | Title | Status | Branch | Phase | Depends on |
|---|---|---|---|---|---|
| [X-1](./X-1-ci-timeout-mitigation.md) | CI timeout mitigation for adapter-utils SSH/sandbox tests | todo | `feature/ci-timeout-mitigation` | Phase 1 | — |
| [X-2](./X-2-paperclip-required-enum.md) | Revisit `paperclip_required` enum (hermes compat) | todo | `feature/paperclip-required-enum` | Phase 1 | — |
| [X-3](./X-3-reference-content-pack.md) | Reference content pack (constitution, ministries, `regular.yaml`) | blocked | — | Phase 1 | — |
| [X-4](./X-4-upstream-ssh-env-sanitization.md) | Cherry-pick upstream SSH/remote-exec env-leak security fixes | done | `feature/upstream-ssh-env-sanitization` | Phase 1 | — |
| [X-5](./X-5-claude-model-refresh.md) | Claude model refresh — sync claude-local model list with upstream | done | `feature/claude-model-refresh` | Phase 1 | — |
| [X-6](./X-6-upstream-sync-triage.md) | Upstream-sync triage — evaluate Tier 2/3 candidates for cherry-pick | in_progress | `feature/upstream-sync-triage` | Phase 1 | — |
| [X-7](./X-7-adapter-sandbox-hardening.md) | Cherry-pick upstream adapter/remote-sandbox hardening fixes | todo | `feature/adapter-sandbox-hardening` | Phase 1 | — |

## Decisions referenced as `ADR-NNN`

Tasks cite architectural decisions by ADR ID. The records live in [`../adr/`](../adr/):

- **ADR-001** — patch pipeline as a state machine. Its appendix documents the Phase-0
  `paperclip_required` carry-over — see task `X-2`.
- **ADR-002** — event store schema and replay.
- **ADR-003** — agent information envelope.
- **ADR-004** — rejection as a structured record.

A task may list an `ADR-NNN` in `depends_on:`; it is satisfied once `docs/adr/ADR-NNN-*.md`
exists. There is no `D-E<n>` scheme — see
[`../strategy/delivery-plan.md`](../strategy/delivery-plan.md) §3.
