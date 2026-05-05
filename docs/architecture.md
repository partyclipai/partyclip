# Architecture

A partyclip deployment is a small set of long-lived processes plus a database. This document is the one-screen overview; the deep dive is in `doc/SPEC.md` and `doc/SPEC-implementation.md` (upstream-Paperclip's living spec, still mostly accurate for the underlying runtime) and in `docs/specs/` (partyclip-specific extensions).

## Process shape

```
                 ┌───────────────────┐
                 │  partyclipai CLI  │  (cli/)
                 │  partyclip onboard│
                 │  partyclip run    │
                 └─────────┬─────────┘
                           │
                           ▼
       ┌───────────────────────────────────────────┐
       │              partyclip server             │  (server/)
       │  ┌─────────────────────────────────────┐  │
       │  │ heartbeat scheduler                 │  │
       │  │   wakes agents on a tick or event   │  │
       │  ├─────────────────────────────────────┤  │
       │  │ adapter registry                    │──┼──► adapter procs
       │  │   bridges to claude-local,          │  │   (one per agent)
       │  │   codex-local, opencode, gateway,…  │  │
       │  ├─────────────────────────────────────┤  │
       │  │ plugin host                         │──┼──► plugin workers
       │  │   loads partyclipPlugin manifests,  │  │   (one per plugin,
       │  │   exposes host services and tools   │  │    out-of-process)
       │  ├─────────────────────────────────────┤  │
       │  │ HTTP API (Express 5)                │  │
       │  │   issues, agents, runs, approvals,  │  │
       │  │   plugins, MCP, /api/...            │  │
       │  └─────────────────────────────────────┘  │
       └─────────────────────┬─────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
   ┌─────────┐        ┌──────────┐        ┌──────────────┐
   │ UI      │        │ Postgres │        │ Object store │
   │ (ui/)   │        │ (db/)    │        │ (local disk  │
   │ React+  │        │ Drizzle  │        │  or S3)      │
   │ Vite    │        │ ORM      │        └──────────────┘
   └─────────┘        └──────────┘
```

## Where each piece lives

| Concern | Path | Notes |
|---|---|---|
| Runtime entry point | `server/src/index.ts` | Boots the HTTP API + heartbeat + plugin host |
| Heartbeat / agent scheduling | `server/src/heartbeat-*` | Wakes agents on a tick or external event |
| Adapter registry | `server/src/adapters/` + `packages/adapters/*` | Each adapter is a separate workspace package |
| Plugin host | `server/src/services/plugin-loader.ts` | Reads `partyclipPlugin` manifest from each plugin's `package.json` |
| Plugin SDK | `packages/plugins/sdk/` | Stable public API for plugin authors (worker context + UI bridge hooks) |
| Database schema + migrations | `packages/db/src/migrations/` | Drizzle ORM, migrations are numbered files |
| Shared types & validators | `packages/shared/` | Zod schemas, types used by both server and UI |
| HTTP wire types | Headers `X-Partyclip-*` | `Run-Id`, `Signature`, `Timestamp` (see `docs/api/`) |
| UI | `ui/src/` | React + Vite, single-page app served by the server in production |
| CLI | `cli/src/` | `partyclipai onboard`, `partyclipai run`, `partyclipai company import/export`, etc. |

## Partyclip-specific shape on top of the inherited runtime

partyclip inherits Paperclip's "agents organized into companies, working on issues, with heartbeat-driven runs" model. On top of it, partyclip adds:

- **Patch pipeline** as a state machine — see `docs/adr/ADR-001-pipeline-as-state-machine.md`. A Patch is a candidate policy change that flows through stages (`DRAFTING → CRITIQUE → RISK_ASSESS → EXECUTOR → BIAS_MIRROR → AWAITING_SIGNOFF → PUBLISHED`). Each stage is a separate agent run.
- **Ministries** as company-shaped groupings of agents and issues, mirroring real-world ministerial structure.
- **Constitution and disclaimers** loaded from a separate content repo (`partyclipai/partyclip-content`, scaffolded outside this repo). The runtime is content-free; every deployment supplies its own.
- **Tiered citizen layer** (anonymous, registered observer, paid supporter) gating access to pipeline state and audit trails.

## Entry points worth knowing

- `pnpm dev` — runs the server in watch mode, restarts on changes
- `pnpm dev:ui` — runs the UI in Vite dev mode (port 5173)
- `pnpm test` — vitest across all packages
- `pnpm build` — full build, ends with the production server binary
- `partyclipai onboard` — interactive setup for a new instance (DB, secrets, first admin)

## See also

- `docs/data-model.md` — the schema in plain English
- `docs/plugin-api.md` — what plugins can do
- `docs/upstream-sync.md` — how this fork relates to upstream Paperclip
- `doc/SPEC.md`, `doc/SPEC-implementation.md` — upstream's deep design docs (still authoritative for the inherited runtime)
