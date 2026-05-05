import {
  isLegalTransition,
  type PatchClassification,
  type PatchState,
} from "@partyclipai/shared/types/patch";
import type { PartyclipEvent, Projector } from "./types.js";

export interface PatchProjection {
  id: string;
  companyId: string;
  title: string;
  classification: PatchClassification;
  state: PatchState;
  body: string;
  costTotal: number;
  publishedAt: Date | null;
  killedAt: Date | null;
  killReasonCode: string | null;
  pausedAt: Date | null;
  updatedAt: Date;
}

/**
 * Pure reducer for the patch aggregate. The runtime feeds events for a
 * single aggregateId; the reducer never touches global state. Illegal
 * state transitions are silently ignored (and surfaced to observability
 * via a logged warning at the runtime layer) — the validator on the
 * write path is the enforcement point. The projector is recovery code:
 * its job is to converge to whatever state the log actually contains.
 */
export const patchProjector: Projector<PatchProjection | null> = {
  name: "patch",
  aggregateType: "patch",

  initial(): PatchProjection | null {
    return null;
  },

  apply(state, event) {
    switch (event.type) {
      case "patch.created": {
        const payload = event.payload as Partial<PatchProjection>;
        return {
          id: event.aggregateId,
          companyId: event.companyId,
          title: typeof payload.title === "string" ? payload.title : "",
          classification: (payload.classification as PatchClassification | undefined) ?? "REGULAR",
          state: "DRAFTING",
          body: typeof payload.body === "string" ? payload.body : "",
          costTotal: 0,
          publishedAt: null,
          killedAt: null,
          killReasonCode: null,
          pausedAt: null,
          updatedAt: event.createdAt,
        };
      }
      case "patch.stage.completed": {
        if (!state) return state;
        const next = event.payload.nextState as PatchState | undefined;
        if (!next || !isLegalTransition(state.state, next, "forward")) return state;
        return { ...state, state: next, updatedAt: event.createdAt };
      }
      case "patch.stage.rejected": {
        if (!state) return state;
        if (!isLegalTransition(state.state, "DRAFTING", "reject")) return state;
        return { ...state, state: "DRAFTING", updatedAt: event.createdAt };
      }
      case "patch.killed": {
        if (!state) return state;
        if (!isLegalTransition(state.state, "KILLED", "kill")) return state;
        const reason = typeof event.payload.reasonCode === "string" ? event.payload.reasonCode : null;
        return {
          ...state,
          state: "KILLED",
          killedAt: event.createdAt,
          killReasonCode: reason,
          updatedAt: event.createdAt,
        };
      }
      case "patch.published": {
        if (!state) return state;
        if (!isLegalTransition(state.state, "PUBLISHED", "forward")) return state;
        return {
          ...state,
          state: "PUBLISHED",
          publishedAt: event.createdAt,
          updatedAt: event.createdAt,
        };
      }
      case "patch.repealed": {
        if (!state) return state;
        if (!isLegalTransition(state.state, "REPEALED", "repeal")) return state;
        return { ...state, state: "REPEALED", updatedAt: event.createdAt };
      }
      case "patch.cost.recorded": {
        if (!state) return state;
        const delta = typeof event.payload.cost === "number" ? event.payload.cost : 0;
        return { ...state, costTotal: state.costTotal + delta, updatedAt: event.createdAt };
      }
      case "patch.paused": {
        if (!state) return state;
        return { ...state, pausedAt: event.createdAt, updatedAt: event.createdAt };
      }
      case "patch.resumed": {
        if (!state) return state;
        return { ...state, pausedAt: null, updatedAt: event.createdAt };
      }
      default:
        return state;
    }
  },
};

/** Convenience for tests and replay tools. */
export function projectPatch(events: readonly PartyclipEvent[]): PatchProjection | null {
  return events.reduce<PatchProjection | null>(
    (state, event) => patchProjector.apply(state, event),
    patchProjector.initial(),
  );
}
