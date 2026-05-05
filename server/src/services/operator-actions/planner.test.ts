import { describe, expect, it } from "vitest";
import { planOperatorAction, RATIONALE_LIMITS, type OperatorActionInput } from "./planner.js";
import type { PatchState } from "@partyclipai/shared/types/patch";

function input(overrides: Partial<OperatorActionInput> = {}): OperatorActionInput {
  return {
    action: "SIGNOFF",
    patchId: "p-1",
    companyId: "c-1",
    operatorId: "op-1",
    rationale: "looks good, all stages green and bias cleared",
    currentPatchState: "AWAITING_SIGNOFF",
    ...overrides,
  };
}

describe("planOperatorAction — rationale", () => {
  it("rejects rationale below minimum length", () => {
    const result = planOperatorAction(input({ rationale: "ok" }));
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.code).toBe("RATIONALE_INVALID");
  });

  it("rejects rationale above max length", () => {
    const result = planOperatorAction(input({ rationale: "x".repeat(RATIONALE_LIMITS.max + 1) }));
    expect(result.kind).toBe("error");
  });

  it("trims rationale before persisting", () => {
    const result = planOperatorAction(input({ rationale: "   reasonable rationale   " }));
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.plan.insertOperatorAction.rationale).toBe("reasonable rationale");
  });
});

describe("planOperatorAction — SIGNOFF", () => {
  it("only allowed at AWAITING_SIGNOFF", () => {
    expect(planOperatorAction(input()).kind).toBe("ok");
    expect(planOperatorAction(input({ currentPatchState: "DRAFTING" })).kind).toBe("error");
  });

  it("transitions to PUBLISHED and emits patch.published", () => {
    const result = planOperatorAction(input());
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.plan.patchTransition).toEqual({ from: "AWAITING_SIGNOFF", to: "PUBLISHED" });
      expect(result.plan.event.type).toBe("patch.published");
    }
  });
});

describe("planOperatorAction — KILL", () => {
  it("allowed from any non-terminal state", () => {
    for (const state of ["DRAFTING", "CRITIQUE", "RISK_ASSESS", "EXECUTOR", "BIAS_MIRROR", "AWAITING_SIGNOFF"] as PatchState[]) {
      expect(planOperatorAction(input({ action: "KILL", currentPatchState: state })).kind).toBe("ok");
    }
  });

  it("blocked from PUBLISHED / KILLED / REPEALED", () => {
    for (const state of ["PUBLISHED", "KILLED", "REPEALED"] as PatchState[]) {
      const result = planOperatorAction(input({ action: "KILL", currentPatchState: state }));
      expect(result.kind).toBe("error");
    }
  });

  it("emits patch.killed with OPERATOR_KILL reason code", () => {
    const result = planOperatorAction(input({ action: "KILL", currentPatchState: "EXECUTOR" }));
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.plan.event.type).toBe("patch.killed");
      expect(result.plan.event.payload.reasonCode).toBe("OPERATOR_KILL");
    }
  });
});

describe("planOperatorAction — REPEAL", () => {
  it("only from PUBLISHED", () => {
    expect(planOperatorAction(input({ action: "REPEAL", currentPatchState: "PUBLISHED" })).kind).toBe("ok");
    expect(planOperatorAction(input({ action: "REPEAL", currentPatchState: "DRAFTING" })).kind).toBe("error");
  });
});

describe("planOperatorAction — INTERCEPT", () => {
  it("does not transition state but emits patch.paused", () => {
    const result = planOperatorAction(input({ action: "INTERCEPT", currentPatchState: "EXECUTOR" }));
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.plan.patchTransition).toBeNull();
      expect(result.plan.event.type).toBe("patch.paused");
    }
  });

  it("blocked from terminal states", () => {
    for (const state of ["PUBLISHED", "KILLED", "REPEALED"] as PatchState[]) {
      expect(planOperatorAction(input({ action: "INTERCEPT", currentPatchState: state })).kind).toBe("error");
    }
  });
});

describe("planOperatorAction — OVERRIDE_BIAS", () => {
  it("transitions to AWAITING_SIGNOFF from BIAS_MIRROR or DRAFTING", () => {
    for (const state of ["BIAS_MIRROR", "DRAFTING"] as PatchState[]) {
      const result = planOperatorAction(input({ action: "OVERRIDE_BIAS", currentPatchState: state }));
      expect(result.kind).toBe("ok");
      if (result.kind === "ok") {
        expect(result.plan.patchTransition).toEqual({ from: state, to: "AWAITING_SIGNOFF" });
      }
    }
  });

  it("blocked elsewhere", () => {
    expect(planOperatorAction(input({ action: "OVERRIDE_BIAS", currentPatchState: "EXECUTOR" })).kind).toBe("error");
  });
});

describe("planOperatorAction — OVERRIDE_VOTE", () => {
  it("transitions to EXECUTOR from CRITIQUE / RISK_ASSESS / DRAFTING", () => {
    for (const state of ["CRITIQUE", "RISK_ASSESS", "DRAFTING"] as PatchState[]) {
      const result = planOperatorAction(input({ action: "OVERRIDE_VOTE", currentPatchState: state }));
      expect(result.kind).toBe("ok");
      if (result.kind === "ok") {
        expect(result.plan.patchTransition).toEqual({ from: state, to: "EXECUTOR" });
      }
    }
  });

  it("blocked elsewhere", () => {
    expect(planOperatorAction(input({ action: "OVERRIDE_VOTE", currentPatchState: "BIAS_MIRROR" })).kind).toBe("error");
  });
});
