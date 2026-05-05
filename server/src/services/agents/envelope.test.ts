import { describe, expect, it } from "vitest";
import { agentConfigSchema } from "@partyclipai/shared/types/agent-config";
import {
  buildAgentEnvelope,
  EnvelopeViolationError,
  type AgentTool,
  type ConstitutionArticleRef,
  type InputArtifact,
  type PatchView,
} from "./envelope.js";

const AGENT = agentConfigSchema.parse({
  id: "architect-default",
  role: "Architect",
  activation_mode: "TRIGGER_ONLY",
  persona_ref: "agents/architect.md",
  constitution_ref: "constitution/",
  model: "claude-opus-4-7",
  triggers: ["patch.stage.completed"],
  tools: ["search_constitution"],
  model_overrides: { drafting: "claude-sonnet-4-6" },
});

const CONSTITUTION: ConstitutionArticleRef[] = [
  { stableId: "CONST-K1-A1", version: 1, title: "Founding", body: "We the party..." },
];

const PATCH: PatchView = {
  id: "p-1",
  title: "Test patch",
  classification: "REGULAR",
  body: "Initial body",
  citations: [],
};

const TOOL: AgentTool = {
  name: "search_constitution",
  description: "Lookup an article",
  invoke: async () => ({}),
};

describe("buildAgentEnvelope", () => {
  it("composes the envelope and resolves model overrides", () => {
    const env = buildAgentEnvelope({
      agent: AGENT,
      stage: "drafting",
      persona: "You are an Architect.",
      constitution: CONSTITUTION,
      patch: PATCH,
      inputArtifacts: [],
      toolset: [TOOL],
    });
    expect(env.role).toBe("Architect");
    expect(env.stage).toBe("drafting");
    expect(env.model).toBe("claude-sonnet-4-6");
    expect(env.tools).toHaveLength(1);
  });

  it("rejects tools that were not granted to the agent", () => {
    const ungranted: AgentTool = { name: "delete_constitution", description: "x", invoke: async () => ({}) };
    expect(() =>
      buildAgentEnvelope({
        agent: AGENT,
        stage: "drafting",
        persona: "p",
        constitution: CONSTITUTION,
        patch: PATCH,
        inputArtifacts: [],
        toolset: [ungranted],
      }),
    ).toThrow(EnvelopeViolationError);
  });

  it("rejects forbidden tool names even if granted", () => {
    const forbiddenAgent = agentConfigSchema.parse({ ...AGENT, tools: ["deployment"] });
    const tool: AgentTool = { name: "deployment", description: "x", invoke: async () => ({}) };
    expect(() =>
      buildAgentEnvelope({
        agent: forbiddenAgent,
        stage: "drafting",
        persona: "p",
        constitution: CONSTITUTION,
        patch: PATCH,
        inputArtifacts: [],
        toolset: [tool],
      }),
    ).toThrow(EnvelopeViolationError);
  });

  it("rejects forbidden artifact kinds", () => {
    const bad: InputArtifact = { id: "a-1", kind: "raw_forum", contentText: "user post", content: null };
    expect(() =>
      buildAgentEnvelope({
        agent: AGENT,
        stage: "drafting",
        persona: "p",
        constitution: CONSTITUTION,
        patch: PATCH,
        inputArtifacts: [bad],
        toolset: [],
      }),
    ).toThrow(EnvelopeViolationError);
  });

  it("does not leak fields beyond the declared envelope", () => {
    const env = buildAgentEnvelope({
      agent: AGENT,
      stage: "drafting",
      persona: "p",
      constitution: CONSTITUTION,
      patch: PATCH,
      inputArtifacts: [],
      toolset: [],
    });
    const allowed = new Set([
      "role",
      "stage",
      "model",
      "persona",
      "constitution",
      "patch",
      "inputArtifacts",
      "tools",
    ]);
    for (const key of Object.keys(env)) {
      expect(allowed.has(key)).toBe(true);
    }
  });
});
