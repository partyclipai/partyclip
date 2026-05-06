# ADR-002: Event store schema and replay semantics

| | |
|---|---|
| Status | Accepted |
| Date | 2026-05-06 |
| Deciders | Operator |
| Supersedes | — |
| Superseded by | — |

## Context

ADR-001 commits partyclip to a state-machine pipeline whose transitions
are events in an append-only audit log. That decision implies a second
question: *what does the event store actually look like, and what
guarantees do we make about replay?*

Two recurring failure modes in event-sourced systems shaped this
decision:

1. Application code accidentally `UPDATE`s or `DELETE`s rows in the
   "append-only" store. Once that happens, the audit log loses its
   load-bearing property. Code reviews don't catch this reliably; the
   guarantee has to be enforced at the database.
2. The projection layer ("what's the *current* state of patch 47?")
   diverges from the event log. Either projection code has a bug, or
   migrations changed the schema, or replay isn't actually
   deterministic. Without a way to detect divergence, the bug is
   silent and operators trust a stale view.

## Decision

partyclip uses an **append-only event store backed by `activity_log`**
in the existing Paperclip schema, with three structural guarantees:

1. **Database-level append-only enforcement.** Migration `0076` installs
   plpgsql triggers that raise on `UPDATE` or `DELETE` against
   `activity_log` for any role. This catches accidents from future
   code, ad-hoc psql sessions, and operator mistakes alike.
2. **Pure-function projectors.** Each projector
   (`server/src/services/projections/<aggregate>-projector.ts`) is a
   pure reducer over the event stream. No I/O, no clock, no
   randomness. The runtime feeds events for one `aggregateId`; the
   reducer emits the projected state. This makes replay a property,
   not a hope.
3. **Replay as a divergence test.** The `partyclip events replay` CLI
   reconstructs every patch from genesis (or from a chosen
   timestamp) into a separate state, then compares to the live
   projection. Any mismatch is a bug — either in the projector, the
   write path, or a migration. The replay tool is not just a recovery
   mechanism; it's the canonical way to detect projection drift.

### Event envelope

Every partyclip event carries:

| Field | Stored as | Notes |
|---|---|---|
| `id` | `activity_log.id` (uuid) | Server-assigned ULID-equivalent |
| `companyId` | `activity_log.company_id` | Tenant scope |
| `type` | `activity_log.action` | Dotted: `patch.stage.completed` etc. |
| `aggregateType` | `activity_log.entity_type` | e.g. `patch` |
| `aggregateId` | `activity_log.entity_id` | The patch UUID |
| `actorType` / `actorId` | direct columns | `agent` / `user` / `system` / `plugin` |
| `payload` | `activity_log.details` (jsonb) | Schema enforced per event type |
| `createdAt` | direct | Server clock |

### Visibility-class gating happens in projection, not storage

The audit log records every event regardless of visibility class. The
projection layer applies visibility gating when serving reads. This
means a future leak in projection code can't undo what the log already
captured — and the operator-side "view everything" path is the
unfiltered projector, accessible only with operator credentials.

## Consequences

### Positive

1. **Database-level guarantee.** No code path — application bug,
   ORM hiccup, ad-hoc psql session, or future contributor — can
   silently break append-only.
2. **Replay is a test, not a fairy tale.** Pure projectors mean the
   replay tool gives a deterministic answer; deltas surface bugs
   immediately.
3. **Single store.** Reusing `activity_log` rather than introducing a
   parallel `events` table avoids the dual-store sync problem and
   keeps Paperclip-inherited audit trails in the same place.

### Negative

1. **Projector drift on schema changes.** If a migration adds a field
   to a projection but nothing replays old events, projected state
   diverges silently from what replay would produce. The replay tool
   makes this *detectable*; we still have to remember to run it after
   migrations that change projector logic.
2. **`activity_log` schema is partly Paperclip-shaped.** The column
   names (`action`, `entity_type`, `entity_id`) come from Paperclip,
   not from our event-envelope vocabulary. We map at the boundary.
   Acceptable; documented in `server/src/services/projections/types.ts`
   and `events/bus.ts`.
3. **`details` is `jsonb`, not a typed column.** Payload schema is
   enforced in code, not in the database. Acceptable for v0; revisit
   if we standardize a per-event-type schema registry.

### Operational

- Replay before declaring a projector bug fixed: even if the new code
  looks right, run `partyclip events replay` against a copy of
  production data and diff the projections. Include the diff in the
  PR description.
- Migrations that change projector logic must include a one-line
  replay verification in the PR template.

## Alternatives considered

- **Separate `events` table.** Rejected: dual-store sync. Either we
  write to both transactionally (tricky across the existing schema)
  or we accept drift between them. The audit log is already what we
  needed.
- **Application-level append-only.** Rejected: the failure modes
  this is supposed to prevent are exactly the ones application
  code can introduce. The guarantee has to live below the app.
- **External event store (Kafka, EventStore, etc.).** Rejected for
  Phase 1: deployment burden, recovery story complexity, and the
  audit log already gives us the semantics with one fewer process.
  Re-evaluate when we shard.

## References

- `packages/db/src/migrations/0076_activity_log_append_only.sql`
- `server/src/services/projections/types.ts`
- `server/src/services/projections/replay.ts`
- `cli/src/commands/events-replay.ts`
- `docs/handoff/02_ARCHITECTURE.md`
