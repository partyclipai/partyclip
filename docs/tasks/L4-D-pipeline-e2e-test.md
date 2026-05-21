---
id: L4-D
title: End-to-end pipeline test (canned issue → PUBLISHED)
layer: L4
status: todo
branch: feature/pipeline-e2e-test
target_phase: Phase 1
codebase: server
depends_on: [L4-A, L4-B]
blocks: []
---

# L4-D — End-to-end pipeline test (canned issue → PUBLISHED)

## Goal

Prove Phase 1's headline claim with an automated test: a canned issue travels the full patch
pipeline to `PUBLISHED`, cost is logged, and audit-log replay reconstructs the final state.
Without this test "Phase 1 done" is an assertion, not a fact.

## Background

- The pipeline states are defined by `ADR-001`:
  `DRAFTING → CRITIQUE → RISK_ASSESS → EXECUTOR → BIAS_MIRROR → AWAITING_SIGNOFF → PUBLISHED`.
- Existing coverage is per-component, not end-to-end: `server/src/__tests__/operator-routes.test.ts`
  (operator API integration), `server/src/services/pipelines/executor.test.ts`,
  `.../pipelines/dispatcher.test.ts`.
- `L4-A` makes stages invoke a real `ModelAdapter`; the `ModelAdapter` contract
  (`server/src/services/agents/model-adapter.ts`) is deliberately small so a canned adapter
  with deterministic responses can stand in for a provider.
- `L4-B` makes runs write `costEvents` rows and roll up a per-patch total.
- `ADR-002` covers event-store replay — the test asserts replay reconstructs state.

## Scope (in)

- A new test `server/src/__tests__/pipeline-end-to-end.test.ts`.
- Drive a canned issue through every stage to `PUBLISHED` using a canned `ModelAdapter` with
  deterministic per-role responses.
- Assert: final state is `PUBLISHED`; audit-log events are recorded for every transition;
  per-stage and per-patch cost are logged; replaying events reconstructs the final state.

## Scope (out)

- Real model-provider calls — the test uses only canned responses.
- Load / performance testing.
- A rejection-path or operator-override scenario test — valuable, but a separate task.

## Acceptance criteria

- [ ] `pipeline-end-to-end.test.ts` runs a canned issue from `DRAFTING` to `PUBLISHED`.
- [ ] The test asserts audit-log events for every stage transition.
- [ ] The test asserts per-stage and per-patch cost are logged.
- [ ] The test asserts replay reconstructs the final patch state.
- [ ] The test passes under `pnpm test`.

## Implementation notes

- Build the canned `ModelAdapter` on the same `ModelAdapter` interface used by `L4-A` so the
  test exercises the real runner + executor + dispatcher path, only the model is faked.

## Open questions

- Fixture content: depend on `X-3`'s reference content pack, or ship a minimal in-repo fixture
  (a tiny constitution + `regular.yaml` under `server/src/__tests__/fixtures/`)? Recommended:
  the in-repo fixture, so `L4-D` is not blocked on a cross-repo task.
