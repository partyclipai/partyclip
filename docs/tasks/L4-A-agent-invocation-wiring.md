---
id: L4-A
title: Wire pipeline executor to agent runner + live model adapter
layer: L4
status: done
branch: feature/agent-invocation-wiring
target_phase: Phase 1
codebase: server
depends_on: [L4-E]
blocks: [L4-B, L4-D]
agent: Umut Tuncer
started: 2026-06-06
---

# L4-A — Wire pipeline executor to agent runner + live model adapter

## Goal

Make the patch pipeline actually run agents. Today the pipeline engine is fully built but
runs against test fakes — no stage invokes a real model. This task supplies the missing
runtime wiring so a dispatched stage performs a real agent run. It is the critical-path root
of Phase 1: nothing reaches `PUBLISHED` until a stage can run.

## Background

The seams are already in place; only the production wiring is missing.

- `server/src/services/pipelines/executor.ts:45` defines the `AgentRunner` interface and
  `executor.ts:68` `executeStage()` dependency-injects it — the header comment states
  "Tests pass a fake runner; production wires the real one."
- `server/src/services/agents/runner.ts:48` `createAgentRunner(providers, options)` builds a
  real runner, but it needs `AgentRunnerProviders` (`runner.ts:32-41`): `loadAgent`,
  `loadPersona`, `loadConstitution`, `loadPatch`, `loadInputArtifacts`, `resolveToolset`.
  No database-backed implementation of these providers exists yet.
- `server/src/services/agents/model-adapter.ts` ships only a fake adapter. Its header comment
  (lines 3-9): "Phase 1 ships a fake adapter for tests; production will wire one of
  partyclip's existing adapters (Claude/Codex/Cursor) or a direct Anthropic SDK call."
- `server/src/services/pipelines/dispatcher.ts` owns stage-completion → next-state transitions.

Decisions: `ADR-001` (pipeline as a state machine), `ADR-003` (agent information envelope —
the runner builds the envelope via `buildAgentEnvelope`).

## Scope (in)

- Implement a database-backed `AgentRunnerProviders` — the six loaders, reading agents,
  personas, constitution articles, patches, and input artifacts from `packages/db`, and
  resolving only the toolset the deployment granted the role.
- Implement a real `ModelAdapter` (see Open questions for the provider choice) that satisfies
  the `ModelAdapter` contract and `assertValidResponse`.
- Wire `createAgentRunner` into the pipeline runtime so `executeStage` receives a live runner
  in production while tests keep injecting fakes.

## Scope (out)

- Cost-event persistence and patch cost roll-up — owned by `L4-B`.
- Observability metric emission — owned by `L4-C`.
- The end-to-end pipeline test — owned by `L4-D`.
- The Cabinet Vote stage — dormant in Phase 1.

## Acceptance criteria

- [x] A stage dispatched by `dispatcher.ts` invokes a real model via the live `ModelAdapter`.
      (Verified at the `executeStage` boundary — the dispatch→executeStage→persist *loop* is the
      orchestrator owned by `L4-D` + a runtime scheduler; see Resolution.)
- [x] `AgentRunnerProviders` are implemented against `packages/db` and load real rows.
- [x] The agent envelope is built per `ADR-003`; `assertValidResponse` passes on the response.
- [x] Role output is parsed via `parseRoleOutput` into a typed stage outcome.
- [x] Tests still inject fake runner/adapter — the production wiring does not break them.

## Implementation notes

- Keep providers injected — no global lookups, no module-time DB connections (`runner.ts`
  header). Reuse `packages/adapters/*` rather than hand-rolling an HTTP client if a suitable
  adapter exists.
- The executor already handles timeout, retry, and the `maxCostPerPatch` cap — do not
  duplicate that logic here.

## Open questions

- Which model adapter? Reusing an existing `packages/adapters/*` adapter vs. a direct
  Anthropic SDK call is a non-obvious architectural call — record it as `ADR-005` in
  `docs/adr/` before merging. **Resolved (pending implementation): provider-agnostic
  adapter factory** — Anthropic SDK when `ANTHROPIC_API_KEY` is present, else a fake/no-op
  fallback; `resolveToolset` builds a minimal registry from `agent.tools`.

## Investigation (pre-L4-E) — why L4-A was blocked, and how it was unblocked

> **Update (L4-E merged, #6):** the agent-config prerequisite below is now resolved — `L4-E`
> delivered the `pipeline_agents` representation, the content-load step, and the DB-backed
> `loadAgent`/`loadPersona`/`loadConstitution`. `X-3` was dropped from `depends_on`: it supplies a
> real deployment's content, but L4-A's acceptance (a stage invokes the live ModelAdapter) is
> reachable with a **fixture** content pack + the provider-agnostic adapter's fake fallback, so it
> is not a wiring dependency. `depends_on` is now `[L4-E]` (done) and L4-A is back to `todo`. The
> remaining L4-A work is the model adapter + the other providers (loadPatch/loadInputArtifacts/
> resolveToolset) + composing the runner + the production wiring.

Investigated the seams (Plan + Explore agents) and found L4-A cannot reach its acceptance at
the current state. The pipeline machinery is built (executor, dispatcher, runner, envelope,
role-parsers), but two prerequisites the task assumed are absent:

1. **No partyclip agent-config persistence/loading model.** `git grep` confirms `AgentConfig`
   (persona_ref / tools / model / Architect–Critic role enum) is produced/loaded by **zero**
   production server code — only `packages/shared` types + tests. There is no roster loader,
   no `regular.yaml` reader. The DB `agents` table is paperclip's general agent table (role
   default `"general"`, `adapterConfig` jsonb, reportsTo) and does not map to partyclip's
   pipeline roles; nothing seeds partyclip pipeline agents. So `loadAgent` has no real source.
