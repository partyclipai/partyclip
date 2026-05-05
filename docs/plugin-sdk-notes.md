# Plugin SDK reference notes

Working notes from the Phase 0 SDK study. The companion is `docs/plugin-sdk-gaps.md` (what's missing for partyclip's needs). The public-facing summary is `docs/plugin-api.md`.

## Manifest

Type definition: `packages/shared/src/types/plugin.ts` (`PartyclipPluginManifestV1`)
Runtime contract: `server/src/services/plugin-loader.ts`

A plugin's `package.json` declares:

```json
{
  "partyclipPlugin": {
    "manifest": "./dist/manifest.js",
    "worker": "./dist/worker.js"
  }
}
```

`dist/manifest.js` exports a default object. Key fields:

| Field | Purpose |
|---|---|
| `id` | Globally unique, lowercase alphanumeric (e.g. `partyclip.hello-world-example`). Used for DB namespacing and HTTP webhook paths. |
| `apiVersion` | Must be `1`. |
| `version` | Plugin's own semver. |
| `displayName`, `description`, `author`, `categories` | Operator-facing metadata. |
| `capabilities` | Array of declared capabilities (see below). Host throws `CapabilityDeniedError` if the worker calls a service it didn't declare. |
| `entrypoints.worker` | Path to compiled worker JS, mandatory. |
| `entrypoints.ui` | Path to UI bundle dir, optional. |
| `jobs[]` | Cron-shaped scheduled jobs. `{ jobKey, displayName, schedule }` where schedule is a 5-field cron (`"*/15 * * * *"`). |
| `webhooks[]` | Inbound HTTP endpoints mounted at `/api/plugins/:pluginId/webhooks/:endpointKey`. |
| `tools[]` | Function-shaped capabilities exposed to agents. `{ name, displayName, description, parametersSchema }`. |
| `ui.slots[]` | React components mounted at host-defined slot types (`page`, `sidebar`, `dashboardWidget`, `detailTab`, `commentAnnotation`, `commentContextMenuItem`, ...). |
| `ui.launchers[]` | Buttons / menu items in the operator UI that route to a plugin page or open a modal. |
| `database.migrationsDir` | Plugin owns an isolated PostgreSQL schema; migrations run from this directory at startup. |
| `database.coreReadTables` | Whitelist of core tables the plugin can SELECT from. |
| `instanceConfigSchema` | JSON Schema for operator-facing settings; validated before the worker is dispatched. |

The manifest is loaded twice — once at discovery time by `plugin-loader.ts` (to extract jobs/UI/capabilities for the registry) and once at runtime by the worker process. So manifests must be importable synchronously and self-contained — no async imports, no env-dependent shape. Anything dynamic (runtime-computed slots, runtime tools) must be declared statically and computed inside `setup()` via `ctx.tools.register(...)` etc.

## Worker context

Type: `PluginContext` in `packages/plugins/sdk/src/types.ts` (~lines 1432–1501).

The worker's `setup(ctx)` receives a single fully-typed context. The major surfaces:

