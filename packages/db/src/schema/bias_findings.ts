import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { biasReports } from "./bias_reports.js";

export const biasFindings = pgTable(
  "bias_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    reportId: uuid("report_id").notNull().references(() => biasReports.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    severity: text("severity").notNull(),
    quote: text("quote").notNull().default(""),
    explanation: text("explanation").notNull().default(""),
    suggestion: text("suggestion").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    reportIdx: index("bias_findings_report_idx").on(table.reportId),
    categoryIdx: index("bias_findings_category_idx").on(table.category),
  }),
);
