import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { patches } from "./patches.js";
import { agents } from "./agents.js";

export const dissents = pgTable(
  "dissents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    patchId: uuid("patch_id").notNull().references(() => patches.id, { onDelete: "cascade" }),
    filedByRole: text("filed_by_role").notNull(),
    filedByAgentId: uuid("filed_by_agent_id").references(() => agents.id),
    filedAtStage: text("filed_at_stage").notNull(),
    body: text("body").notNull(),
    published: boolean("published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    patchIdx: index("dissents_patch_idx").on(table.patchId),
    companyIdx: index("dissents_company_idx").on(table.companyId),
  }),
);
