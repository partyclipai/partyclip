import { describe, expect, it } from "vitest";
import { parsePipelineYaml } from "./loader.js";
import { dispatch, type DispatchInput } from "./dispatcher.js";

const PIPELINE = parsePipelineYaml(`
id: regular
name: "Regular"
applies_to: [REGULAR]
max_cost_per_patch: 10
stages:
  - { id: drafting, agent_role: Architect }
  - { id: critique, agent_role: Critic, decision: binary, on_reject: { goto: drafting, with_reason: true } }
  - { id: risk_assess, agent_role: Legal, on_reject: { goto: drafting, with_reason: true } }
  - { id: executor, agent_role: Executor }
  - { id: bias_mirror, agent_role: BiasMirror, on_block: { goto: drafting, with_reason: true } }
  - { id: awaiting_signoff, gate: operator }
`);

function base(overrides: Partial<DispatchInput> = {}): DispatchInput {
  return {
    pipeline: PIPELINE,
    patchState: "DRAFTING",
    currentStageId: null,
    outcome: null,
    attempt: 1,
    costTotal: 0,
    ...overrides,
  };
}

describe("dispatcher", () => {
  it("starts a fresh patch at drafting", () => {
    const action = dispatch(base());
    expect(action.type).toBe("run_stage");
    if (action.type === "run_stage") expect(action.stage.id).toBe("drafting");
  });

  it("advances drafting → critique on pass", () => {
    const action = dispatch(
      base({ patchState: "DRAFTING", currentStageId: "drafting", outcome: { kind: "pass" } }),
    );
    expect(action.type).toBe("run_stage");
    if (action.type === "run_stage") expect(action.stage.id).toBe("critique");
  });

  it("rejects critique → drafting", () => {
    const action = dispatch(
      base({
        patchState: "CRITIQUE",
        currentStageId: "critique",
        outcome: { kind: "reject", reasonCode: "WEAK_DRAFT" },
      }),
    );
    expect(action).toEqual({ type: "reject_to_drafting", from: "critique", reasonCode: "WEAK_DRAFT" });
  });

  it("blocks bias_mirror → drafting", () => {
    const action = dispatch(
      base({
        patchState: "BIAS_MIRROR",
        currentStageId: "bias_mirror",
        outcome: { kind: "block", reasonCode: "BIAS_BLOCKED" },
      }),
    );
    expect(action).toEqual({ type: "reject_to_drafting", from: "bias_mirror", reasonCode: "BIAS_BLOCKED" });
  });

  it("hands off to operator gate after bias_mirror passes", () => {
    const action = dispatch(
      base({
        patchState: "BIAS_MIRROR",
        currentStageId: "bias_mirror",
        outcome: { kind: "pass" },
      }),
    );
    expect(action.type).toBe("operator_gate");
    if (action.type === "operator_gate") expect(action.stage.id).toBe("awaiting_signoff");
  });

  it("retries on transient failure within retry budget", () => {
    const action = dispatch(
      base({
        patchState: "CRITIQUE",
        currentStageId: "critique",
        outcome: { kind: "transient_failure", reasonCode: "ETIMEDOUT" },
        attempt: 1,
      }),
    );
    expect(action.type).toBe("retry_stage");
    if (action.type === "retry_stage") expect(action.nextAttempt).toBe(2);
  });

  it("halts after retries are exhausted", () => {
    const action = dispatch(
      base({
        patchState: "CRITIQUE",
        currentStageId: "critique",
        outcome: { kind: "transient_failure", reasonCode: "ETIMEDOUT" },
        attempt: 2,
      }),
    );
    expect(action.type).toBe("halt");
  });

  it("kills patch when budget is exceeded before next dispatch", () => {
    const action = dispatch(base({ costTotal: 10.01 }));
    expect(action).toEqual({ type: "kill", reasonCode: "BUDGET_EXCEEDED" });
  });

  it("kills patch on terminal BUDGET_EXCEEDED outcome", () => {
    const action = dispatch(
      base({
        patchState: "EXECUTOR",
        currentStageId: "executor",
        outcome: { kind: "terminal_failure", reasonCode: "BUDGET_EXCEEDED" },
      }),
    );
    expect(action).toEqual({ type: "kill", reasonCode: "BUDGET_EXCEEDED" });
  });

  it("halts on terminal patch states", () => {
    expect(dispatch(base({ patchState: "PUBLISHED" })).type).toBe("halt");
    expect(dispatch(base({ patchState: "KILLED" })).type).toBe("halt");
    expect(dispatch(base({ patchState: "REPEALED" })).type).toBe("halt");
  });

  it("waits on defer", () => {
    const action = dispatch(
      base({ patchState: "CRITIQUE", currentStageId: "critique", outcome: { kind: "defer" } }),
    );
    expect(action.type).toBe("wait");
  });
});