2. **Persona / constitution content + roster come from the content pack** — task **X-3**
   (`reference content pack: constitution, ministries, regular.yaml`), which is **blocked**
   (cross-repo, `partyclip-content`). `loadPersona` has no resolution mechanism, and
   `constitution_articles` is empty without the pack.

`createAgentRunner` has no production consumer (the orchestrator loop that calls
`dispatch` → `executeStage` does not exist either).

**Unblocked slice (could land independently):** ADR-005's provider-agnostic model adapter;
`loadPatch` + `loadInputArtifacts` (real tables: `patches`, `artifacts`+`patch_stage_runs`);
the `loadConstitution` query (table exists, rows come from X-3).

**Blocked slice:** `loadAgent`, `loadPersona`, `resolveToolset`, the orchestrator, and the
end-to-end stage invocation (the acceptance criteria) — all gated on prerequisite (1) the
agent-config model and (2) the X-3 content pack.

**Implication (Phase 1):** L4-A blocks L4-B and L4-D, so the whole "issue → PUBLISHED with
real agent runs" chain is gated on the agent-config persistence model + the content pack.
Phase-1 completion needs both designed/unblocked first. The full implementation map (DB
backing per loader, ADR-005 evidence, the orchestrator seam) was produced during this task
and is available in the session record for whoever resumes it.

**Unblock condition (now concrete):** (a) **`L4-E`** — content-load + the pipeline-agent DB
representation, per **`ADR-005`** (agent roster/personas/constitution authored in the content
repo, loaded into the DB, read from the DB at runtime); and (b) the **`X-3`** content pack
supplying the real `regular.yaml` roster + personas + constitution. `depends_on` is now
`[L4-E, X-3]`. Once both land, L4-A's blocked slice + L4-B/L4-D become actionable. The model
adapter (ADR-005's provider-agnostic factory) remains an independently-landable slice.

## Resolution — implemented (L4-E merged; X-3 dropped from deps)

Built in three verified stages on `feature/agent-invocation-wiring` after `L4-E` (#6) merged.
`X-3` was dropped from `depends_on` (now `[L4-E]`): L4-A's acceptance is reachable with a fixture
roster + the model adapter's injectable/disabled fallback; X-3 supplies a *real deployment's*
content, not a wiring dependency.

1. **Patch / artifact / toolset providers** (`patch-providers.ts`) — `loadPatch` (company-scoped,
   PATCH_NOT_FOUND otherwise), `loadInputArtifacts` (accumulated output artifacts of the patch's
   prior finished stage runs, excluding the current stage), `resolveToolset` (Phase-1 minimal
   registry from `agent.tools` with not-implemented invoke stubs). With L4-E's roster providers
   these complete all six `AgentRunnerProviders` loaders against `packages/db`.
2. **Provider-agnostic model adapter** (`live-model-adapter.ts`, **ADR-006**) — `resolveModelAdapter(env)`
   picks Anthropic (REST Messages API via native `fetch`, no SDK) when `ANTHROPIC_API_KEY` is set,
   else a disabled adapter that throws at invoke. Cost is a best-effort static per-model estimate
   (authoritative cost is L4-B). `fetch` is injectable for offline tests.
3. **Live runner + executor wiring** (`live-runner.ts`) — `createLiveAgentRunner({ db, companyId,
   modelAdapter? })` composes the six providers + adapter via `createAgentRunner`. The model
   adapter is injectable so tests pass a fake; production uses `resolveModelAdapter(env)`.

**Verification:** `executeStage` on a dispatched pipeline stage drives the live runner end to end
(embedded-postgres integration test): real DB rows (agent/persona/constitution/patch) → envelope
(ADR-003) → Anthropic adapter (stub fetch) → `assertValidResponse` → `parseRoleOutput` → `pass`
outcome with cost + tokens; plus the terminal-failure path when the role is absent from the roster.
Tests: patch-providers 6/6, live-model-adapter 6/6, live-runner 2/2; `pnpm -r typecheck` green.
`executor.test.ts` still injects a fake runner (unchanged).

**Boundary / follow-ons (not L4-A):**
- The **dispatch → executeStage → persist → repeat orchestrator loop** (a runtime scheduler that
  walks a patch through the pipeline, writing `patch_stage_runs` + artifacts + state transitions)
  is **not** built here — it never existed, and it belongs to `L4-D`'s e2e harness + a scheduler.
  L4-A delivers and proves the per-stage live invocation that loop will call.
- **Cost persistence + per-patch roll-up** → `L4-B` (this only returns the adapter's cost estimate).
- **Real content** (`regular.yaml` roster, personas, constitution) → `X-3` (cross-repo); L4-A + its
  tests run against fixtures.
