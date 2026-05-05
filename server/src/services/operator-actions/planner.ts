import {
  isLegalTransition,
  KILLABLE_FROM,
  type PatchState,
} from "@partyclipai/shared/types/patch";

/**
 * Pure planner: given a current patch + operator action + rationale,
 * produce either a write plan (rows to insert + state transition +
 * event to emit) or a structured error. The runtime layer (routes)
 * applies the plan in a transaction; tests don't need a database.
 *
 * Per docs/handoff/04_PIPELINE.md every operator action requires a
 * non-empty rationale, and rationale is public.
 */

export const OPERATOR_ACTIONS = [
  "INTERCEPT",
  "OVERRIDE_BIAS",
  "OVERRIDE_VOTE",
  "KILL",
  "SIGNOFF",
  "REPEAL",
  "REINSTATE",
] as const;
export type OperatorAction = (typeof OPERATOR_ACTIONS)[number];

export interface OperatorActionInput {
  readonly action: OperatorAction;
  readonly patchId: string;
  readonly companyId: string;
  readonly operatorId: string;
  readonly rationale: string;
  readonly currentPatchState: PatchState;
}

export interface OperatorActionPlan {
  readonly insertOperatorAction: {
    readonly companyId: string;
    readonly patchId: string | null;
    readonly action: OperatorAction;
    readonly operatorUserId: string;
    readonly rationale: string;
    readonly visibilityClass: "PUBLIC";
  };
  readonly patchTransition: {
    readonly from: PatchState;
    readonly to: PatchState;
  } | null;
  /** Event to write to activity_log so projectors update. */
  readonly event: {
    readonly type: string;
    readonly payload: Record<string, unknown>;
  };
}

export type OperatorActionResult =
  | { kind: "ok"; plan: OperatorActionPlan }
  | { kind: "error"; code: string; message: string };

const RATIONALE_MIN = 8;
const RATIONALE_MAX = 4000;

function validateRationale(rationale: string): string | null {
  const trimmed = rationale.trim();
  if (trimmed.length < RATIONALE_MIN) return `RATIONALE_TOO_SHORT (min ${RATIONALE_MIN} chars)`;
  if (trimmed.length > RATIONALE_MAX) return `RATIONALE_TOO_LONG (max ${RATIONALE_MAX} chars)`;
  return null;
}

