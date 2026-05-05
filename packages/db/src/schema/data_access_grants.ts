import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const dataAccessGrants = pgTable(
  "data_access_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    requester: text("requester").notNull(),
    purpose: text("purpose").notNull(),
    scope: text("scope").notNull(),
    approvedByUserId: text("approved_by_user_id"),
    auditLogRef: uuid("audit_log_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("data_access_grants_company_idx").on(table.companyId),
  }),
);
