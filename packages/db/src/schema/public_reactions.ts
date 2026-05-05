import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { citizens } from "./citizens.js";

export const publicReactions = pgTable(
  "public_reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    kind: text("kind").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    citizenId: uuid("citizen_id").references(() => citizens.id, { onDelete: "set null" }),
    body: text("body"),
    value: text("value"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    targetIdx: index("public_reactions_target_idx").on(table.targetType, table.targetId),
    companyKindIdx: index("public_reactions_company_kind_idx").on(table.companyId, table.kind),
  }),
);
