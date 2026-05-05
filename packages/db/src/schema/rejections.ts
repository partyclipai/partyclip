import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { patches } from "./patches.js";
import { artifacts } from "./artifacts.js";

export const rejections = pgTable(
  "rejections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    patchId: uuid("patch_id").notNull().references(() => patches.id, { onDelete: "cascade" }),
    fromStage: text("from_stage").notNull(),
    reasonCode: text("reason_code").notNull(),
    detailsArtifactId: uuid("details_artifact_id").references(() => artifacts.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    patchIdx: index("rejections_patch_idx").on(table.patchId),
    companyIdx: index("rejections_company_idx").on(table.companyId),
  }),
);
