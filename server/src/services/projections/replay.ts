import { asc, gte, eq, and, type SQL } from "drizzle-orm";
import type { Db } from "@partyclipai/db";
import { activityLog } from "@partyclipai/db";
import type { PartyclipEvent, Projector } from "./types.js";

const PARTYCLIP_EVENT_PREFIX = "patch.";

function rowToEvent(row: typeof activityLog.$inferSelect): PartyclipEvent {
  return {
    id: row.id,
    companyId: row.companyId,
    type: row.action,
    aggregateType: row.entityType,
    aggregateId: row.entityId,
    actorType: row.actorType,
    actorId: row.actorId,
    payload: (row.details as Record<string, unknown> | null) ?? {},
    createdAt: row.createdAt,
  };
}

export interface ReplayOptions {
  fromTimestamp?: Date;
  companyId?: string;
  /** Default: only partyclip patch.* events. Pass true to read every activity_log row. */
  includeAll?: boolean;
}

/** Yields events from activity_log in append order. */
export async function* streamEvents(
  db: Db,
  options: ReplayOptions = {},
): AsyncGenerator<PartyclipEvent, void, void> {
  const filters: SQL[] = [];
  if (options.fromTimestamp) filters.push(gte(activityLog.createdAt, options.fromTimestamp));
  if (options.companyId) filters.push(eq(activityLog.companyId, options.companyId));
  const where = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters);
  const query = db.select().from(activityLog).orderBy(asc(activityLog.createdAt), asc(activityLog.id));
  const rows = where ? await query.where(where) : await query;
  for (const row of rows) {
    if (!options.includeAll && !row.action.startsWith(PARTYCLIP_EVENT_PREFIX)) continue;
    yield rowToEvent(row);
  }
}

export interface ReplaySummary {
  eventsRead: number;
  byType: Record<string, number>;
  aggregates: Map<string, unknown>;
}

/** Replays the log, applying a projector per aggregateId. Pure-ish: builds an in-memory map. */
export async function replayProjector<TState>(
  db: Db,
  projector: Projector<TState>,
  options: ReplayOptions = {},
): Promise<ReplaySummary> {
  const summary: ReplaySummary = {
    eventsRead: 0,
    byType: {},
    aggregates: new Map<string, TState>(),
  };
  for await (const event of streamEvents(db, options)) {
    if (event.aggregateType !== projector.aggregateType) continue;
    summary.eventsRead += 1;
    summary.byType[event.type] = (summary.byType[event.type] ?? 0) + 1;
    const prev = (summary.aggregates.get(event.aggregateId) as TState | undefined) ?? projector.initial();
    summary.aggregates.set(event.aggregateId, projector.apply(prev, event));
  }
  return summary;
}
