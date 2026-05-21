---
id: L4-A
title: Wire pipeline executor to agent runner + live model adapter
layer: L4
status: todo
branch: feature/agent-invocation-wiring
target_phase: Phase 1
codebase: server
depends_on: []
blocks: [L4-B, L4-D]
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

- [ ] A stage dispatched by `dispatcher.ts` invokes a real model via the live `ModelAdapter`.
- [ ] `AgentRunnerProviders` are implemented against `packages/db` and load real rows.
- [ ] The agent envelope is built per `ADR-003`; `assertValidResponse` passes on the response.
- [ ] Role output is parsed via `parseRoleOutput` into a typed stage outcome.
- [ ] Tests still inject fake runner/adapter — the production wiring does not break them.

## Implementation notes

- Keep providers injected — no global lookups, no module-time DB connections (`runner.ts`
  header). Reuse `packages/adapters/*` rather than hand-rolling an HTTP client if a suitable
  adapter exists.
- The executor already handles timeout, retry, and the `maxCostPerPatch` cap — do not
  duplicate that logic here.

## Open questions

- Which model adapter? Reusing an existing `packages/adapters/*` adapter vs. a direct
  Anthropic SDK call is a non-obvious architectural call — record it as `ADR-005` in
  `docs/adr/` before merging.
