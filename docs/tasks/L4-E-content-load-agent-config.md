---
id: L4-E
title: Content-load — ingest agent roster, personas, constitution, pipelines into the DB
layer: L4
status: in_progress
branch: feature/content-load-agent-config
target_phase: Phase 1
codebase: multiple
depends_on: [ADR-005]
blocks: [L4-A]
agent: Umut Tuncer
started: 2026-06-05
---

# L4-E — Content-load — ingest agent roster, personas, constitution, pipelines into the DB

## Goal

Build the missing prerequisite that blocks the Phase-1 live pipeline. Per `ADR-005`,
partyclip's agent roster, personas, constitution, and pipeline definitions are authored in the
content repo (`partyclip-content`) and loaded into the database; the runtime then reads them
from the DB. Today there is **no loader and no partyclip agent-config DB representation**, so
`AgentRunnerProviders.loadAgent` / `loadPersona` / `loadConstitution` cannot run — which is why
`L4-A` is blocked, and with it `L4-B → L4-D`.

This task delivers the two halves `ADR-005` defines: the **content-load step** (read + validate
+ upsert) and the **pipeline-agent DB representation** the loaders read from. It is the unblock
for `L4-A`'s blocked slice.

## Background

Verified this session by reading the code and decision records:

- `AgentConfig` lives only in shared types + tests — `packages/shared/src/types/agent-config.ts`
  (`agentConfigSchema` at line 22: `role` enum, `persona_ref` at line 30, `constitution_ref`,
  `model`, `model_overrides`, `tools`, `activation_mode`, `triggers`). It is produced/loaded by
  **zero** production server code, and there is no roster loader and no `regular.yaml` reader.
- The DB `agents` table is **paperclip's general agent table** (role default `"general"`,
  `adapterConfig` jsonb, `reportsTo`). Per `ADR-005` it must **not** be overloaded for partyclip
  pipeline roles.
- `constitution_articles` is already a DB table (`packages/db/src/schema/constitution_articles.ts`:
  `companyId`, `stableId`, `version`, `title`, `body`, `supersededBy`; unique index on
  `(company_id, stable_id, version)`). Rows are loaded from the content repo per
  `docs/data-model.md:34`.
