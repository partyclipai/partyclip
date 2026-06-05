---
id: X-6
title: Upstream-sync triage — evaluate Tier 2/3 candidates for cherry-pick
layer: cross-cutting
status: done
branch: feature/upstream-sync-triage
target_phase: Phase 1
codebase: multiple
depends_on: []
blocks: []
agent: Umut Tuncer
started: 2026-06-05
---

# X-6 — Upstream-sync triage — evaluate Tier 2/3 candidates for cherry-pick

## Goal

partyclip is a soft fork of `paperclipai/paperclip`. As of 2026-06-04 there are 227 upstream
commits in `685ee84e..upstream/master` since the fork point (`685ee84e`, forked 2026-05-05).
The clearly-actionable Tier-1 items are already split out as siblings X-4 (SSH env-leak
security fixes) and X-5 (Claude model refresh). This task triages the remaining higher-value
candidate clusters against the `docs/upstream-sync.md` cherry-pick policy.

This is a **decision/triage task, not an implementation task**. Its deliverable is a
documented pull / defer / skip decision per cluster, plus follow-up task files for whatever is
accepted — not the large cherry-picks themselves.

## Background

- `docs/upstream-sync.md` is the cherry-pick policy. It says *pull* security fixes, plugin SDK
  improvements (`packages/plugins/sdk/`), non-conflicting adapter improvements, shared-infra
  bug fixes, performance/stability work, and test-infra improvements; *skip* Paperclip-product
  primitives (CEO/department/task), Paperclip branding/strings, anything re-introducing the
  renamed `@paperclipai`/`paperclipai`/`PAPERCLIP_`/`Paperclip` identifiers, and
  `paperclipai`-scoped release automation.
- `UPSTREAM_VERSION` holds the fork-point SHA `685ee84e4a9c33d37d3c9900cc810c3a9d2f373c`. The
  survey range is `$(grep -E '^[a-f0-9]{40}$' UPSTREAM_VERSION)..upstream/master`.
- Sibling Tier-1 tasks: X-4 (SSH env-leak security fixes), X-5 (Claude model refresh). Those
  cover the unambiguous pulls; X-6 covers the judgement calls below.

Candidate clusters surveyed for this cycle:

