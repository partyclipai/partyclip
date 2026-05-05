import { describe, expect, it } from "vitest";
import { agentConfigSchema, type AgentConfig } from "@partyclipai/shared/types/agent-config";
import { parsePipelineYaml } from "../pipelines/loader.js";
import { executeStage } from "../pipelines/executor.js";
import type { ModelAdapter, ModelResponse } from "./model-adapter.js";
import { createAgentRunner, type AgentRunnerProviders } from "./runner.js";
import type { AgentTool, ConstitutionArticleRef, InputArtifact, PatchView } from "./envelope.js";

const PIPELINE = parsePipelineYaml(`
id: regular
name: "Regular"
applies_to: [REGULAR]
max_cost_per_patch: 5
stages:
  - { id: drafting, agent_role: Architect }
  - id: critique
    agent_role: Critic
    decision: binary
    on_reject: { goto: drafting, with_reason: true }
  - { id: awaiting_signoff, gate: operator }
`);

const ARCHITECT: AgentConfig = agentConfigSchema.parse({
  id: "arch-default",
  role: "Architect",
  activation_mode: "TRIGGER_ONLY",
  triggers: ["patch.stage.completed"],
  persona_ref: "agents/architect.md",
  model: "fake-model",
  tools: [],
});

const CRITIC: AgentConfig = agentConfigSchema.parse({
  id: "critic-default",
  role: "Critic",
  activation_mode: "TRIGGER_ONLY",
  triggers: ["patch.stage.completed"],
  persona_ref: "agents/critic.md",
  model: "fake-model",
  tools: [],
});

const CONSTITUTION: ConstitutionArticleRef[] = [
  { stableId: "CONST-K1-A1", version: 1, title: "Founding", body: "..." },
];

const PATCH: PatchView = {
  id: "p-1",
  title: "Test",
  classification: "REGULAR",
  body: "",
  citations: [],
};

function adapterReturning(text: string, cost = 0.01): ModelAdapter {
  return {
    async invoke(): Promise<ModelResponse> {
      return { text, cost, promptTokens: 100, completionTokens: 20, modelUsed: "fake-model" };
    },
  };
}

function providersFor(role: "Architect" | "Critic", adapter: ModelAdapter): AgentRunnerProviders {
  return {
    modelAdapter: adapter,
    async loadAgent() {
      return role === "Architect" ? ARCHITECT : CRITIC;
    },
    async loadPersona(agent) {
      return `Persona for ${agent.role}`;
    },
    async loadConstitution() {
      return CONSTITUTION;
    },
    async loadPatch() {
      return PATCH;
    },
    async loadInputArtifacts(): Promise<readonly InputArtifact[]> {
      return [];
    },
    async resolveToolset(): Promise<readonly AgentTool[]> {
      return [];
    },
  };
}

describe("createAgentRunner", () => {
  it("drives an Architect stage through the pipeline executor to PASS", async () => {
    const adapter = adapterReturning(`{"body":"draft body","citations":[]}`, 0.02);
    const runner = createAgentRunner(providersFor("Architect", adapter));
    const result = await executeStage(
      { patchId: "p-1", companyId: "c-1", stage: PIPELINE.stages[0], attempt: 1, context: {} },
      { runner, costSoFar: 0, maxCostPerPatch: 5 },
    );
    expect(result.outcome.kind).toBe("pass");
    expect(result.cost).toBeCloseTo(0.02);
    expect(result.model).toBe("fake-model");
  });

  it("Critic REJECT propagates as a reject outcome", async () => {
    const adapter = adapterReturning(`{"decision":"REJECT","reason_code":"WEAK_DRAFT"}`);
    const runner = createAgentRunner(providersFor("Critic", adapter));
    const result = await executeStage(
      { patchId: "p-1", companyId: "c-1", stage: PIPELINE.stages[1], attempt: 1, context: {} },
      { runner, costSoFar: 0, maxCostPerPatch: 5 },
    );
    expect(result.outcome).toEqual({ kind: "reject", reasonCode: "WEAK_DRAFT" });
  });

  it("Bad output from a role surfaces as terminal_failure(BAD_OUTPUT) and is not retried", async () => {
    let calls = 0;
    const adapter: ModelAdapter = {
      async invoke() {
        calls += 1;
        return { text: "no json", cost: 0.01, promptTokens: 1, completionTokens: 1, modelUsed: "fake-model" };
      },
    };
    const runner = createAgentRunner(providersFor("Critic", adapter));
    const result = await executeStage(
      { patchId: "p-1", companyId: "c-1", stage: PIPELINE.stages[1], attempt: 1, context: {} },
      { runner, costSoFar: 0, maxCostPerPatch: 5 },
    );
    expect(calls).toBe(1);
    expect(result.outcome).toEqual({ kind: "terminal_failure", reasonCode: "BAD_OUTPUT" });
  });

  it("rejects a stage with no agent_role", async () => {
    const adapter = adapterReturning(`{}`);
    const runner = createAgentRunner(providersFor("Architect", adapter));
    const operatorStage = PIPELINE.stages[2]; // awaiting_signoff
    const result = await executeStage(
      { patchId: "p-1", companyId: "c-1", stage: operatorStage, attempt: 1, context: {} },
      { runner, costSoFar: 0, maxCostPerPatch: 5 },
    );
    expect(result.outcome).toEqual({ kind: "terminal_failure", reasonCode: "MISCONFIGURED_STAGE" });
  });

  it("rejects when loaded agent role does not match the stage", async () => {
    const adapter = adapterReturning(`{"body":"x"}`);
    const providers = providersFor("Critic", adapter); // returns Critic
    const runner = createAgentRunner(providers);
    const result = await executeStage(
      { patchId: "p-1", companyId: "c-1", stage: PIPELINE.stages[0], attempt: 1, context: {} }, // drafting needs Architect
      { runner, costSoFar: 0, maxCostPerPatch: 5 },
    );
    expect(result.outcome).toEqual({ kind: "terminal_failure", reasonCode: "AGENT_ROLE_MISMATCH" });
  });
});
