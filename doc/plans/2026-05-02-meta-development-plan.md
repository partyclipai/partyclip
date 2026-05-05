# partyclip — Meta Development Plan

> Meta plan: organizes the roadmap in `ROADMAP.md` and `README.md` into actionable engineering workstreams, sequencing, and gating criteria. Sanitized externalization of internal planning notes (deployment-specific, legal, and reputational considerations live in the private `app-deploy` planning doc, not here).

## 1. Reading order

For anyone (human or agent) picking this up cold:

1. `README.md` — what partyclip is, primitives, status
2. `AGENTS.md` — repo conventions, dev setup, DoD
3. `doc/SPEC.md` and `doc/SPEC-implementation.md` — Paperclip substrate (still authoritative for runtime/scheduler/plugin SDK)
4. This document — what we are layering on top, in what order
5. `ROADMAP.md` — upstream Paperclip directional milestones (informational)

## 2. Strategic framing (one paragraph)

partyclip is a thin layer over Paperclip that adds party-shaped primitives (constitution, patch pipeline, voting, dissents, bias review, citizen tiers, revenue streams, forum ingestion). Core stays close to upstream; country/party specifics live in plugins and a content repo. Default ships zero branding, zero policy, zero opinions. The first reference deployment is built and operated separately, and is not the product of this repo.

## 3. Engineering principles (binding)

These are decisions, not preferences. Push back in writing, not in code.

1. **Plugins over forks.** New primitives that a different party would want differently → plugin. New primitives every party needs → core.
2. **Additive over invasive.** Avoid modifying Paperclip's files where a new file works. This protects upstream sync.
3. **Forward-compatible schemas, just-in-time features.** Design entities for v1 ambition; activate only the v0 surface. Migrations under public scrutiny are painful.
4. **Append-only audit by construction.** Every governed state change emits an event; current state is a projection. No silent mutations, no hard deletes of governed artifacts.
5. **Operator sign-off is load-bearing.** No auto-publish path exists. Ever.
6. **Agents read constitution + persona only.** They are unaware of deployment-level framing.
7. **Default ships empty.** Branding, constitution text, ministry roster, disclaimers — supplied by the deploying party, not the repo.

## 4. Workstreams

Six parallel-ish workstreams. Dependencies noted. Owners TBD; each workstream needs a single accountable name before it leaves Phase 0.

### W1. Substrate alignment (Paperclip ⇄ partyclip)

**Goal:** keep partyclip mergeable with upstream Paperclip without losing party primitives.

- Document upstream sync policy: cadence, how to evaluate breaking changes (adopt / skip / pin).
- Add `Last synced with Paperclip:` line maintenance script or checklist.
- Build one toy plugin against Paperclip's plugin SDK to validate that "plugins over forks" is real, not aspirational. Write notes back into `adapter-plugin.md` or a sibling doc.
- Decide which Paperclip primitives we re-use as-is vs. wrap (issues, tasks, runs, activity log, budget, scheduler).

**Exit:** written sync policy; one working toy plugin; mapping table `Paperclip primitive → partyclip use`.

### W2. Data model & schema

**Goal:** the entities that govern everything else.

Entities (v0 schema, some surfaces deferred):

- `ConstitutionArticle` (stable id `CONST-K{book}-A{n}`, mutability enum, body)
- `Patch` (classification: `REGULAR | CROSS_CUTTING | CONSTITUTIONAL`, citations[])
- `PatchStageRun` (one per pipeline stage, links to agent run)
- `Artifact` (typed payloads: PatchBody, PressRelease, BiasReport, RiskAssessment, ExecutionPlan, …)
- `Vote` (binary critic vote v0; cabinet vote schema present, gated off)
- `Dissent` (any agent, any stage, first-class)
- `BiasReport` (categories: cultural-default | linguistic | constitutional-misalignment | epistemic-overconfidence | tone-drift)
- `OperatorAction` (intercept | approve | kill | override)
- `Rejection` (structured reason; sends back to DRAFTING)
- `Citizen` (skeleton; tier enum; provider sub + email + handle only)
- `RevenueStream` (transparency_level enum; reason field)
- `Disclaimer` (placement enum; text supplied by deployment)
- `FeedbackSummary` (strictly typed; produced by ForumIngestor)

