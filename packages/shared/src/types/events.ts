/**
 * Partyclip event taxonomy. Events are the only inter-service contract:
 * agents subscribe to types, the dispatcher reacts to outcomes, the
 * audit log records every transition. See docs/handoff/08_AGENT_FRAMEWORK.md.
 *
 * Phase 1 activates a small subset; the rest are defined here so plugin
 * authors can subscribe to them in advance and so adding a new producer
 * later is a non-breaking change.
 */

export const PARTYCLIP_EVENT_TYPES = [
  // patch lifecycle (active in Phase 1)
  "patch.created",
  "patch.stage.completed",
  "patch.stage.rejected",
  "patch.published",
  "patch.repealed",
  "patch.killed",
  "patch.paused",
  "patch.resumed",
  "patch.reinstated",
  "patch.cost.recorded",
  // pipeline-level (active in Phase 1)
  "budget.threshold_crossed",
  // scheduler (active in Phase 1; concrete cron_id is appended at runtime)
  "scheduled.tick",
  // dormant — defined for forward-compat, no producers in Phase 1
  "news.ingested",
  "issue.opened",
  "gov_action.detected",
  "forum.feedback_summary.updated",
  "vote.session.opened",
  "petition.threshold_reached",
] as const;

export type PartyclipEventType = (typeof PARTYCLIP_EVENT_TYPES)[number];

/** Phase 1 events that have a producer wired up. The rest are dormant. */
export const PHASE_1_LIVE_EVENTS: ReadonlySet<PartyclipEventType> = new Set([
  "patch.created",
  "patch.stage.completed",
  "patch.stage.rejected",
  "patch.published",
  "patch.repealed",
  "patch.killed",
  "patch.paused",
  "patch.resumed",
  "patch.reinstated",
  "patch.cost.recorded",
  "budget.threshold_crossed",
  "scheduled.tick",
]);

/**
 * Subscription patterns: exact event type, dotted prefix wildcard
 * (e.g. `patch.*` matches every patch.* event), or `*` (everything).
 */
export type EventSubscription = PartyclipEventType | `${string}.*` | "*";

export function matchesSubscription(eventType: string, sub: EventSubscription): boolean {
  if (sub === "*") return true;
  if (sub.endsWith(".*")) {
    const prefix = sub.slice(0, -2);
    return eventType === prefix || eventType.startsWith(`${prefix}.`);
  }
  return eventType === sub;
}

export function isLiveEventType(eventType: string): eventType is PartyclipEventType {
  if (eventType.startsWith("scheduled.tick.")) return true; // cron variants
  return PHASE_1_LIVE_EVENTS.has(eventType as PartyclipEventType);
}

/** Event envelope shared between bus and audit log. */
export interface PartyclipEventEnvelope {
  readonly type: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly companyId: string;
  readonly actorType: "agent" | "user" | "system" | "plugin";
  readonly actorId: string;
  readonly payload: Record<string, unknown>;
  readonly occurredAt: Date;
}
