# Plugin SDK gaps

What partyclip needs from the plugin SDK that the inherited Paperclip SDK does not yet provide. Companion to `docs/plugin-sdk-notes.md` (which describes what *does* exist).

For each gap: what's missing, what's already there to build on, and whether to fork-and-extend partyclip-locally or pursue an upstream contribution.

---

## 1. Event subscriptions: present but not push-to-UI

**Why partyclip needs this**: pipeline-shaped plugins want to react to domain events (issue created, patch transitioned, approval granted) and update the operator UI in real time — toasts, badge counts, dashboard refreshes. Today the plugin can subscribe to events on the worker side, but the operator UI doesn't see them without polling.

**What exists**:
- `ctx.events.on(eventType, filter, handler)` — worker can subscribe to events (see `server/src/services/plugin-event-bus.ts`)
- Server-side filtering on top-level fields: `companyId`, `projectId`, `agentId`
- `ctx.streams.emit(channel, event)` ↔ `usePluginStream(channel)` — SSE-based push from worker to UI is already supported
- The pieces exist; the gap is wiring `ctx.events.on(...)` → `ctx.streams.emit(...)` declaratively

**What's missing**:
- A declarative path from a domain event to a UI stream (currently you have to write a handler that re-emits)
- `approval.*` events as a top-level event type — approvals exist as entities but aren't surfaced in the event list
- Filtering on nested payload fields (only top-level scope IDs are filterable today)

**Approach**: **fork-and-extend, partyclip-local**. The event bus and stream bridge are solid. Add a manifest-level `eventStreams[]` entry that declares "when event X fires, push to stream channel Y." Wire it in the loader so plugin authors don't have to hand-roll the bridge. Upstream Paperclip's roadmap is agent-centric; UI notification automation isn't a priority for them, so don't gate on upstream.

---

## 2. Isolation for untrusted content (forum ingestors): substantial gap

**Why partyclip needs this**: planned `ForumIngestor`-shaped plugins pull from public forums, RSS, and social. Content is untrusted; sandboxing is non-optional. The host runs every plugin in a separate Node.js process, but that process has the same UID and the same filesystem access as the host server.

**What exists**:
- Per-plugin Node.js child process with JSON-RPC over stdio (`server/src/services/plugin-worker-manager.ts`)
- DB schema isolation per plugin
- Capability-gated host services
- Audit logging on `ctx.http.fetch(...)` calls

**What's missing**:
- **Network egress controls**: a malicious plugin can call `fetch()` directly (bypasses `ctx.http`) to anywhere. No domain allowlist, no proxy enforcement
- **Filesystem containment**: plugin can read/write any path the host process can. No chroot, no mount jail
- **Syscall sandboxing**: no seccomp, no AppArmor/SELinux profile, no `--max-old-space-size`, no container boundary
- **Resource limits**: no per-plugin CPU, memory, file-descriptor, or connection caps
- **Subprocess controls**: nothing prevents `child_process.spawn()` / `exec()`
- **Content sanitization**: no SDK-bundled HTML/Markdown sanitizer for ingested content; every plugin must roll its own (and most won't, correctly)

**Approach**: **partyclip-specific hardening, no upstream collab expected**. The README explicitly says "Plugin workers and plugin UI should both be treated as trusted code today" — upstream Paperclip's threat model assumes first-party or vetted third-party plugins. partyclip's threat model includes content from the public internet, which is fundamentally different. Concretely:

- **Container-scoped execution**: deploy plugins requesting an `untrusted` capability inside a Docker / Firecracker microVM / `systemd-nspawn` boundary, not just a Node child process. The worker stdio protocol works across container boundaries unchanged.
- **Network policy in the manifest**: declarative `networkPolicy: { egress: ["api.example.com"] }` enforced at the container level, not at `ctx.http`.
- **Sanitization helpers as a sub-package**: `@partyclipai/plugin-sdk/sanitize` exporting DOMPurify-equivalent guards and an HTML parsing sandbox. Plugins that handle untrusted content `import { sanitizeHtml } from "@partyclipai/plugin-sdk/sanitize"`.
- **Resource limits at the container level** — cgroups for CPU/memory caps.

This is the largest SDK extension Phase 0 surfaces. It's not blocking for partyclip's first internal deployments (where plugins are first-party), but it's blocking for any plugin that ingests public-internet content. Track as a pre-1.0 must-have.

---

## 3. Trigger types beyond cron: incremental gap

**Why partyclip needs this**: pipeline stages, ForumIngestor polling, and operator-driven manual flows all need trigger semantics that aren't pure cron.

**What exists** (`packages/plugins/sdk/src/types.ts` ~line 190 — the `trigger` discriminator on `JobRun`):
- `"schedule"` — cron-ticked, ~30s scheduler resolution
- `"manual"` — operator-pressed "Run Now" in the UI; one-shot, no auto-retry
- `"retry"` — operator re-runs a failed job; no backoff, just re-execute

`plugin_job_runs` records all three with status and error. Plugins can query history but the scheduler doesn't act on it autonomously.

**What's missing**:
- **Event-triggered jobs**: declarative "when `issue.created` fires, run job X" instead of writing an event handler that calls a separate action. The pieces exist (event bus + job runner) but aren't wired together at the manifest layer.
- **Automatic retry with backoff**: no `retryPolicy: { maxAttempts, backoffMs }` on a job declaration. Plugins must hand-roll retry loops.
- **Delayed/once-at triggers**: no `triggerAt: ISOString` for "run this once at 3pm tomorrow."
- **Dependency triggers**: no "run B after A succeeds" — every job is independent.

**Approach**: **fork-and-extend, partyclip-local**. The implementation is contained:

1. Manifest extension: add `trigger: "event" | "schedule" | "delayed"` and a per-trigger config block (`eventPattern`, `cron`, `triggerAt`).
2. Scheduler extension: subscribe `plugin-job-scheduler.ts` to the event bus and dispatch matching events as job runs with `trigger: "event"`.
3. Retry extension: add `retryPolicy` field; scheduler checks failed `plugin_job_runs` and re-queues based on backoff.
4. Persist `triggerAt` for delayed jobs; scheduler skips runs whose time hasn't come.

Upstream is unlikely to prioritize this (job scheduling is a stable area for Paperclip). Implement as a partyclip-local manifest extension; plugins authored against partyclip will use the new fields, plugins authored against upstream Paperclip will continue to work with the cron-only subset.

---

## Cross-cutting: the manifest-extension pattern

The three gaps above share a structural answer: **extend the manifest schema with partyclip-specific fields, validate them locally, and keep the runtime contract backwards-compatible with upstream Paperclip plugins.**

This works because:
- Capabilities are already opt-in — a plugin not requesting `network.egress.restricted` keeps today's behavior
- The Zod validator in `packages/shared/src/validators/plugin.ts` is strict but extensible (additionalProperties: ignore on optional fields)
- The plugin loader treats unknown fields as warnings, not errors, when versioned correctly

So the model is: each gap becomes a partyclip-specific manifest field + a partyclip-specific runtime capability. Upstream Paperclip plugins continue to load. partyclip-aware plugins opt into stricter isolation, automatic retries, event triggers, and so on.

---

## Out of scope for Phase 0

- Reworking the JSON-RPC protocol (the ~14-method protocol in `packages/plugins/sdk/src/protocol.ts` is fine)
- Replacing Zod-based validation
- Switching plugin manifests away from TypeScript modules to a static JSON format
- Cross-plugin dependency or messaging — plugins remain isolated by design
