import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { companies, createDb, patches, pipelineAgents } from "@partyclipai/db";
import type { AgentConfig } from "@partyclipai/shared/types/agent-config";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { parsePipelineYaml } from "../services/pipelines/loader.js";
import { executeStage } from "../services/pipelines/executor.js";
import { ingestRoster } from "../services/agents/db-providers.js";
import { createAnthropicModelAdapter } from "../services/agents/live-model-adapter.js";
import { createLiveAgentRunner } from "../services/agents/live-runner.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

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
const DRAFTING = PIPELINE.stages[0]!;

function architectAgent(): AgentConfig {
  return {
    id: "architect",
    role: "Architect",
    activation_mode: "TRIGGER_ONLY",
    triggers: ["patch.drafting.requested"],
    persona_ref: "personas/architect.md",
    constitution_ref: "constitution/",
    model: "claude-opus-4-8",
    tools: [],
  };
}

/** A stub fetch that returns one canned Anthropic Messages response. */
function stubFetch(text: string) {
  return async () => ({
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({
      content: [{ type: "text", text }],
      usage: { input_tokens: 120, output_tokens: 40 },
      model: "claude-opus-4-8",
    }),
  });
}

describeEmbeddedPostgres("live agent runner (L4-A)", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("partyclip-live-runner-");
    db = createDb(tempDb.connectionString);
  }, 30_000);

  afterEach(async () => {
    await db.delete(pipelineAgents);
    await db.delete(patches);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("executeStage drives the live runner: real DB rows → model invocation → parsed outcome", async () => {
    // Fixture: a company with an Architect in the roster + a patch to draft.
    const companyId = await db
      .insert(companies)
      .values({ name: `Live ${randomUUID()}`, issuePrefix: `LV${randomUUID().slice(0, 6).toUpperCase()}` })
      .returning()
      .then((r) => r[0]!.id);
    await ingestRoster(db, companyId, [{ config: architectAgent(), persona: "You draft policy patches." }]);
    const patch = await db
      .insert(patches)
      .values({ companyId, title: "Lower transit fares", body: "Reduce peak fares." })
      .returning()
      .then((r) => r[0]!);

    // The Architect role contract is { body, citations? }; the stub model returns that JSON.
    const modelOutput = JSON.stringify({
      body: "We propose lowering peak transit fares by 20%.",
      citations: [{ stable_id: "CONST-K1-A1", relevance: "supports" }],
    });
    const runner = createLiveAgentRunner({
      db,
      companyId,
      modelAdapter: createAnthropicModelAdapter({ apiKey: "sk-test", fetchImpl: stubFetch(modelOutput) }),
    });

    const result = await executeStage(
      { patchId: patch.id, companyId, stage: DRAFTING, attempt: 1, context: {} },
      { runner, costSoFar: 0, maxCostPerPatch: 1 },
    );

    expect(result.outcome.kind).toBe("pass");
    expect(result.model).toBe("claude-opus-4-8");
    // opus pricing on 120 in / 40 out: (120*15 + 40*75)/1e6 = 0.0048
    expect(result.cost).toBeCloseTo(0.0048, 6);
    expect(result.output).toMatchObject({
      body: "We propose lowering peak transit fares by 20%.",
      model_used: "claude-opus-4-8",
      attempt: 1,
      prompt_tokens: 120,
      completion_tokens: 40,
    });
  });

  it("surfaces a misconfigured agent (role not in the roster) as a terminal failure", async () => {
    const companyId = await db
      .insert(companies)
      .values({ name: `Live ${randomUUID()}`, issuePrefix: `LV${randomUUID().slice(0, 6).toUpperCase()}` })
      .returning()
      .then((r) => r[0]!.id);
    const patch = await db.insert(patches).values({ companyId, title: "x" }).returning().then((r) => r[0]!);
    // No roster ingested → loadAgent throws AGENT_NOT_CONFIGURED (terminal).
    const runner = createLiveAgentRunner({
      db,
      companyId,
      modelAdapter: createAnthropicModelAdapter({ apiKey: "k", fetchImpl: stubFetch("{}") }),
    });
    const result = await executeStage(
      { patchId: patch.id, companyId, stage: DRAFTING, attempt: 1, context: {} },
      { runner, costSoFar: 0, maxCostPerPatch: 1 },
    );
    expect(result.outcome.kind).toBe("terminal_failure");
  });
});
