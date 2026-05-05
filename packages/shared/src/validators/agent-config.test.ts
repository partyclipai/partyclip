import { describe, expect, it } from "vitest";
import { agentConfigSchema, modelForStage } from "../types/agent-config.js";

const BASE = {
  id: "architect-default",
  role: "Architect" as const,
  activation_mode: "TRIGGER_ONLY" as const,
  persona_ref: "agents/architect.md",
  constitution_ref: "constitution/",
  model: "claude-opus-4-7",
  triggers: ["patch.stage.completed"],
  tools: [],
};

describe("agent config", () => {
  it("accepts a minimal trigger-driven Architect", () => {
    expect(agentConfigSchema.safeParse(BASE).success).toBe(true);
  });

  it("rejects a SCHEDULED agent without a schedule", () => {
    const cfg = { ...BASE, activation_mode: "SCHEDULED" as const, triggers: [] };
    expect(agentConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it("rejects a TRIGGER_ONLY agent with no triggers", () => {
    const cfg = { ...BASE, triggers: [] };
    expect(agentConfigSchema.safeParse(cfg).success).toBe(false);
  });

  it("accepts SCHEDULED with cron and no triggers", () => {
    const cfg = {
      ...BASE,
      activation_mode: "SCHEDULED" as const,
      schedule: "0 9 * * *",
      triggers: [],
    };
    expect(agentConfigSchema.safeParse(cfg).success).toBe(true);
  });

  it("rejects unknown role", () => {
    expect(agentConfigSchema.safeParse({ ...BASE, role: "Mayor" }).success).toBe(false);
  });

  it("rejects malformed trigger subscriptions", () => {
    expect(agentConfigSchema.safeParse({ ...BASE, triggers: ["Patch.Stage.Completed"] }).success).toBe(false);
    expect(agentConfigSchema.safeParse({ ...BASE, triggers: [".bad"] }).success).toBe(false);
  });

  it("modelForStage applies overrides", () => {
    const cfg = agentConfigSchema.parse({
      ...BASE,
      model_overrides: { bias_mirror: "claude-opus-strongest" },
    });
    expect(modelForStage(cfg, "drafting")).toBe("claude-opus-4-7");
    expect(modelForStage(cfg, "bias_mirror")).toBe("claude-opus-strongest");
  });
});