- `ctx.manifest` — the resolved manifest
- `ctx.config` — operator-configured settings, validated against `instanceConfigSchema`
- `ctx.logger` — structured logging (info/warn/error/debug)
- `ctx.events.on(eventType, filter, handler)` — subscribe to domain events (issue.created, issue.updated, ...)
- `ctx.events.emit(eventType, payload)` — publish events back to the host (subject to capability)
- `ctx.jobs.register(jobKey, handler)` — wire a manifest-declared job to a function
- `ctx.tools.register(name, declaration, handler)` — expose an agent-callable tool (auto-namespaced as `pluginId:name`)
- `ctx.data.register(key, handler)` — handle UI bridge data fetches (paired with `usePluginData` on the UI side)
- `ctx.actions.register(key, handler)` — handle UI bridge action invocations (paired with `usePluginAction`)
- `ctx.streams.emit(channel, event)` — push real-time events to UI (paired with `usePluginStream` SSE on the UI side)
- `ctx.state.{get,set,delete}(scope, key)` — scoped key/value store (scopeKind: instance/company/project/agent/issue/goal/run)
- `ctx.entities.{...}` — plugin-owned entity records for external system mappings
- `ctx.db.namespace`, `ctx.db.query<T>(sql, params)`, `ctx.db.execute(sql, params)` — restricted SQL into the plugin's isolated schema + whitelisted core tables
- `ctx.http.fetch(url, init)` — outbound HTTP, audited (does not enforce egress allowlists — see gaps)
- `ctx.secrets.resolve(ref)` — resolve a secret reference; never cache the value
- `ctx.activity.log(entry)`, `ctx.metrics.*`, `ctx.telemetry.*` — observability
- `ctx.{issues, agents, projects, companies, goals}` — typed clients for core domain operations (list, get, create, update, comment, etc.)

Every privileged call is gated by `ctx.requireCapability(manifest, capability)` before it reaches the host.

## Database isolation

Implementation: `server/src/services/plugin-database.ts`

The host provisions an auto-named PostgreSQL schema per plugin. Migrations are SQL files under `manifest.database.migrationsDir`, applied at activation with checksum tracking. The plugin can:

- `query<T>(sql, params)` — SELECT from its own schema and `coreReadTables` (read-only); requires `database.namespace.read`
- `execute(sql, params)` — INSERT/UPDATE/DELETE within its own schema only; requires `database.namespace.write`
- migrate at startup — requires `database.namespace.migrate`

Plugins **cannot** SELECT from arbitrary core tables, modify the core schema, or escape their namespace. The query path goes through a parameter-bound driver that rewrites table references; raw cross-schema SQL is rejected.

## Tool exposure

`ctx.tools.register(name, declaration, handler)`:

- `name` is bare; the host auto-namespaces as `pluginId:name`.
- `declaration = { displayName, description, parametersSchema }` — JSON Schema for the args.
- `handler = async (params, runCtx) => ToolResult` — `params` is validated; `runCtx` carries `{ agentId, runId, companyId, projectId }`.
- Result: `{ content?, data?, error? }`.

Requires `agent.tools.register` capability. The kitchen-sink example (`packages/plugins/examples/plugin-kitchen-sink-example/src/worker.ts`) registers an `echo` tool around line 146.

## UI contributions

The UI bundle is a separate React app. `packages/plugins/sdk/src/ui/` exports the bridge hooks:

- `usePluginData(key, params)` ↔ worker `ctx.data.register(key, handler)`
- `usePluginAction(key)` ↔ worker `ctx.actions.register(key, handler)`
- `usePluginStream(channel, options)` ↔ worker `ctx.streams.emit(channel, event)` (SSE under the hood)
- `useHostContext()` — read active company / project / entity / user IDs

Slot types (declared in `manifest.ui.slots[]`): `page`, `sidebar`, `dashboardWidget`, `detailTab`, `commentAnnotation`, `commentContextMenuItem`, and a few others. Each slot type has a typed props interface (`PluginPageProps`, `PluginWidgetProps`, ...) all of which receive `context: PluginHostContext`.

The UI cannot access the filesystem or processes directly — every cross-boundary call goes through the bridge. This is a healthy security boundary but means UI ↔ worker communication is async and ~latency-sensitive.

## Scheduled jobs

Manifest: `jobs[]` with `{ jobKey, displayName, description?, schedule }` where `schedule` is a 5-field cron expression.

Runtime: `server/src/services/plugin-job-scheduler.ts` ticks every ~30s, computes whether a job's cron interval has elapsed, and dispatches to the worker via the JSON-RPC `runJob` method.

Job runs are persisted in `plugin_job_runs` with status (`queued | running | succeeded | failed`), `error`, and `trigger` (`schedule | manual | retry`). Overlap prevention is built in — a job whose previous run has not finished is skipped.

