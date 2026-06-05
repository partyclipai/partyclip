# ADR-005: Agent roster, personas, and constitution are content-authored and DB-loaded

| | |
|---|---|
| Status | Accepted |
| Date | 2026-06-05 |
| Deciders | Operator |
| Supersedes | — |
| Superseded by | — |

> Numbering note: earlier placeholder references to "ADR-005" in `docs/tasks/L4-A`
> (the model-adapter provider choice) and `docs/tasks/X-6` (skills-catalog adoption)
> are not this ADR. Those decisions, when made, become ADR-006+.

## Context

Task `L4-A` (wire the pipeline executor to a live agent runner) surfaced that partyclip has
**no agent-config persistence/loading model**. Investigation (`git grep`) confirmed:

- The partyclip `AgentConfig` type (`packages/shared/.../agent-config.ts`: `role` enum
  Architect/Critic/Legal/Executor/BiasMirror/…, `persona_ref`, `constitution_ref`, `model`,
  `tools`, `activation_mode`, `triggers`) is **produced/loaded by zero production server code** —
  it appears only in shared types and tests. There is no roster loader and no `regular.yaml`
  reader.
- The DB `agents` table is **paperclip's general agent table** (`role` defaults to `"general"`,
  `adapterConfig`/`runtimeConfig` jsonb, `reportsTo`) — it does not model partyclip's pipeline
  roles, and nothing seeds partyclip pipeline agents.
- `persona_ref` has **no resolution mechanism**; personas, constitution content, and the agent
  roster live in the deployment's content repo (`partyclipai/partyclip-content`), which the
  runtime does not yet ingest.

This blocks `AgentRunnerProviders.loadAgent` / `loadPersona` / `resolveToolset` and therefore the
whole Phase-1 live pipeline (`L4-A → L4-B → L4-D`). It must be decided how partyclip's agent
roster, personas, and constitution **persist and load** before the pipeline can run real agents.

The existing architecture already answers the adjacent cases: `docs/data-model.md` states that
`pipelines` are *"Declarative pipeline definition loaded from the content repo"* and
`constitution_articles` are *"Versioned articles loaded from the content repo"*, and
`docs/architecture.md` states *"The runtime is content-free; every deployment supplies its own"*
via `partyclipai/partyclip-content`, ingested at `partyclipai onboard`. This ADR extends that
same pattern to the agent roster and personas.

## Decision

**The agent roster, personas, constitution, and pipeline definitions are authored in the
content repo and loaded into the database by a content-load step. The runtime reads them from
the database.**

1. **Authoring source of truth = the content repo** (`partyclip-content`): a `regular.yaml`
   agent roster (a list validated against `agentConfigSchema`), per-agent persona files (referenced
   by `persona_ref`), constitution articles, and pipeline YAML. The framework ships none of it.
2. **A content-load step ingests it into the DB** — run at `partyclipai onboard`, `company
   import`, and a dedicated re-sync command. It validates every roster entry against
   `agentConfigSchema`, resolves each `persona_ref` to its text, and upserts: a partyclip
   pipeline-agent representation, `constitution_articles` rows, and pipeline definitions.
3. **AgentConfig persists in a dedicated representation**, keyed by `(companyId, role)` — a new
   `pipeline_agents` table (or a typed jsonb column on a partyclip-owned table), **not** overloaded
   onto paperclip's general `agents` table. Persona text is stored at load time, so the runtime has
   no filesystem dependency on the content directory.
4. **Runtime `AgentRunnerProviders` read from the DB.** `loadAgent(role, companyId)` becomes a
   clean lookup; `loadPersona` returns the stored text; `loadConstitution` reads
   `constitution_articles` (already a DB table). This matches the existing DB-backed loaders
   (`loadPatch`, `loadInputArtifacts`) and the injected-providers design of `runner.ts`.

Rejected: loading AgentConfig from the content directory at runtime (filesystem coupling, not
queryable, awkward in multi-process/hosted deployments); overloading paperclip's `agents` table
(semantic + role-enum mismatch); hardcoding the roster in the framework (violates the content-free
principle).

## Consequences

### Positive

1. **Unblocks L4-A's providers.** `loadAgent`/`loadPersona`/`loadConstitution` have a real,
   queryable source once content-load + the content pack (`X-3`) exist.
2. **Architecture-consistent.** Same "author in content repo → load into DB → read from DB"
   pattern already used for pipelines and the constitution. One mental model, not three.
3. **Content-free runtime preserved.** The framework still ships zero content; deployments supply
   `regular.yaml` + personas + constitution in `partyclip-content`.
4. **Queryable + auditable.** Roster and personas are DB rows — operator UI, the audit log, and
   replay can reference them; revisions can be tracked.
5. **Validation at the boundary.** Roster entries are checked against `agentConfigSchema` at load,
   so a malformed deployment fails fast at onboard, not mid-pipeline.

### Negative

1. **Adds a load/ingest step and a DB representation** to build and maintain (the `L4-E`
   implementation task).
2. **Two-phase authoring.** Editing an agent persona means changing the content repo and
   re-running the content-load — not a live DB edit. (Acceptable: matches pipelines/constitution.)
3. **Depends on the content pack (`X-3`)** for real data; until then the loaders run against an
   empty/fixture roster.

## Follow-up

- `L4-E` — implement the content-load step + the pipeline-agent DB representation (the prerequisite
  this ADR defines). `L4-A` is re-pointed to depend on `L4-E` and `X-3`.
- `X-3` (content pack, cross-repo) supplies the `regular.yaml` roster, personas, and constitution
  the loader ingests.
