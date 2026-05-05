# Data model

The schema lives in `packages/db/src/migrations/` (Drizzle ORM, numbered migration files) with shared types in `packages/shared/src/`. Upstream Paperclip's deep schema doc is `doc/DATABASE.md`; this page is the partyclip-shaped view.

## Inherited entities (from upstream Paperclip)

These come from the underlying runtime and are mostly unchanged:

| Entity | Purpose |
|---|---|
| `users` | Authenticated humans on the instance |
| `companies` | Container for a related set of agents and issues. partyclip uses these to model ministries. |
| `agents` | Configured AI agents with an adapter (claude-local, codex-local, openclaw-gateway, etc.) and a runtime schedule |
| `issues` | The core unit of work. Has status (todo/in_progress/blocked/done), assignee agent, priority, comments, and a checkout/run history |
| `runs` (heartbeat runs) | A single execution window of an agent. Linked to one issue. Carries the `X-Partyclip-Run-Id` header end-to-end |
| `approvals` | Human sign-off gates on issue transitions or risky actions |
| `routines` | Recurring scheduled tasks (cron-shaped) that produce or update issues |
| `feedback` | User-supplied votes, dissents, and structured feedback on issue outcomes |
| `attachments` | File uploads pinned to issues or comments |
| `secrets` | Encrypted-at-rest secrets resolvable by name from agent configs |
| `plugins` (`plugin_database_namespaces`) | Per-plugin isolated DB schema + manifest registration |
| `audit_log` | Append-only event stream covering issue transitions, approvals, secret access |

## Partyclip-specific entities

These extend the inherited model. Where the schema overlaps with an inherited entity, partyclip adds columns rather than parallel tables:

| Entity | Purpose | Notes |
|---|---|---|
| `patches` | A candidate policy change moving through the patch pipeline | Has `state` field (DRAFTING/CRITIQUE/…/PUBLISHED/REPEALED/KILLED), `pipeline_id`, draft/critique/risk/executor/bias artifacts |
| `patch_stage_runs` | One row per stage execution of a patch | Persists the agent run, input/output, timestamps. ADR-001 records why this is a state machine and not a chain |
| `pipelines` | Declarative pipeline definition loaded from the content repo | Stage list, gating rules, signoff requirements |
| `ministries` | A `companies` row tagged as a ministry, with extra metadata | Mirror of a real-world ministry. Holds policy domain, public/private flag |
| `constitution_articles` | Versioned articles loaded from the content repo | Bias review and signoff agents reference these |
| `dissents` | Minority opinions preserved alongside published patches | Append-only, never overwritten |
| `votes` | Structured agent or operator votes on a patch | Inputs to the bias-mirror and signoff stages |
| `revenue_streams` | Money in/out per ministry, per stream | Configurable transparency level |
| `citizens` | The tiered access layer (anonymous/observer/supporter) | Maps to authenticated `users` for paid/registered tiers |

## Schema conventions

- **All ids** are CUID2 strings (`createId()` from `@paralleldrive/cuid2`)
- **All timestamps** are `timestamp with time zone`, named `created_at` / `updated_at` / `*_at`
- **Soft delete** is the default — rows have `archived_at` rather than being deleted, except on user request
- **Audit log** is append-only and never bulk-deleted; it is the source of truth for "what happened when"
- **Migrations** are numbered (`0001_*.sql` … `0059_*.sql` and counting). Numbering is enforced by `pnpm --filter @partyclipai/db check:migrations`
- **Plugin-owned tables** live in per-plugin schemas (`plugin_<plugin-id>_*`) so plugins can ship their own data without colliding

## Where to look in code

- Migration source: `packages/db/src/migrations/`
- Generated Drizzle types: `packages/db/src/schema/`
- Validators: `packages/shared/src/validators/`
- Service layer (where business logic touches the DB): `server/src/services/`

## See also

- `doc/DATABASE.md` — upstream's deep schema doc (still authoritative for inherited entities)
- `docs/architecture.md` — how the data model is exposed via the HTTP API and adapters
- `docs/adr/ADR-001-pipeline-as-state-machine.md` — why the patch pipeline is a state machine
