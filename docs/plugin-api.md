# Plugin API

> Reader's guide: this page is the high-level overview. **The deep reference is `docs/plugin-sdk-notes.md`** (manifest schema, worker context, host services, tool exposure, UI contributions, scheduled jobs, capability gating, out-of-process model). Known limitations and the partyclip-specific extensions still to be built are in `docs/plugin-sdk-gaps.md`.

## What a plugin is

A plugin is a workspace package whose `package.json` declares a `partyclipPlugin` field:

```json
{
  "name": "@my-org/my-plugin",
  "partyclipPlugin": {
    "manifest": "./dist/manifest.js",
    "worker": "./dist/worker.js"
  }
}
```

The manifest declares what capabilities the plugin asks for (DB namespace, host service access, tool exposures, UI contributions, scheduled jobs). The worker is loaded out-of-process by the partyclip server and executes the plugin's logic.

## Where to start

- **SDK package**: `@partyclipai/plugin-sdk` (`packages/plugins/sdk/`). Provides the worker-side context, host service clients, and UI bridge hooks. **Stable public API** — semver applies once published.
- **Scaffold a new plugin**: `npx create-partyclip-plugin` (when published). For now, copy `packages/plugins/examples/plugin-hello-world-example/` as a template.
- **Worked examples**: `packages/plugins/examples/`
  - `plugin-hello-world-example/` — minimum viable plugin (scheduled job, host service call, tool exposure)
  - `plugin-kitchen-sink-example/` — exercises the full SDK surface, useful as a reference
  - `plugin-ministry-example/` — partyclip-specific reference plugin showing how to register a ministry-typed company on instance startup
  - `plugin-file-browser-example/` — adds a UI surface to the partyclip board
  - `plugin-orchestration-smoke-example/` — runtime contract smoke test
  - `plugin-authoring-smoke-example/` — verifies the authoring contract (used by the test suite)
- **Loader source**: `server/src/services/plugin-loader.ts`. The runtime contract — what the host expects from a plugin manifest — lives here.

## Capabilities (rough outline; full reference in `docs/plugin-sdk-notes.md` once Stage E completes)

A manifest can request:

- `database` — an isolated DB schema the plugin can migrate and query
- `hostServices` — typed clients for partyclip's HTTP API (issues, agents, runs, approvals)
- `tools` — function-shaped capabilities exposed to agents that opt in
- `uiContributions` — React components mounted into the board UI under named slots
- `scheduledJobs` — cron-shaped triggers that wake the plugin's worker
- `eventSubscriptions` — *(planned, see `docs/plugin-sdk-gaps.md`)* push-style notifications on partyclip events

## See also

- `packages/plugins/sdk/README.md` — current SDK README (auto-rebranded but may need a refresh)
- `doc/plugins/PLUGIN_SPEC.md` — upstream Paperclip's plugin spec (still authoritative for the underlying runtime; partyclip-specific extensions and gaps will be tracked in `docs/plugin-sdk-notes.md`)
- `docs/plugin-sdk-gaps.md` — gaps the partyclip team is filing against the inherited SDK
