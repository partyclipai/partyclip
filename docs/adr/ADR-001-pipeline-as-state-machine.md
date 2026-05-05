# ADR-001: Patch pipeline is a state machine, not a chain

| | |
|---|---|
| Status | Accepted |
| Date | 2026-05-06 |
| Deciders | Operator |
| Supersedes | — |
| Superseded by | — |

## Context

Every Patch in partyclip moves through several agent-run stages between drafting and publication: `DRAFTING → CRITIQUE → RISK_ASSESS → EXECUTOR → BIAS_MIRROR → AWAITING_SIGNOFF → PUBLISHED`, with side states `REPEALED` and `KILLED`.

There are two common ways to implement this kind of multi-step LLM workflow:

1. **Chain** — a script (or a framework like LangChain/LlamaIndex) that calls each step in sequence, passing intermediate results in memory. The orchestration lives in code; the pipeline is a function call.
2. **State machine** — each Patch has an explicit `state` field. Each stage is a separate, independently-scheduled agent run that reads the Patch, produces an artifact, and transitions the state. The orchestration lives in data; the pipeline is a set of transitions.

partyclip is meant to run under public scrutiny, with operators intervening, with stages occasionally being retried, replaced, or audited months after the fact. This ADR records the choice between those two approaches.

## Decision

**The Patch pipeline is implemented as an explicit state machine.** Each stage is a separate agent run, persisted as a `PatchStageRun` row. State transitions are events in the append-only audit log. Pipeline definitions are declarative YAML in the deployment's content repo, not code.

A chain-style implementation is rejected for partyclip's core control flow.

## Consequences

### Positive

1. **Resumability.** A failed stage doesn't lose prior stages' work. Restart from the last successful transition by reading state, not by re-running the chain from the top.
2. **Reviewability.** Each stage's input and output is a discrete artifact in the audit log. Auditors, journalists, and citizens can inspect any single stage in isolation without reconstructing a chain.
3. **Substitutability.** A deployment can swap one agent for another at a given stage by editing pipeline YAML, without touching the engine. Different deployments can run different pipelines on the same core.
4. **Operator visibility.** "Patch 47 is in BIAS_MIRROR" is a real persisted state, surfaceable in the operator UI and the public dashboard. With a chain, the same question becomes "where is the function currently blocked?" — observable only through logs.
5. **Independent retry policy per stage.** Timeouts, retry counts, and budget caps are stage-local config rather than wrapped around a monolithic chain call.
6. **Compatible with operator intercept.** `INTERCEPT`, `KILL`, and `OVERRIDE_*` actions are first-class transitions in the state machine. In a chain, operator intervention requires either polling cooperation from the chain or killing it mid-flight.
7. **Compatible with event-sourced audit.** Each transition emits a `patch.stage.completed` event. Subscribers (Spokesperson, schedulers, dashboards) react without coupling to the orchestrator.

### Negative

1. **More moving parts up front.** A state machine plus persistence plus a scheduler is more code than a single function that calls agents in order.
2. **Latency overhead per stage.** Each stage involves a write, a scheduled pickup, and a read. For a low-traffic deployment this is invisible; for high-throughput cases it would matter.
3. **Schema discipline required.** Stage I/O has to be persistable artifacts with stable shapes. Free-form Python objects passed between in-memory steps are no longer acceptable.
4. **Debugging is more declarative, less stack-trace-y.** Bugs surface as "stuck in state X" rather than "exception in line Y." Tooling has to compensate.

### Neutral

- Pipeline definitions become content, not code. This is consistent with the broader core/config/content boundary in [`06_PLUGINS.md`](../../../docs/handoff/06_PLUGINS.md) but adds a YAML surface to maintain.
- Cabinet votes, classification-routed pipelines, and per-stage model overrides all fit naturally into the state-machine model. They would have required ad-hoc branches in a chain.

## Alternatives considered

### A. LangChain-style chain in code

A Python function that calls Architect → Critic → Legal → Executor → BiasMirror, threading state through return values, with try/except for retries.

Rejected because:

- Operator intercept becomes a hack (cooperative cancellation tokens or process kills).
- Audit log becomes a side effect of orchestration rather than the source of truth.
- "Patch is currently in stage X" has no persisted answer between runs.
- Resuming after a crash means restarting from drafting, or reconstructing partial state from logs.
- Different pipelines per classification (`REGULAR` vs `CROSS_CUTTING` vs `CONSTITUTIONAL`) require either parallel chain functions or a switch statement at every step.

The convenience of writing the happy path as straight-line code does not survive contact with operator overrides, audit requirements, and per-stage budgets.

### B. State machine in code, transitions in memory

A state machine where `state` lives only on an in-memory object, persisted opportunistically. Cleaner than a chain but loses durability.

Rejected because:

- Crashes lose state.
- The audit log is no longer the source of truth — the in-memory object is.
- Replay ("show me how Patch 47 looked after CRITIQUE") requires reconstructing in-memory objects from logs anyway, so we may as well persist transitions directly.

### C. Hybrid: chain inside each "pipeline run", state machine for higher-level lifecycle

E.g. drafting-through-bias-mirror is one chain, then state transitions for sign-off, repeal, etc.

Rejected because it creates two paradigms in one system. Auditors and operators have to know that "patch in DRAFTING" is observable but "patch in stage 3 of the drafting chain" is not. This is exactly the bifurcation the state-machine approach is meant to eliminate.

## Implementation notes (informative, not normative)

- Pipeline YAML format is sketched in [`04_PIPELINE.md`](../../../docs/handoff/04_PIPELINE.md). Stage entries include `id`, `agent_role`, optional `timeout_minutes`, optional `decision`, and per-stage transition rules (`on_reject`, `on_block`).
- A `PatchStageRun` row is the unit of "an agent ran." Multiple runs per Patch per stage are permitted (rejection sends a Patch back to DRAFTING; the next attempt is a new run).
- State transitions are events in the append-only log. The `state` column on `Patch` is a projection.
- Operator actions (`INTERCEPT`, `OVERRIDE_*`, `KILL`, `SIGNOFF`, `REPEAL`) are also transitions, with the additional constraint that `SIGNOFF` is permitted only from `AWAITING_SIGNOFF`.
- Budget caps (`max_cost_per_patch`) are enforced at transition time. Exceeding the cap moves the Patch to `KILLED` with reason `BUDGET_EXCEEDED`.

## Open questions deferred

- Whether `RISK_ASSESS` and `CRITIQUE` should remain separate stages or merge for routine patches. See [`09_OPEN_QUESTIONS.md`](../../../docs/handoff/09_OPEN_QUESTIONS.md). This ADR establishes the state-machine model regardless of the eventual stage list.
- Whether stage definitions should support arbitrary DAGs (parallel stages, joins) or remain strictly linear with classification-based routing. v0 stays linear.

## References

- [`02_ARCHITECTURE.md`](../../../docs/handoff/02_ARCHITECTURE.md) — L4 Governance & Audit
- [`04_PIPELINE.md`](../../../docs/handoff/04_PIPELINE.md) — pipeline state machine and YAML format
- [`03_DATA_MODEL.md`](../../../docs/handoff/03_DATA_MODEL.md) — `Patch`, `PatchStageRun`, `OperatorAction`
- [`05_GOVERNANCE.md`](../../../docs/handoff/05_GOVERNANCE.md) — operator sign-off, audit log
