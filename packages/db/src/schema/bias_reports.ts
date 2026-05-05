import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { patches } from "./patches.js";
import { patchStageRuns } from "./patch_stage_runs.js";

export const biasReports = pgTable(
  "bias_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    patchId: uuid("patch_id").notNull().references(() => patches.id, { onDelete: "cascade" }),
    stageRunId: uuid("stage_run_id").notNull().references(() => patchStageRuns.id, { onDelete: "cascade" }),
    overallDecision: text("overall_decision").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    patchIdx: index("bias_reports_patch_idx").on(table.patchId),
    stageRunIdx: index("bias_reports_stage_run_idx").on(table.stageRunId),
  }),
);