**Deliverables:** `docs/data-model.md` with entity diagrams + Drizzle schema in `packages/db`. ADR-001: pipeline as state machine. ADR-002: append-only audit via event sourcing.

**Depends on:** W1 (knowing what we re-use vs. wrap).

**Exit:** schema compiles; migrations generate; ADRs merged.

### W3. Pipeline runtime

**Goal:** end-to-end execution of one patch through one pipeline.

- Pipeline definition format (YAML): stages, agents per stage, gates, classification routing.
- State machine: `DRAFTING → CRITIQUE → RISK_ASSESS → EXECUTOR → BIAS_MIRROR → AWAITING_SIGNOFF → PUBLISHED` (plus `REPEALED`, `KILLED`).
- Stage-as-agent-run: each stage spawns a Paperclip task/run with structured inputs and structured outputs.
- Rejection → re-enter `DRAFTING` with reason attached.
- Operator intercept at any stage; approval only at the terminal gate.
- Cabinet vote (v0.2) — schema present, executor gated off.
- Constitutional patch routing — schema present, gate enforces `IMMUTABLE` lock.

**Depends on:** W2.

**Exit:** operator opens an issue → Architect drafts → Critic → Risk → Executor → BiasMirror → operator approves → patch is `PUBLISHED`. Audit log shows every step with cost.

### W4. Governance gates

**Goal:** the things that make output legible and dissent-preserving.

- Bias Mirror agent role: prompt iterated as a first-class artifact, not a one-liner. Output strictly typed `BiasReport`.
- Citation gate: configurable per pipeline; APP-style deployments require constitution citations.
- Dissent capture: any agent at any stage emits a `Dissent`; published with the patch.
- Operator UI: sign-off, intercept, kill, override (override never silenced — recorded as `OperatorAction`).
- Audit log viewer (read-only).

**Depends on:** W2, W3.

**Exit:** operator can refuse a patch and the system records why; bias mirror emits structured reports; dissents render in patch view.

### W5. Public surface & first-party plugins

**Goal:** what the world sees, when it sees anything.

First-party plugins (each its own package under `packages/plugins/` or sibling repos):

- `news-ingest` — scheduled fetch + structured event emission.
- `cabinet-meeting` — scheduled cross-domain review of in-flight patches.
- `manifesto-builder` — assemble published patches into a coherent manifesto document.
- `public-site` — composable widget renderer. Universal widgets: `Intro`, `LatestPublished`, `InFlight`, `Manifesto`, `CostDashboard`, `Issues`, `Donation`, `PressFeed`, `Badges`, `Events`, `Contrast`.
- `press-release` — Spokesperson agent generates `PressRelease` from approved `Patch`; published together.
- `disclaimer` — enforces required placements; party supplies text.

**Depends on:** W2, W3 (data + lifecycle); W1 (plugin SDK shape).

**Exit:** anonymous reader can browse published patches and press releases on a deployment; cost dashboard works; disclaimers render at every required placement.

### W6. Citizen layer

**Goal:** registration, paid tier, forum, feedback ingestion, money. Not unlocked until W3–W5 are stable.

- Auth: Google social login only in v0; provider sub + email + handle stored, nothing else. Single provider per account.
- Tier model: `Anonymous | RegisteredFree | PaidSupporter | Operator`. Time-delayed visibility on artifacts (`visibility_class` + delay).
- Forum: threads, posts, badges. Default open; private-thread support but always logged/auditable.
- `ForumIngestor` — **isolated execution environment**, no tools, no constitution access. Reads raw threads → emits typed `FeedbackSummary`. Only Spokesperson + Analyst consume the summary downstream.
- Brigading weight formula: `account_age × donation_commitment × good_faith_engagement`. Published.
- Payment processor plugin contract: `initiate / webhook / cancel / refund / balance / list`. First two implementations are deployment-specific; ship the contract + a reference no-op processor in core.
- Per-revenue-stream `transparency_level` with required reason for non-public.
- Budget runway thresholds: graceful degradation (local model fallback, then pause non-essential pipelines, banner-disclosed).

