import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { companies, constitutionArticles, createDb, pipelineAgents } from "@partyclipai/db";
import type { AgentConfig } from "@partyclipai/shared/types/agent-config";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { createDbRosterProviders, ingestRoster } from "../services/agents/db-providers.js";
import { loadDeploymentContent } from "../services/agents/content-load.js";
import type { LoadedRosterAgent } from "../services/agents/roster-loader.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

function architectConfig(): AgentConfig {
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

describeEmbeddedPostgres("pipeline agent DB providers (L4-E)", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("partyclip-pipeline-agents-");
    db = createDb(tempDb.connectionString);
  }, 30_000);

  afterEach(async () => {
    await db.delete(pipelineAgents);
    await db.delete(constitutionArticles);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  async function makeCompany(): Promise<string> {
    const row = await db
      .insert(companies)
      .values({
        name: `Pipeline Agents ${randomUUID()}`,
        issuePrefix: `PA${randomUUID().slice(0, 6).toUpperCase()}`,
      })
      .returning()
      .then((rows) => rows[0]!);
    return row.id;
  }

  it("ingests a roster and loads the agent + persona back from the DB", async () => {
    const companyId = await makeCompany();
    const roster: LoadedRosterAgent[] = [
      { config: architectConfig(), persona: "You design patches." },
    ];
    await ingestRoster(db, companyId, roster);

    const providers = createDbRosterProviders(db, companyId);
    const agent = await providers.loadAgent("Architect", companyId);
    expect(agent.id).toBe("architect");
    expect(agent.model).toBe("claude-opus-4-8");

    const persona = await providers.loadPersona(agent);
    expect(persona).toBe("You design patches.");
  });

  it("upserts on re-ingest (one row per company+role, latest values win)", async () => {
    const companyId = await makeCompany();
    await ingestRoster(db, companyId, [
      { config: architectConfig(), persona: "v1" },
    ]);
    await ingestRoster(db, companyId, [
      { config: { ...architectConfig(), model: "claude-opus-4-7" }, persona: "v2" },
    ]);

    const rows = await db.select().from(pipelineAgents);
    expect(rows).toHaveLength(1);

    const providers = createDbRosterProviders(db, companyId);
    const agent = await providers.loadAgent("Architect", companyId);
    expect(agent.model).toBe("claude-opus-4-7");
    expect(await providers.loadPersona(agent)).toBe("v2");
  });

  it("throws AGENT_NOT_CONFIGURED for an unknown role", async () => {
    const companyId = await makeCompany();
    const providers = createDbRosterProviders(db, companyId);
    await expect(providers.loadAgent("Critic", companyId)).rejects.toThrow(/No pipeline agent configured/);
  });

  it("loadConstitution returns only the latest (non-superseded) articles, ordered", async () => {
    const companyId = await makeCompany();
    // two live articles + one superseded
    const live = await db
      .insert(constitutionArticles)
      .values({ companyId, stableId: "ART-1", version: 2, mutability: "amendable", title: "First", body: "b1" })
      .returning()
      .then((r) => r[0]!);
    await db
      .insert(constitutionArticles)
      .values({ companyId, stableId: "ART-2", version: 1, mutability: "amendable", title: "Second", body: "b2" });
    // a superseded older version of ART-1 (must be filtered out)
    await db
      .insert(constitutionArticles)
      .values({ companyId, stableId: "ART-1", version: 1, mutability: "amendable", title: "First old", body: "old", supersededBy: live.id });

    const providers = createDbRosterProviders(db, companyId);
    const articles = await providers.loadConstitution(companyId);
    expect(articles.map((a) => `${a.stableId}@${a.version}`)).toEqual(["ART-1@2", "ART-2@1"]);
    expect(articles.find((a) => a.body === "old")).toBeUndefined();
  });

  it("isolates roster rows by company", async () => {
    const companyA = await makeCompany();
    const companyB = await makeCompany();
    await ingestRoster(db, companyA, [{ config: architectConfig(), persona: "A persona" }]);

    const providersB = createDbRosterProviders(db, companyB);
    await expect(providersB.loadAgent("Architect", companyB)).rejects.toThrow(/No pipeline agent configured/);
  });

  it("loadDeploymentContent ingests roster + constitution from a content dir end to end", async () => {
    const companyId = await makeCompany();
    const contentDir = await fs.mkdtemp(path.join(os.tmpdir(), "partyclip-content-"));
    try {
      await fs.mkdir(path.join(contentDir, "personas"), { recursive: true });
      await fs.writeFile(
        path.join(contentDir, "regular.yaml"),
        `
agents:
  - id: architect
    role: Architect
    activation_mode: TRIGGER_ONLY
    triggers: ["patch.drafting.requested"]
    persona_ref: personas/architect.md
    model: claude-opus-4-8
`,
        "utf8",
      );
      await fs.writeFile(path.join(contentDir, "personas", "architect.md"), "You design patches.", "utf8");
      await fs.writeFile(
        path.join(contentDir, "constitution.yaml"),
        `
articles:
  - stable_id: CONST-K1-A1
    mutability: IMMUTABLE
    title: Purpose
    body: We publish auditable policy.
`,
        "utf8",
      );

      const result = await loadDeploymentContent(db, companyId, contentDir);
      expect(result).toEqual({ agents: 1, constitutionArticles: 1 });

      const providers = createDbRosterProviders(db, companyId);
      const agent = await providers.loadAgent("Architect", companyId);
      expect(agent.id).toBe("architect");
      expect(await providers.loadPersona(agent)).toBe("You design patches.");
      const articles = await providers.loadConstitution(companyId);
      expect(articles.map((a) => a.stableId)).toEqual(["CONST-K1-A1"]);
    } finally {
      await fs.rm(contentDir, { recursive: true, force: true });
    }
  });
});