export function planOperatorAction(input: OperatorActionInput): OperatorActionResult {
  const rErr = validateRationale(input.rationale);
  if (rErr) return { kind: "error", code: "RATIONALE_INVALID", message: rErr };

  const base = {
    companyId: input.companyId,
    patchId: input.patchId,
    action: input.action,
    operatorUserId: input.operatorId,
    rationale: input.rationale.trim(),
    visibilityClass: "PUBLIC" as const,
  };

  switch (input.action) {
    case "SIGNOFF": {
      if (input.currentPatchState !== "AWAITING_SIGNOFF") {
        return {
          kind: "error",
          code: "WRONG_STATE",
          message: `SIGNOFF only allowed at AWAITING_SIGNOFF (current: ${input.currentPatchState})`,
        };
      }
      return {
        kind: "ok",
        plan: {
          insertOperatorAction: base,
          patchTransition: { from: input.currentPatchState, to: "PUBLISHED" },
          event: {
            type: "patch.published",
            payload: { patchId: input.patchId, operatorId: input.operatorId, rationale: base.rationale },
          },
        },
      };
    }

    case "KILL": {
      if (!KILLABLE_FROM.has(input.currentPatchState)) {
        return {
          kind: "error",
          code: "WRONG_STATE",
          message: `KILL not allowed from terminal state ${input.currentPatchState}`,
        };
      }
      return {
        kind: "ok",
        plan: {
          insertOperatorAction: base,
          patchTransition: { from: input.currentPatchState, to: "KILLED" },
          event: {
            type: "patch.killed",
            payload: {
              patchId: input.patchId,
              operatorId: input.operatorId,
              reasonCode: "OPERATOR_KILL",
              rationale: base.rationale,
            },
          },
        },
      };
    }

    case "REPEAL": {
      if (!isLegalTransition(input.currentPatchState, "REPEALED", "repeal")) {
        return {
          kind: "error",
          code: "WRONG_STATE",
          message: "REPEAL only allowed from PUBLISHED",
        };
      }
      return {
        kind: "ok",
        plan: {
          insertOperatorAction: base,
          patchTransition: { from: input.currentPatchState, to: "REPEALED" },
          event: {
            type: "patch.repealed",
            payload: { patchId: input.patchId, operatorId: input.operatorId, rationale: base.rationale },
          },
        },
      };
    }

    case "REINSTATE": {
      if (input.currentPatchState !== "REPEALED") {
        return {
          kind: "error",
          code: "WRONG_STATE",
          message: "REINSTATE only allowed from REPEALED",
        };
      }
      return {
        kind: "ok",
        plan: {
          insertOperatorAction: base,
          patchTransition: { from: input.currentPatchState, to: "PUBLISHED" },
          event: {
            type: "patch.reinstated",
            payload: { patchId: input.patchId, operatorId: input.operatorId, rationale: base.rationale },
          },
        },
      };
    }

    case "INTERCEPT": {
      if (input.currentPatchState === "PUBLISHED" || input.currentPatchState === "KILLED" || input.currentPatchState === "REPEALED") {
        return {
          kind: "error",
          code: "WRONG_STATE",
          message: `INTERCEPT not allowed from terminal state ${input.currentPatchState}`,
        };
      }
      return {
        kind: "ok",
        plan: {
          insertOperatorAction: base,
          patchTransition: null,
          event: {
            type: "patch.paused",
            payload: { patchId: input.patchId, operatorId: input.operatorId, rationale: base.rationale, by: "INTERCEPT" },
          },
        },
      };
    }

    case "OVERRIDE_BIAS": {
      if (input.currentPatchState !== "BIAS_MIRROR" && input.currentPatchState !== "DRAFTING") {
        return {
          kind: "error",
          code: "WRONG_STATE",
          message: "OVERRIDE_BIAS only valid after a BLOCK from BIAS_MIRROR (current state must be BIAS_MIRROR or DRAFTING after the block)",
        };
      }
      return {
        kind: "ok",
        plan: {
          insertOperatorAction: base,
          patchTransition: { from: input.currentPatchState, to: "AWAITING_SIGNOFF" },
          event: {
            type: "patch.stage.completed",
            payload: {
              patchId: input.patchId,
              operatorId: input.operatorId,
              nextState: "AWAITING_SIGNOFF",
              by: "OVERRIDE_BIAS",
              rationale: base.rationale,
            },
          },
        },
      };
    }

    case "OVERRIDE_VOTE": {
      const allowed: ReadonlySet<PatchState> = new Set(["CRITIQUE", "RISK_ASSESS", "DRAFTING"]);
      if (!allowed.has(input.currentPatchState)) {
        return {
          kind: "error",
          code: "WRONG_STATE",
          message: "OVERRIDE_VOTE only valid for CRITIQUE / RISK_ASSESS rejections",
        };
      }
      return {
        kind: "ok",
        plan: {
          insertOperatorAction: base,
          patchTransition: { from: input.currentPatchState, to: "EXECUTOR" },
          event: {
            type: "patch.stage.completed",
            payload: {
              patchId: input.patchId,
              operatorId: input.operatorId,
              nextState: "EXECUTOR",
              by: "OVERRIDE_VOTE",
              rationale: base.rationale,
            },
          },
        },
      };
    }

    default: {
      const exhaustive: never = input.action;
      void exhaustive;
      return { kind: "error", code: "UNKNOWN_ACTION", message: `Unknown operator action` };
    }
  }
}

export const RATIONALE_LIMITS = { min: RATIONALE_MIN, max: RATIONALE_MAX } as const;
