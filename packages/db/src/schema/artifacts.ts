import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    kind: text("kind").notNull(),
    content: jsonb("content").$type<unknown>(),
    contentText: text("content_text"),
    producerRunId: uuid("producer_run_id"),
    visibilityClass: text("visibility_class").notNull().default("OPERATOR_ONLY"),
    delayUntil: timestamp("delay_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyKindIdx: index("artifacts_company_kind_idx").on(table.companyId, table.kind),
    producerIdx: index("artifacts_producer_run_idx").on(table.producerRunId),
    visibilityIdx: index("artifacts_visibility_idx").on(table.visibilityClass),
  }),
);
