# partyclip — Strategic Roadmap

Status: ACTIVE | Updated: 2026-05-21

Strategic input for partyclip framework development. Operational delivery — phases, branches,
task board — lives in [`delivery-plan.md`](./delivery-plan.md) and
[`../tasks/README.md`](../tasks/README.md).

## 1. Context

partyclip is an open-source orchestration framework for political parties run by AI agents —
country-agnostic, party-agnostic, MIT-licensed, forked from `paperclipai/paperclip`. The
framework is the *engine*; a deployment is a *car* built on it. The runtime ships zero party
content; every deployment supplies its own via a separate content repo
(`partyclipai/partyclip-content`).

**Stack** — pnpm monorepo:

- `server/` — Express 5 + TypeScript: HTTP API, heartbeat scheduler, plugin host, pipeline engine
- `ui/` — React + Vite operator / board UI
- `cli/` — the `partyclipai` CLI (onboard, run, company import/export)
- `packages/db` — Drizzle ORM schema + migrations
- `packages/shared` — types, validators, constants shared by server and ui
- `packages/adapters`, `packages/adapter-utils` — agent model adapters
- `packages/plugins` — plugin SDK + first-party plugins

See [`../architecture.md`](../architecture.md) for the process shape and [`../adr/`](../adr/)
for the decisions that shaped it.

## 2. The 7-layer architecture

partyclip's conceptual architecture is seven layers (the `README.md` ASCII diagram is
canonical). The task board's IDs are scoped to these layers.

| Layer | Name | What lives here |
|---|---|---|
| **L0** | Constitutional | Charter, bylaws, red lines, disclaimers — the immutable per-deployment substrate. |
| **L1** | Party Organs | Leader, central committee, policy councils, parliamentary group — the political-actor structure. |
| **L2** | Shadow State | A 1:1 mirror of the real government's ministerial structure. |
| **L3** | Work Products | Patches, press releases, counter-bills, manifestos, dissents. |
| **L4** | Governance & Audit | Patch pipeline state machine, voting, dissents, bias review, operator sign-off, append-only audit log, cost tracking. |
| **L5** | External Inputs | Citizens, forum, news ingest, government-action monitor, donations. |
| **L6** | Public Surface | Anonymous readers, registered citizens, operators; public site + internal surfaces. |

Layers below do not know about layers above. The **agent framework** (information envelope,
runner, role kinds, activation modes) is cross-cutting infrastructure serving L4's pipeline —
work on it is tracked as cross-cutting `X-` tasks.

## 3. Phase model

Phase dates are intentions, not commitments.

- **Phase 0 — Foundation.** Fork, detach upstream, README / architecture / data-model docs,
  plugin SDK study, ADR-001. **Complete** (`v0.0.1-handoff`), bar one carry-over item — see
  task `X-2`.
- **Phase 1 — Core.** A working partyclip: one issue travels the full patch pipeline to
  `PUBLISHED`. **In progress (~72%).** Architecturally complete — data model, append-only
  audit log, pipeline engine, agent framework, Bias Mirror, operator UI, news-ingest plugin,
  and ADRs 001–004 have all landed. **Operationally incomplete** — the remaining gap is
  *live agent invocation* (the pipeline currently runs against a fake model adapter),
  *cost production*, an *end-to-end proof*, and *observability aggregates*. Those are the
  `L4-*` and `X-*` tasks on the board.
- **Phase 2+ — Public surface, citizen layer, scale.** Directional; not yet broken into tasks.

## 4. Out of scope / deferred

- Multi-party deployments in one instance.
- Election-running tooling (candidate registration, primaries).
- Persuasion / propaganda generation — the framework actively resists it.
- Mobile apps (web-only for v1).
- Federation between partyclip instances.
- Quadratic / preferential / weighted voting, the dataset-access program, AI forum
  moderation — schemas stay forward-compatible, activation deferred.

## 5. Document map

- This doc — strategic intent, architecture, phase model.
- [`delivery-plan.md`](./delivery-plan.md) — Phase 1 definition of done, branch model, decision convention.
- [`../tasks/README.md`](../tasks/README.md) — the live task board.
- [`../adr/`](../adr/) — architectural decision records (ADR-001..004).
- [`../specs/`](../specs/) — partyclip-specific technical specs.
