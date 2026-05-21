---
id: L4-B
title: Cost production from the live model adapter
layer: L4
status: todo
branch: feature/pipeline-cost-production
target_phase: Phase 1
codebase: multiple
depends_on: [L4-A]
blocks: [L4-C, L4-D]
---

# L4-B — Cost production from the live model adapter

## Goal

Make pipeline runs produce and persist real cost. The cost *plumbing* is mature, but with a
fake adapter nothing produces real numbers and no stage run is written to the cost ledger.
Once `L4-A` lands a live adapter, each stage run must report real token cost, persist a cost
event, and roll up into the patch's cost total — Phase 1's definition of done requires
end-to-end cost logging.

## Background

- `server/src/services/agents/model-adapter.ts:20-28` — `ModelResponse` already carries
  `cost`, `promptTokens`, `completionTokens`. The fake adapter returns placeholder values.
- `server/src/services/agents/runner.ts:104-115` — `AgentRunResult.cost` is taken from
  `response.cost`, and prompt/completion tokens are placed in the run output.
- `server/src/services/pipelines/executor.ts:93-100` — `executeStage` already aggregates
  `result.cost` into `StageRunResult.cost` and enforces `maxCostPerPatch`
  (`BudgetExceededError`).
- `server/src/services/costs.ts:51` — `costService(db)` is a mature aggregator over the
  `costEvents` table (`createEvent`, `summary`, `byAgent`, `byProvider`, `windowSpend`, …).
  Nothing in the pipeline currently calls `createEvent`.

The gap: stage-run cost is computed and capped, but never written to `costEvents` or rolled
into a per-patch total. This task closes that link.

## Scope (in)

- The live `ModelAdapter` (from `L4-A`) reports real token cost and counts.
- Each stage run writes a `costEvents` row via `costService.createEvent`.
- Per-patch cost total rolls up from stage-run costs and is queryable.
- The `maxCostPerPatch` cap is exercised against real cost, not placeholder cost.

## Scope (out)

- Cost dashboards, aggregate metrics, rejection-rate reporting — owned by `L4-C`.
- Public per-patch cost display (Phase 2, L6).

## Acceptance criteria

- [ ] A real stage run produces a non-zero, provider-reported cost.
- [ ] A `costEvents` row is written for each stage run, scoped to the company.
- [ ] The patch's cost total reflects the sum of its stage-run costs.
- [ ] Exceeding `maxCostPerPatch` raises `BudgetExceededError` and terminates the stage.

## Implementation notes

- `costService.createEvent` validates the agent belongs to the company — pass a real
  `agentId`. Reuse the existing service; do not write a second cost path.
- Token-cost units must match `Patch.cost_total`'s scale (`AgentRunResult.cost` comment).

## Open questions

- None blocking.
