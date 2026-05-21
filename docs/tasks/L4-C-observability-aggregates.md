---
id: L4-C
title: Observability aggregates — cost + rejection-rate dashboard
layer: L4
status: todo
branch: feature/observability-aggregates
target_phase: Phase 1
codebase: multiple
depends_on: [L4-B]
blocks: []
---

# L4-C — Observability aggregates — cost + rejection-rate dashboard

## Goal

Surface the Phase 1 process metrics. The metrics registry exists and names the baselines it
wants, but producers do not emit and the operator UI has no view. This task wires emission
into the pipeline and renders the aggregates so the operator can see per-patch cost and
per-stage rejection rate from day one.

## Background

- `server/src/services/observability/metrics.ts:44` — `createMetricsRegistry()` is a pure
  in-memory aggregator with a `snapshot()` read API and a swappable sink. Its header lists
  the four day-one baselines: per-stage cost, stage rejection rate, operator sign-off
  latency, bias-mirror fill rates.
- `metrics.ts:93-102` — `METRIC_NAMES` defines `STAGE_COST`, `STAGE_DURATION_MS`,
  `STAGE_REJECTION`, `STAGE_RUN`, `OPERATOR_SIGNOFF_LATENCY_MS`, `BIAS_MIRROR_FILL_RATIO`,
  `PATCH_PUBLISHED`, `PATCH_KILLED`. Producers should import these constants, not literals.
- `server/src/services/costs.ts:51` — `costService` already provides cost aggregates
  (`summary`, `byAgent`, `windowSpend`).
- `ADR-004` — rejection is a structured record; rejection rate is computed over `Rejection`
  rows / `STAGE_REJECTION` counters per stage.

The gap: the registry is never fed by the executor/dispatcher, and no API or UI exposes the
snapshot. The metrics file explicitly anticipates "the operator UI can render counters
without standing up a metrics stack".

## Scope (in)

- Emit `STAGE_RUN`, `STAGE_COST`, `STAGE_DURATION_MS`, and `STAGE_REJECTION` from the pipeline
  executor / dispatcher, tagged per stage.
- An API endpoint exposing `MetricsRegistry.snapshot()` (counters / gauges / histograms).
- An operator UI view rendering rolling cost and per-stage rejection rate.

## Scope (out)

- An external metrics backend (StatsD / Prometheus / OpenTelemetry) — the in-memory sink is
  fine for Phase 1; the registry already supports swapping the sink later.
- The public cost dashboard widget — that is a Phase 2, L6 concern.

## Acceptance criteria

- [ ] The executor emits `STAGE_RUN` / `STAGE_COST` / `STAGE_DURATION_MS` on every stage run.
- [ ] `STAGE_REJECTION` increments when a stage rejects a patch.
- [ ] An API endpoint returns the metrics snapshot.
- [ ] An operator UI view shows rolling cost and per-stage rejection rate.

## Implementation notes

- Emission must never crash a run — the registry's `emit` already swallows sink errors; keep
  that guarantee at the call sites.
- Reuse `costService` aggregates for the cost figures rather than recomputing from raw events.

## Open questions

- None blocking.
