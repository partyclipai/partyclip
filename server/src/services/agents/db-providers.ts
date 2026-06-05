import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "@partyclipai/db";
import { constitutionArticles, pipelineAgents } from "@partyclipai/db";
import { agentConfigSchema, type AgentConfig } from "@partyclipai/shared/types/agent-config";
import type { AgentRole } from "@partyclipai/shared/types/agent-role";
import { TerminalPipelineError } from "../pipelines/errors.js";
import type { ConstitutionArticleRef } from "./envelope.js";
import type { LoadedRosterAgent } from "./roster-loader.js";

/**
 * DB-backed AgentRunnerProviders for the partyclip pipeline (ADR-005 / L4-E).
 * Provides the roster/persona/constitution loaders that read from `pipeline_agents`
 * and `constitution_articles`; L4-A composes these with loadPatch / loadInputArtifacts /
 * resolveToolset + a model adapter to build the full AgentRunnerProviders.
 */

/** Upsert a loaded roster into `pipeline_agents` (one row per company + role). */
export async function ingestRoster(
  db: Db,
  companyId: string,
  roster: ReadonlyArray<LoadedRosterAgent>,
): Promise<void> {
  for (const { config, persona } of roster) {
    await db
      .insert(pipelineAgents)
      .values({ companyId, role: config.role, config, persona })
      .onConflictDoUpdate({
        target: [pipelineAgents.companyId, pipelineAgents.role],
        set: { config, persona, updatedAt: new Date() },
      });
  }
}

/** The subset of AgentRunnerProviders that L4-E owns (DB-backed). */
export interface DbRosterProviders {
  loadAgent(role: AgentRole, companyId: string): Promise<AgentConfig>;
  loadPersona(agent: AgentConfig): Promise<string>;
  loadConstitution(companyId: string): Promise<ReadonlyArray<ConstitutionArticleRef>>;
}

/**
 * Build the DB-backed roster providers for one company. `companyId` is closed over so
 * `loadPersona(agent)` — whose signature carries no company — resolves the persona for the
 * right company (roles are unique per company). `loadAgent`/`loadConstitution` also receive
 * the company via their own params (the runner passes the same value).
 */
export function createDbRosterProviders(db: Db, companyId: string): DbRosterProviders {
  return {
    async loadAgent(role, callerCompanyId) {
      const cid = callerCompanyId ?? companyId;
      const rows = await db
        .select({ config: pipelineAgents.config })
        .from(pipelineAgents)
        .where(and(eq(pipelineAgents.companyId, cid), eq(pipelineAgents.role, role)))
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new TerminalPipelineError(
          `No pipeline agent configured for role '${role}' (company ${cid}); run the content-load step`,
          "AGENT_NOT_CONFIGURED",
        );
      }
      const parsed = agentConfigSchema.safeParse(row.config);
      if (!parsed.success) {
        throw new TerminalPipelineError(
          `Stored agent config for role '${role}' is invalid: ${parsed.error.issues[0]?.message ?? "unknown"}`,
          "AGENT_CONFIG_INVALID",
        );
      }
      return parsed.data;
    },

    async loadPersona(agent) {
      const rows = await db
        .select({ persona: pipelineAgents.persona })
        .from(pipelineAgents)
        .where(and(eq(pipelineAgents.companyId, companyId), eq(pipelineAgents.role, agent.role)))
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new TerminalPipelineError(
          `No persona stored for role '${agent.role}' (company ${companyId})`,
          "PERSONA_NOT_CONFIGURED",
        );
      }
      return row.persona;
    },

    async loadConstitution(callerCompanyId) {
      const cid = callerCompanyId ?? companyId;
      const rows = await db
        .select({
          stableId: constitutionArticles.stableId,
          version: constitutionArticles.version,
          title: constitutionArticles.title,
          body: constitutionArticles.body,
        })
        .from(constitutionArticles)
        .where(and(eq(constitutionArticles.companyId, cid), isNull(constitutionArticles.supersededBy)))
        .orderBy(asc(constitutionArticles.stableId), asc(constitutionArticles.version));
      return rows.map((r): ConstitutionArticleRef => ({
        stableId: r.stableId,
        version: r.version,
        title: r.title,
        body: r.body,
      }));
    },
  };
}