The handler receives:

```ts
{ jobKey, runId, trigger, scheduledAt }
```

Operators can manually trigger or retry any job from the plugin admin UI.

## Capability gating

Capabilities live in `packages/shared/src/constants.ts`. Roughly grouped:

- **Company-scoped**: `companies.read`, `projects.read`, `issues.read|create|update`, `agents.read|pause|resume|invoke`
- **Instance-scoped**: `plugin.state.read|write`, `plugin.state.scoped.*`
- **Runtime**: `events.subscribe|emit`, `jobs.schedule`, `http.outbound`, `secrets.read-ref`
- **Agent**: `agent.tools.register`, `agent.sessions.create|list|send|close`
- **UI**: `ui.page.register`, `ui.sidebar.register`, `ui.detailTab.register`, `ui.dashboardWidget.register`, ...
- **Database**: `database.namespace.migrate|read|write`

Manifests must enumerate every capability the plugin uses. Host calls `ctx.requireCapability(...)` before each privileged operation; missing capability throws `CapabilityDeniedError` synchronously, before any side effect.

## Out-of-process model

Implementation: `server/src/services/plugin-worker-manager.ts` and `plugin-runtime-sandbox.ts`

Each plugin worker runs in a separate Node.js process. IPC is JSON-RPC 2.0 over stdio (newline-delimited messages). The protocol is in `packages/plugins/sdk/src/protocol.ts`:

- **Host → Worker**: `initialize`, `configChanged`, `validateConfig`, `onEvent`, `runJob`, `getData`, `performAction`, `executeTool`, `health`, `handleWebhook`, `onApiRequest`
- **Worker → Host**: `config.get`, `events.on|emit`, `jobs.register`, `state.*`, `issues.*`, `tools.register`, all the typed clients

Lifecycle: spawned at activation, killed on uninstall/restart, graceful shutdown with a 10s default timeout.

Module loading uses Node's `vm` module to allowlist `require()` (only `@partyclipai/plugin-sdk` and workspace deps in dev mode). CommonJS only — no ESM in the sandbox today.

## Worked examples

- `packages/plugins/examples/plugin-hello-world-example/` — minimal scaffold (one dashboard widget). After Phase 0 it also exercises a scheduled job, a host service call, and an agent-exposed tool — see commit log.
- `packages/plugins/examples/plugin-kitchen-sink-example/` — broadest reference; exercises jobs, tools, host services, UI slots, streams, all together. Read `src/manifest.ts` and `src/worker.ts` to see the SDK's full surface area used in one place.
- `packages/plugins/examples/plugin-ministry-example/` — partyclip-specific reference. Registers a ministry-typed company at startup. Useful when authoring partyclip-shaped plugins (vs. generic Paperclip-shaped ones).
- `packages/plugins/examples/plugin-file-browser-example/` — plugin with a non-trivial UI slot.
- `packages/plugins/examples/plugin-orchestration-smoke-example/`, `plugin-authoring-smoke-example/` — runtime contract tests, not great as starting templates.

## Naming notes (post-rename)

The SDK is the surface most affected by the Paperclip → partyclip rename. As of Phase 0:

- **Type names**: `PartyclipPluginManifestV1`, `PartyclipPluginContext`, etc. (renamed)
- **Manifest key**: `partyclipPlugin` (renamed from `paperclipPlugin`)
- **Capabilities** still use lowercase identifiers like `agent.tools.register` (no rename needed; they were never branded)
- **Some doc strings, comments, and example `displayName` fields** still reference "Paperclip" — these are cosmetic and will be cleaned up incrementally; they don't affect runtime behavior.
- **Inherited `paperclip_required` enum value** in `AdapterSkillOrigin` is preserved for type compatibility with `hermes-paperclip-adapter` (third-party npm) — see Stage A commit history.