**Depends on:** W2, W3, W4, W5; legal review (deployment-side, not core).

**Exit:** end-to-end registration → comment → advisory vote → subscribe → see appropriately-delayed artifact.

## 5. Sequencing (calendar shape, not commitment)

| Phase | Window | Workstreams active | Public surface |
|---|---|---|---|
| 0 — Foundation | now → end May 2026 | W1, W2 (start) | none |
| 1 — Core | Jun → Aug 2026 | W2 (finish), W3, W4 | none (operator-only) |
| 2 — Read-only | Sep → Nov 2026 | W5; W4 hardening | anonymous reads |
| 3 — Citizen layer | Dec 2026 → Feb 2027 | W6 | accounts, forum, paid tier |
| 4 — Scale | Mar 2027+ | W3 (cabinet vote, constitutional pipeline), W5 (more plugins), W6 (more processors) | sustained operation |

## 6. Phase 0 exit checklist (what we owe before Phase 1)

- [ ] `docs/architecture.md` — externalized, sanitized version of the architecture (no deployment-specific framing).
- [ ] `docs/data-model.md` — entity-by-entity schema rationale.
- [ ] ADR-001: pipeline as state machine.
- [ ] ADR-002: append-only audit via event sourcing.
- [ ] Upstream sync policy doc (cadence, breaking-change protocol).
- [ ] One toy plugin written against Paperclip's plugin SDK — notes captured.
- [ ] `packages/db` carries v0 schema for all entities in §W2.
- [ ] Decision recorded: which Paperclip primitives we re-use vs. wrap.

## 7. Cross-cutting risks (engineering-side only)

Deployment-side risks (legal, reputational, operational burnout, government action) are tracked in the private deploy planning doc — they shape *whether* a deployment ships, not *how the framework is built*.

| Risk | Likelihood | Mitigation |
|---|---|---|
| Plugin SDK is awkward to use | medium | W1's toy plugin proves it before we commit to the abstraction |
| Append-only audit leaks via a forgotten code path | medium | central event emitter; lint rule or test that flags direct entity mutations on governed tables |
| Bias Mirror is theatrical (rubber-stamps) | medium | structured categories not vibes; periodic external audit; publish negative results (catches and misses) |
| Schema churn during W3/W4 forces W5 rewrites | medium | W2 must finish before W5 starts; freeze entity surface at end of Phase 1 |
| Upstream Paperclip breaking change | low | additive-only convention; periodic small syncs > rare large catch-ups; explicit adopt/skip/pin decision per breaking release |
| Operator sign-off becomes a single point of failure (in any deployment) | medium | core ships sign-off rubric template + multi-operator routing + auto-pause-on-no-action — even if first deployment uses one person |

## 8. Open engineering questions (write down so we don't forget)

1. Do we re-use Paperclip's task model as `PatchStageRun`, or is `PatchStageRun` a sibling entity that *references* a Paperclip run? (Affects how budget and activity-log layers compose.)
2. Where does the event-sourced audit log live — extend Paperclip's activity log, or new table? (Trade-off: integration vs. invariants we control.)
3. Is `BiasReport` structured tightly enough to be useful, or will agents drift to free-text fields in practice? Need eval harness.
4. Time-delayed visibility — enforced at API layer (most defensible) or at projection layer (cheaper)? Probably API.
5. Constitution citations — store as `(article_id, relevance)` rows, or embedded JSON on Patch? Rows for query, JSON for snapshot — leaning rows + materialized snapshot per stage run.
6. Cabinet vote quorum default for `CROSS_CUTTING` patches: half of relevant Heads, all, or per-ministry-configurable? Defer until Phase 4 design.

## 9. Definition of done for this document

Same rule as `AGENTS.md`: this plan is living. Update it when reality contradicts it. Supersede it with a clearer plan and link from here. Do not silently rewrite history.
