import { describe, expect, it } from "vitest";
import { parsePipelineYaml, PipelineLoadError } from "./loader.js";

const VALID_PIPELINE = `
id: regular
name: "Regular patch pipeline"
applies_to: [REGULAR]
max_cost_per_patch: 25
stages:
  - id: drafting
    agent_role: Architect
    timeout_minutes: 30
  - id: critique
    agent_role: Critic
    decision: binary
    on_reject: { goto: drafting, with_reason: true }
  - id: risk_assess
    agent_role: Legal
    on_reject: { goto: drafting, with_reason: true }
  - id: executor
    agent_role: Executor
  - id: bias_mirror
    agent_role: BiasMirror
    on_block: { goto: drafting, with_reason: true }
  - id: awaiting_signoff
    gate: operator
`;

describe("pipeline loader", () => {
  it("accepts the regular reference pipeline", () => {
    const def = parsePipelineYaml(VALID_PIPELINE);
    expect(def.id).toBe("regular");
    expect(def.stages).toHaveLength(6);
    expect(def.stages[0].id).toBe("drafting");
    expect(def.stages[def.stages.length - 1].gate).toBe("operator");
    expect(def.max_cost_per_patch).toBe(25);
  });

  it("applies retry-policy default", () => {
    const def = parsePipelineYaml(VALID_PIPELINE);
    expect(def.stages[0].retry_policy.max_attempts).toBe(2);
  });

  it("rejects missing operator gate at end", () => {
    const bad = VALID_PIPELINE.replace("    gate: operator", "    agent_role: Critic");
    expect(() => parsePipelineYaml(bad)).toThrow(PipelineLoadError);
  });

  it("rejects pipeline whose first stage isn't drafting", () => {
    const bad = VALID_PIPELINE.replace("  - id: drafting", "  - id: critique").replace(
      "  - id: critique\n    agent_role: Critic\n    decision: binary",
      "",
    );
    expect(() => parsePipelineYaml(bad)).toThrow(PipelineLoadError);
  });

  it("rejects an operator stage that also names an agent_role", () => {
    const bad = VALID_PIPELINE.replace("    gate: operator", "    gate: operator\n    agent_role: Spokesperson");
    expect(() => parsePipelineYaml(bad)).toThrow(PipelineLoadError);
  });

  it("rejects unknown stage id", () => {
    const bad = VALID_PIPELINE.replace("- id: critique", "- id: weighing");
    expect(() => parsePipelineYaml(bad)).toThrow(PipelineLoadError);
  });

  it("rejects malformed YAML", () => {
    expect(() => parsePipelineYaml(":\n  not_yaml: [")).toThrow(PipelineLoadError);
  });
});
