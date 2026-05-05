import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const revenueStreams = pgTable(
  "revenue_streams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    processor: text("processor").notNull(),
    kind: text("kind").notNull(),
    transparencyLevel: text("transparency_level").notNull().default("FULLY_PUBLIC"),
    transparencyReason: text("transparency_reason"),
    earmarkTargetId: uuid("earmark_target_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyProcessorIdx: index("revenue_streams_company_processor_idx").on(table.companyId, table.processor),
  }),
);
