import { pgTable, uuid, text, jsonb, numeric, integer, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { patches } from "./patches.js";
import { agents } from "./agents.js";
import { artifacts } from "./artifacts.js";

export const patchStageRuns = pgTable(
  "patch_stage_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    patchId: uuid("patch_id").notNull().references(() => patches.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    agentRole: text("agent_role").notNull(),
    agentId: uuid("agent_id").references(() => agents.id),
    model: text("model"),
    inputArtifactIds: jsonb("input_artifact_ids").$type<string[]>().notNull().default([] as unknown as string[]),
    outputArtifactId: uuid("output_artifact_id").references(() => artifacts.id, { onDelete: "set null" }),
    decision: text("decision"),
    reasonCode: text("reason_code"),
    cost: numeric("cost", { precision: 18, scale: 6 }).notNull().default("0"),
    durationMs: integer("duration_ms"),
    attempt: integer("attempt").notNull().default(1),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    patchIdx: index("patch_stage_runs_patch_idx").on(table.patchId),
    patchStageIdx: index("patch_stage_runs_patch_stage_idx").on(table.patchId, table.stage),
    companyStageIdx: index("patch_stage_runs_company_stage_idx").on(table.companyId, table.stage),
  }),
);