- `pipelines` is documented as a content-loaded entity (`docs/data-model.md:32`: "Declarative
  pipeline definition loaded from the content repo") but **has no DB schema yet** — confirm where
  pipeline definitions land during implementation (see Open questions).
- The runtime is content-free (`docs/architecture.md`); onboarding is `partyclipai onboard`
  (`cli/src/commands/onboard.ts`), with `packages/db/src/seed.ts` and
  `packages/shared/src/config-schema.ts` as existing ingest seams.
- The consumer contract is `AgentRunnerProviders` in `server/src/services/agents/runner.ts:32-41`:
  `loadAgent(role, companyId) → AgentConfig`, `loadPersona(agent) → string`,
  `loadConstitution(companyId) → ReadonlyArray<ConstitutionArticleRef>`.

Decision of record: `ADR-005` (agent roster/personas/constitution are content-authored and
DB-loaded) — see especially its Decision points 2–4 and the Follow-up naming `L4-E`.

## Scope (in)

- **WP1 — Pipeline-agent DB representation.** Add a partyclip-owned representation per `ADR-005`,
  keyed by `(companyId, role)`, holding the validated `AgentConfig` plus the resolved persona
  text (so the runtime has no filesystem dependency). Default is a new `pipeline_agents` table; a
  typed jsonb column on a partyclip-owned table is the fallback (Open questions). Follow the
  db → shared → server contract-sync rule (`AGENTS.md`): migration + drizzle schema, shared row
  type, server access.
- **WP2 — Content-load step.** Read from the deployment content directory: `regular.yaml` (the
  roster of `AgentConfig`), per-agent persona files (resolving each `persona_ref`), constitution
  articles, and pipeline YAML. Validate every roster entry against `agentConfigSchema`. Upsert
  into the DB: pipeline-agent rows + `constitution_articles` rows + pipeline definitions. Fail
  fast with a clear error on a malformed roster.
- **WP3 — Wiring.** Invoke the content-load step from `partyclipai onboard` / `company import`,
  and expose a dedicated re-sync command so a content update can be re-ingested without a full
  re-onboard.
- **WP4 — DB-backed loaders.** Implement `loadAgent` / `loadPersona` / `loadConstitution` against
  the WP1 representation (these are `L4-A`'s previously-blocked loaders). Decide whether they land
  here or are handed to `L4-A`, and record the decision in the PR (Open questions).
- **WP5 — Tests.** Drive the loader against a **fixture** content directory checked into this
  repo — do **not** depend on the real `X-3` content pack to test the loader.

## Scope (out)

- Authoring the real content (constitution text, personas, the real `regular.yaml`) — that is
  `X-3` (content pack, cross-repo in `partyclip-content`, blocked). This task ingests it; it does
  not write it.
- The model adapter, the orchestrator, and end-to-end stage invocation — those remain `L4-A`.
- The other `AgentRunnerProviders`: `loadPatch` / `loadInputArtifacts` already have real tables
  (`patches`, `artifacts` + `patch_stage_runs`); `resolveToolset` is a minimal registry per
  `L4-A`'s recorded decision.

## Acceptance criteria

- [x] A partyclip pipeline-agent DB representation exists, migrated, and contract-synced
      db → shared (not overloaded onto the paperclip `agents` table).
- [x] A content-load step ingests a fixture `regular.yaml` roster + persona files + constitution
      articles into the DB. (Pipeline definitions stay with the existing pipeline-YAML loader,
      `server/src/services/pipelines/loader.ts` — see Resolution; not folded in here.)
- [x] Every roster entry is validated against `agentConfigSchema`; a malformed roster fails the
      load with a clear, surfaced error.
- [x] `loadAgent` / `loadPersona` / `loadConstitution` read real rows from the DB.
- [x] The content-load step is exposed as a re-sync command (`partyclipai content-load`). (The
      automatic `onboard`/`company import` hook is a documented follow-on — see Resolution.)
- [x] Tests pass against the in-repo fixture content directory (no dependency on `X-3`).
- [x] `pnpm -r typecheck` is green.

## Implementation notes

- This is the direct unblock for `L4-A`'s blocked slice (`loadAgent` / `loadPersona`, the
  orchestrator's real source). `X-3` supplies the real content the loader ingests, but this task
  must not wait on it — ship the fixture path.
- Follow the db → shared → server → ui contract-sync rule (`AGENTS.md`): a DB column change rides
  through the shared row type before server code reads it.
- Reuse the existing ingest seams rather than inventing a parallel one: `cli/src/commands/onboard.ts`,
  `packages/db/src/seed.ts`, `packages/shared/src/config-schema.ts`.
- Store persona text at load time (`ADR-005` Decision 3) so the runtime never reads the content
  directory — keep `loadPersona` a pure DB lookup.
- `constitution_articles` already exists; ingest is an upsert keyed by `(company_id, stable_id,
  version)`. Pipeline definitions have **no** table yet — design that landing spot deliberately,
  consistent with `docs/data-model.md:32`.
- Risk: scope creep into `L4-A`. Keep this task to the load step + representation + the three
  loaders; the adapter/orchestrator stay in `L4-A`.

## Open questions

- **`pipeline_agents` table vs. typed jsonb column** on a partyclip-owned table. `ADR-005` leans
  table; confirm during implementation. If the table shape diverges meaningfully from the ADR,
  record a follow-up `ADR-006+` rather than silently deviating.
- **Where the three loaders land** — in this task (WP4) or handed to `L4-A`. Decide and state it
  in the PR so `L4-A` is not left with an ambiguous boundary.
- **Pipeline-definition landing spot** — no `pipelines` table exists today. Whether to add one or
  store definitions on an existing partyclip-owned table is a non-obvious schema call; record it
  as an `ADR-006+` in `docs/adr/` if the answer is not a trivial extension of the data model.

## Resolution

Implemented in four verified stages on `feature/content-load-agent-config`:

1. **Data layer** — `pipeline_agents` table (`packages/db/.../pipeline_agents.ts`) keyed
   `(company_id, role)`; `config` jsonb holds the validated AgentConfig, `persona` the resolved
   text. Hand-written migration `0077_pipeline_agents.sql` + journal entry (drizzle-kit `generate`
   is unusable for partyclip tables — its snapshot is the paperclip baseline, so it emits the whole
   schema; 0075/0076 are likewise hand-written). `check:migrations` + db typecheck green.
2. **Roster content-load + DB loaders** — `roster-loader.ts` reads `regular.yaml` + persona files
   from the content dir, validates against `agentConfigSchema`, resolves personas to text
   (path-traversal-guarded); `db-providers.ts` `ingestRoster` upserts, and `createDbRosterProviders`
   exposes DB-backed `loadAgent` / `loadPersona` / `loadConstitution` (the previously-blocked L4-A
   loaders). **The three loaders land here**, in L4-E (open-question resolved); L4-A composes them
   with loadPatch/loadInputArtifacts/resolveToolset + the model adapter.
3. **Constitution + orchestration** — `constitution-loader.ts` reads `constitution.yaml` (validated
   against the shared `constitutionArticleSchema`); `ingestConstitution` upserts into
   `constitution_articles`; `loadDeploymentContent(db, companyId, contentDir)` reads+validates
   everything before any write, then ingests roster + constitution.
4. **Re-sync command** — `partyclipai content-load --company-id --content-dir` runs
   `loadDeploymentContent` (upsert → re-runnable). Exposed `@partyclipai/server/services/agents`
   as a package subpath so the CLI imports it (mirrors `events:replay` → `services/projections`).

**Decisions:** `pipeline_agents` table chosen (not jsonb-on-existing) per ADR-005 — shape matches
the ADR, so no ADR-006 needed. The three loaders live in L4-E. `content-dir` is a command flag (not
yet a persisted config field).

**Deferred follow-ons (not blocking L4-A's unblock):**
- **Automatic `onboard` / `company import` hook** — the standalone re-sync command exists; calling
  it from the interactive `onboard` flow (which would need to prompt for / persist the content dir)
  is a thin follow-on.
- **Pipeline-definition ingest** — pipelines remain with the existing pipeline-YAML loader
  (`pipelines/loader.ts`); no `pipelines` table was added (ADR-006+ landing-spot question, left open).

**Verification:** roster-loader 8/8, constitution-loader 5/5, DB-integration (ingest + 3 loaders +
upsert + supersededBy filtering + company isolation + e2e content-dir → loadDeploymentContent → loaders)
6/6; `pnpm -r typecheck` green; migration 0077 applies cleanly under the embedded-postgres tests.

**This unblocks `L4-A`**: its `loadAgent` / `loadPersona` / `loadConstitution` now have a real
DB-backed source. L4-A still needs the model adapter + the orchestrator + the X-3 content pack for a
full live run.
