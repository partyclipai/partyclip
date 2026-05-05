import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { patches } from "./patches.js";

export const operatorActions = pgTable(
  "operator_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    patchId: uuid("patch_id").references(() => patches.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    operatorUserId: text("operator_user_id").notNull(),
    rationale: text("rationale").notNull(),
    visibilityClass: text("visibility_class").notNull().default("PUBLIC"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    patchIdx: index("operator_actions_patch_idx").on(table.patchId),
    companyActionIdx: index("operator_actions_company_action_idx").on(table.companyId, table.action),
  }),
);
