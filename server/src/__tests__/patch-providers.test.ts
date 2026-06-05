import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { artifacts, companies, createDb, patches, patchStageRuns } from "@partyclipai/db";
import type { AgentConfig } from "@partyclipai/shared/types/agent-config";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { createDbPatchProviders } from "../services/agents/patch-providers.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

function agentWithTools(tools: string[]): AgentConfig {
  return {
    id: "executor",
    role: "Executor",
    activation_mode: "TRIGGER_ONLY",
    triggers: ["patch.executor.requested"],
    persona_ref: "personas/executor.md",
    constitution_ref: "constitution/",
    model: "claude-opus-4-8",
    tools,
  };
}

describeEmbeddedPostgres("DB patch providers (L4-A)", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("partyclip-patch-providers-");
    db = createDb(tempDb.connectionString);
  }, 30_000);

  afterEach(async () => {
    await db.delete(patchStageRuns);
    await db.delete(artifacts);
    await db.delete(patches);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function makeCompany(): Promise<string> {
    const row = await db
      .insert(companies)
      .values({ name: `Patch Providers ${randomUUID()}`, issuePrefix: `PP${randomUUID().slice(0, 6).toUpperCase()}` })
      .returning()
      .then((r) => r[0]!);
    return row.id;
  }

  it("loadPatch returns a PatchView for the company's patch", async () => {
    const companyId = await makeCompany();
    const patch = await db
      .insert(patches)
      .values({
        companyId,
        title: "Lower transit fares",
        classification: "REGULAR",
        body: "Reduce peak fares by 20%.",
        citations: [{ stable_id: "CONST-K1-A1", relevance: "supports" }] as never,
      })
      .returning()
      .then((r) => r[0]!);

    const view = await createDbPatchProviders(db).loadPatch(patch.id, companyId);
    expect(view).toMatchObject({
      id: patch.id,
      title: "Lower transit fares",
      classification: "REGULAR",
      body: "Reduce peak fares by 20%.",
    });
    expect(view.citations).toEqual([{ stable_id: "CONST-K1-A1", relevance: "supports" }]);
  });

  it("loadPatch throws PATCH_NOT_FOUND for an unknown / cross-company patch", async () => {
    const companyId = await makeCompany();
    const other = await makeCompany();
    const patch = await db.insert(patches).values({ companyId, title: "x" }).returning().then((r) => r[0]!);
    const providers = createDbPatchProviders(db);
    await expect(providers.loadPatch(patch.id, other)).rejects.toThrow(/not found/i);
  });

  it("loadInputArtifacts returns prior finished stages' outputs, excluding the current stage", async () => {
    const companyId = await makeCompany();
    const patch = await db.insert(patches).values({ companyId, title: "p" }).returning().then((r) => r[0]!);

    const draftOut = await db
      .insert(artifacts)
      .values({ companyId, kind: "draft", contentText: "draft body" })
      .returning()
      .then((r) => r[0]!);
    const critiqueOut = await db
      .insert(artifacts)
      .values({ companyId, kind: "critique", contentText: "critique notes" })
      .returning()
      .then((r) => r[0]!);

    await db.insert(patchStageRuns).values([
      { companyId, patchId: patch.id, stage: "drafting", agentRole: "Architect", outputArtifactId: draftOut.id, finishedAt: new Date() },
      { companyId, patchId: patch.id, stage: "critique", agentRole: "Critic", outputArtifactId: critiqueOut.id, finishedAt: new Date() },
    ]);

    const providers = createDbPatchProviders(db);

    // The executor stage sees both prior outputs.
    const forExecutor = await providers.loadInputArtifacts({ patchId: patch.id, companyId, stage: "executor" });
    expect(forExecutor.map((a) => a.kind).sort()).toEqual(["critique", "draft"]);

    // Re-running critique must NOT receive its own prior output — only the draft.
    const forCritique = await providers.loadInputArtifacts({ patchId: patch.id, companyId, stage: "critique" });
    expect(forCritique.map((a) => a.kind)).toEqual(["draft"]);
  });

  it("loadInputArtifacts returns [] when no prior finished stage produced output", async () => {
    const companyId = await makeCompany();
    const patch = await db.insert(patches).values({ companyId, title: "p" }).returning().then((r) => r[0]!);
    // an unfinished run (no finishedAt) must be ignored
    await db.insert(patchStageRuns).values({ companyId, patchId: patch.id, stage: "drafting", agentRole: "Architect" });
    const out = await createDbPatchProviders(db).loadInputArtifacts({ patchId: patch.id, companyId, stage: "drafting" });
    expect(out).toEqual([]);
  });

  it("resolveToolset maps granted tool names to AgentTools whose invoke is a not-implemented stub", async () => {
    const toolset = await createDbPatchProviders(db).resolveToolset(agentWithTools(["search", "fetch"]));
    expect(toolset.map((t) => t.name)).toEqual(["search", "fetch"]);
    await expect(toolset[0]!.invoke({})).rejects.toThrow(/no Phase-1 executable binding/);
  });

  it("resolveToolset returns [] for an agent granted no tools", async () => {
    const toolset = await createDbPatchProviders(db).resolveToolset(agentWithTools([]));
    expect(toolset).toEqual([]);
  });
});
