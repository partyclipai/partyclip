import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "@partyclipai/db";
import { constitutionArticles, pipelineAgents } from "@partyclipai/db";
import { agentConfigSchema, type AgentConfig } from "@partyclipai/shared/types/agent-config";
import type { AgentRole } from "@partyclipai/shared/types/agent-role";
import type { ConstitutionArticleInput } from "@partyclipai/shared/validators/constitution-article";
import { TerminalPipelineError } from "../pipelines/errors.js";
import type { ConstitutionArticleRef } from "./envelope.js";
import type { LoadedRosterAgent } from "./roster-loader.js";

/**
 * DB-backed AgentRunnerProviders for the partyclip pipeline (ADR-005 / L4-E).
 * Provides the roster/persona/constitution loaders that read from `pipeline_agents`
 * and `constitution_articles`; L4-A composes these with loadPatch / loadInputArtifacts /
 * resolveToolset + a model adapter to build the full AgentRunnerProviders.
 */

/** A `Db` or a transaction handle from `db.transaction(...)` — both accept the write builder. */
type DbWriter = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Upsert a loaded roster into `pipeline_agents` (one row per company + role). */
export async function ingestRoster(
  db: DbWriter,
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

/** Upsert constitution articles into `constitution_articles` (keyed company+stableId+version). */
export async function ingestConstitution(
  db: DbWriter,
  companyId: string,
  articles: ReadonlyArray<ConstitutionArticleInput>,
): Promise<void> {
  for (const a of articles) {
    await db
      .insert(constitutionArticles)
      .values({
        companyId,
        stableId: a.stable_id,
        version: a.version,
        mutability: a.mutability,
        title: a.title,
        body: a.body,
      })
      .onConflictDoUpdate({
        target: [constitutionArticles.companyId, constitutionArticles.stableId, constitutionArticles.version],
        set: { mutability: a.mutability, title: a.title, body: a.body, updatedAt: new Date() },
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
 * Build the DB-backed roster providers for one company. `companyId` is the single source of
 * truth — it is closed over so `loadPersona(agent)` (whose signature carries no company) stays
 * consistent with `loadAgent`/`loadConstitution`. The latter two still accept a company param to
 * satisfy the AgentRunnerProviders interface; if a caller passes a *different* company than the
 * one the provider was built for, that is a wiring bug and we fail loudly rather than silently
 * pairing an agent from one company with a persona from another.
 */
export function createDbRosterProviders(db: Db, companyId: string): DbRosterProviders {
  const assertSameCompany = (caller: string | undefined): void => {
    if (caller && caller !== companyId) {
      throw new TerminalPipelineError(
        `Provider company mismatch: built for ${companyId} but called with ${caller}`,
        "COMPANY_MISMATCH",
      );
    }
  };
  return {
    async loadAgent(role, callerCompanyId) {
      assertSameCompany(callerCompanyId);
      const rows = await db
        .select({ config: pipelineAgents.config })
        .from(pipelineAgents)
        .where(and(eq(pipelineAgents.companyId, companyId), eq(pipelineAgents.role, role)))
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new TerminalPipelineError(
          `No pipeline agent configured for role '${role}' (company ${companyId}); run the content-load step`,
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
      assertSameCompany(callerCompanyId);
      const rows = await db
        .select({
          stableId: constitutionArticles.stableId,
          version: constitutionArticles.version,
          title: constitutionArticles.title,
          body: constitutionArticles.body,
        })
        .from(constitutionArticles)
        .where(and(eq(constitutionArticles.companyId, companyId), isNull(constitutionArticles.supersededBy)))
        .orderBy(asc(constitutionArticles.stableId), asc(constitutionArticles.version));
      // Collapse to the latest version per stableId. A content-load re-sync that bumps an
      // article's version inserts a new row without superseding the old one, so multiple
      // non-superseded versions of the same stableId can coexist; the envelope must see only
      // the latest. Rows are ordered by (stableId, version asc), so the last write per
      // stableId wins, and the Map preserves first-seen stableId order.
      const latest = new Map<string, ConstitutionArticleRef>();
      for (const r of rows) {
        latest.set(r.stableId, { stableId: r.stableId, version: r.version, title: r.title, body: r.body });
      }
      return [...latest.values()];
    },
  };
}
