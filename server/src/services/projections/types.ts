/**
 * Projection layer for the partyclip event-sourced audit log.
 *
 * The activity_log table is the source of truth. Current entity rows
 * (patches, patch_stage_runs, etc.) are projections derived from events.
 * Visibility-class gating happens here, not at the event store.
 *
 * See docs/handoff/02_ARCHITECTURE.md and 03_DATA_MODEL.md.
 */

export interface PartyclipEvent {
  /** activity_log.id */
  readonly id: string;
  readonly companyId: string;
  /** activity_log.action — partyclip dotted form, e.g. `patch.stage.completed`. */
  readonly type: string;
  /** activity_log.entity_type, e.g. `patch`. */
  readonly aggregateType: string;
  /** activity_log.entity_id — the aggregate (e.g. patch UUID). */
  readonly aggregateId: string;
  readonly actorType: string;
  readonly actorId: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: Date;
}

/**
 * A projector consumes events and folds them into a typed state.
 * Reducers are pure: no I/O, no clock, no randomness. The runtime
 * persists the resulting state separately.
 */
export interface Projector<TState> {
  readonly name: string;
  readonly aggregateType: string;
  initial(): TState;
  apply(state: TState, event: PartyclipEvent): TState;
}