- **(a) Plugin SDK / host surface.** `3c73ed26` (#5205 Expand plugin host surface), `b947a7d7`
  (#5821 Improve local plugin development workflow), `a1835cfa` (#6547 Harden plugin runtime
  invocation scope). Squarely in the policy's "plugin SDK improvements" bucket and relevant to
  partyclip's plugin model (news-ingest, SDK).
- **(b) CI stability.** Upstream improved `scripts/run-vitest-stable.mjs` — `47920f9c` (#5147
  Speed up PR CI critical path), `81d18f2d` (#6137 speed up PR verify workflow). This
  **overlaps with existing task X-1** (CI timeout mitigation for adapter-utils SSH/sandbox
  tests). The right move is to fold the upstream CI fix into X-1, not spawn a duplicate.
- **(c) New adapters partyclip lacks.** `grok-local` (`ab8b4716` #6087, ~2030 LOC),
  `cursor-cloud` (`534aee66` #5664, ~1935 LOC). Backend-dependent — pull only if partyclip
  wants those model backends.
- **(d) New sandbox-provider plugins.** Modal, Cloudflare, Daytona, exe.dev, Novita.
  Plugin-SDK-conformant; could be absorbed into partyclip's plugin host.
- **(e) Skills CLI + new `packages/skills-catalog` package.** `9eac727c` (#6782) — a whole new
  subsystem (agent "skills"). Needs a design decision on whether it fits partyclip's
  leader/ministry/policy-patch model; if pursued, record an `ADR-NNN` in `docs/adr/`.

Per policy, the following upstream work is **skip** (Paperclip-product primitives partyclip
replaces): issue document locking, document annotations/comments, resource membership
controls, recovery handoff, routine revision history, company search, planning mode, agent
permissions, blocked inbox.

## Scope (in)

- For each cluster **(a)–(e)**, produce a **pull / defer / skip** decision with a one-line
  rationale grounded in `docs/upstream-sync.md`.
- For each accepted pull, create a follow-up task file under `docs/tasks/` at the next free
  `X-<n>` ID (or note the intended ID if the work is deferred), scoping the actual cherry-pick.
- Update **X-1** to reference the upstream `scripts/run-vitest-stable.mjs` improvements
  (`47920f9c`, `81d18f2d`) so the CI fix is absorbed there rather than duplicated.
- If skills-catalog **(e)** is pursued, draft the adoption `ADR-NNN` in `docs/adr/`.

## Scope (out)

- Performing the large cherry-picks themselves — `grok-local`, `cursor-cloud`,
  `skills-catalog`. Each accepted pull becomes its own follow-up task; this task only decides
  and scopes.
- The Tier-1 work already owned by X-4 (SSH env-leak) and X-5 (Claude model refresh).
- The explicitly-skipped Paperclip-product primitives listed in Background — recorded as skip,
  not evaluated further.

## Acceptance criteria

- [x] A documented pull / defer / skip decision, with a policy-grounded one-line rationale,
      exists for each of clusters (a), (b), (c), (d), and (e).
- [x] A follow-up task file exists for every cluster decided "pull" (or a noted next-free
      `X-<n>` ID for every "defer").
- [x] X-1 is updated to point at the upstream `run-vitest-stable.mjs` improvements
      (`47920f9c`, `81d18f2d`).
- [x] Skills-catalog (e) adoption decision recorded — **deferred** (not accepted), so no ADR is
      required now; `ADR-005` is to be written if/when it is pursued (see Resolution + Open questions).
- [x] Any other non-obvious adoption decision is captured as an ADR or written down in the
      relevant follow-up task.

## Implementation notes

- Cite `docs/upstream-sync.md` for the policy in every rationale. The board's `ADR-NNN`
  records live in `docs/adr/` (`ADR-001`–`ADR-004` currently exist); a new ADR for (e) would
  be `ADR-005`.
- Re-run the survey before deciding, in case upstream moved since 2026-06-04:
  `git fetch upstream && git log $(grep -E '^[a-f0-9]{40}$' UPSTREAM_VERSION)..upstream/master --oneline`.
  The upstream default branch is `upstream/master` (`upstream/main` does not exist);
  `docs/upstream-sync.md` was corrected to match.
- This task is the recurring **"routine sync" review entry point** for future cycles — keep
  its decision format reusable so the next sync can repeat it.
- Cluster (b) is the only one with an existing-task overlap (X-1); resolve by editing X-1, not
  by creating an X-6 child.

## Open questions

- (e) skills-catalog: does an agent-"skills" subsystem map onto partyclip's
  leader/ministry/policy-patch model, or does it conflict with it? This is the load-bearing
  design call — record it as `ADR-005` if pursued.
- (c)/(d): does partyclip actually want the `grok-local` / `cursor-cloud` backends or the new
  sandbox providers (Modal, Cloudflare, Daytona, exe.dev, Novita) for Phase 1, or are they
  Phase 2 "defer"? Decide per backend, not as one block.

## Resolution

Survey re-run on 2026-06-05: `685ee84e..upstream/master` is now **247 commits** (upstream/master
`3657854e`; +20 since the 2026-06-04 snapshot — the delta is dependency bumps + Paperclip-product
work, all skip). Decisions per cluster, grounded in `docs/upstream-sync.md`:

| Cluster | Decision | Rationale | Follow-up |
|---|---|---|---|
| **(a)** Plugin SDK / host surface (`3c73ed26`, `b947a7d7`, `a1835cfa`) | **DEFER → Phase 2** | The security hardening `a1835cfa` sits on top of `3c73ed26`'s host-surface expansion (~27.5k LOC / 89 files, incl. `create-paperclip-plugin`→`create-partyclip-plugin` rename conflicts) — it edits `protocol.ts`/`host-client-factory.ts` that `3c73ed26` heavily changed, so it cannot be cleanly pulled in isolation. The stack is a Phase-2-sized SDK upgrade; partyclip's only Phase-1 plugin (news-ingest) is first-party, so invocation-scope hardening is not load-bearing yet. | noted **X-8** |
| **(b)** CI `run-vitest-stable.mjs` (`47920f9c`, `81d18f2d`) | **FOLD into X-1** | Overlaps the existing X-1 CI-timeout task; partyclip ships the same runner. Pointer added to X-1 Implementation notes — no duplicate task. | X-1 updated |
| **(c)** New model adapters `grok-local` (`ab8b4716`), `cursor-cloud` (`534aee66`) | **DEFER → Phase 2** | partyclip lacks both (~2k LOC each); backend-dependent. Phase 1's lane is `claude-local` / the live adapter (L4-A) — neither backend is on the critical path. | noted **X-9** |
| **(d)** New sandbox-provider plugins (Modal, Cloudflare, Daytona, exe.dev, Novita) | **DEFER → Phase 2** | partyclip ships only the `e2b` provider; the five are additive, standalone plugin packages (excluded from the workspace). Sandbox execution is not on the Phase-1 pipeline path. | noted **X-10** |
| **(e)** Skills CLI + `packages/skills-catalog` (`9eac727c`) | **DEFER — pending design call** | A whole new agent-"skills" subsystem (77 files, +9.7k). The load-bearing question — does it map onto partyclip's leader/ministry/policy-patch model or conflict with it? — is unresolved. Not adopting in Phase 1; record as **ADR-005** if/when pursued. (partyclip already has partial per-adapter `skills.ts`; the catalog/CLI layer is the new part.) | noted **X-11** + ADR-005 |
| **(f)** Adapter / remote-sandbox hardening (`12cb7b40` #5444, `b24c6909` #5685, `d1a8c873` #5922) — *surfaced by the survey scan, beyond the original cluster list* | **PULL** | Tier-1 security/stability in `packages/adapter-utils` (the same plumbing partyclip ships), not covered by X-4's env-leak scope. Policy: pull security + shared-infra stability. Excludes `1bd44c8a` (#5967, Cloudflare-sandbox-specific — partyclip lacks it) and `68f69975` (#5292, control-plane/issue — Paperclip-product). | **X-7** (task file created) |

**Skip** (per policy — Paperclip-product primitives partyclip replaces): issue document locking,
document annotations/comments, resource membership, recovery handoff, routine revision history,
company search, planning mode, agent permissions, blocked inbox — plus the +20 recent delta
(dependency bumps, comment redaction, routines, operator QoL, document comments).

**Net:** Phase 1 takes only **X-7** (further adapter-utils hardening) now; everything else is
Phase-2 deferred (X-8–X-11) or folded (X-1). This matches the Phase-1 goal — the pipeline
(L4-A–D) plus the Tier-1 security/model pulls (X-4/X-5, done); none of the deferred clusters
serve it. The deferred X-IDs are noted, not yet authored, to keep the Phase-1 board uncluttered.

**Reusable next-cycle survey:**
`git fetch upstream && git log $(grep -E '^[a-f0-9]{40}$' UPSTREAM_VERSION)..upstream/master --oneline`.
