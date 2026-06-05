import { pgTable, uuid, text, jsonb, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * partyclip pipeline-agent roster, loaded from the deployment content repo
 * (`regular.yaml` + persona files) into the DB by the content-load step
 * (see ADR-005). One row per (company, pipeline role). The runtime
 * AgentRunnerProviders read agents and personas from here, not from the
 * paperclip-inherited `agents` table.
 *
 * `config` holds the validated partyclip AgentConfig object (shape lives in
 * @partyclipai/shared agentConfigSchema — kept as jsonb so the db package
 * stays at the bottom of the db → shared → server contract chain). `persona`
 * is the persona file's text, resolved from `config.persona_ref` at load time
 * so the runtime has no dependency on the content directory.
 */
export const pipelineAgents = pgTable(
  "pipeline_agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    role: text("role").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    persona: text("persona").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyRoleUq: uniqueIndex("pipeline_agents_company_role_uq").on(table.companyId, table.role),
    companyIdx: index("pipeline_agents_company_idx").on(table.companyId),
  }),
);
