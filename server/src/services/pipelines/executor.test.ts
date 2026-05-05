import { describe, expect, it } from "vitest";
import { parsePipelineYaml } from "./loader.js";
import { executeStage, type AgentRunner } from "./executor.js";
import { TransientPipelineError, TerminalPipelineError } from "./errors.js";

const PIPELINE = parsePipelineYaml(`
id: regular
name: "Regular"
applies_to: [REGULAR]
max_cost_per_patch: 1
stages:
  - { id: drafting, agent_role: Architect }
  - id: critique
    agent_role: Critic
    timeout_minutes: 1
    retry_policy: { max_attempts: 2, initial_backoff: 0 }
    on_reject: { goto: drafting, with_reason: true }
  - { id: awaiting_signoff, gate: operator }
`);

const CRITIQUE = PIPELINE.stages[1];

function fakeRunner(impl: AgentRunner["run"]): AgentRunner {
  return { run: impl };
}

describe("executeStage", () => {
  const baseInput = {
    patchId: "p-1",
    companyId: "c-1",
    stage: CRITIQUE,
    attempt: 1,
    context: {},
  } as const;

  it("returns the agent's pass outcome with measured cost and duration", async () => {
    const runner = fakeRunner(async () => ({
      outcome: { kind: "pass" },
      cost: 0.05,
      output: { score: 1 },
      model: "test-model",
    }));
    let t = 1000;
    const result = await executeStage(baseInput, {
      runner,
      now: () => (t += 50),
      costSoFar: 0.1,
      maxCostPerPatch: 1,
    });
    expect(result.outcome.kind).toBe("pass");
    expect(result.cost).toBeCloseTo(0.05);
    expect(result.attempts).toBe(1);
    expect(result.model).toBe("test-model");
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it("retries on transient errors up to max_attempts then surfaces transient_failure", async () => {
    let calls = 0;
    const runner = fakeRunner(async () => {
      calls += 1;
      throw new TransientPipelineError("rate limited", "RATE_LIMIT");
    });
    const result = await executeStage(baseInput, { runner, costSoFar: 0, maxCostPerPatch: 1 });
    expect(calls).toBe(2);
    expect(result.attempts).toBe(2);
    expect(result.outcome).toEqual({ kind: "transient_failure", reasonCode: "RATE_LIMIT" });
  });

  it("does not retry terminal errors", async () => {
    let calls = 0;
    const runner = fakeRunner(async () => {
      calls += 1;
      throw new TerminalPipelineError("schema mismatch", "BAD_OUTPUT");
    });
    const result = await executeStage(baseInput, { runner, costSoFar: 0, maxCostPerPatch: 1 });
    expect(calls).toBe(1);
    expect(result.outcome).toEqual({ kind: "terminal_failure", reasonCode: "BAD_OUTPUT" });
  });

  it("retries on heuristically-transient unexpected errors", async () => {
    let calls = 0;
    const runner = fakeRunner(async () => {
      calls += 1;
      if (calls === 1) throw new Error("ETIMEDOUT: upstream timed out");
      return { outcome: { kind: "pass" }, cost: 0.01, output: {}, model: null };
    });
    const result = await executeStage(baseInput, { runner, costSoFar: 0, maxCostPerPatch: 1 });
    expect(calls).toBe(2);
    expect(result.outcome.kind).toBe("pass");
    expect(result.attempts).toBe(2);
  });

  it("trips BudgetExceeded → terminal_failure(BUDGET_EXCEEDED)", async () => {
    const runner = fakeRunner(async () => ({
      outcome: { kind: "pass" },
      cost: 0.99,
      output: {},
      model: null,
    }));
    const result = await executeStage(baseInput, { runner, costSoFar: 0.5, maxCostPerPatch: 1 });
    expect(result.outcome).toEqual({ kind: "terminal_failure", reasonCode: "BUDGET_EXCEEDED" });
  });
});
