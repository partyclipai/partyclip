import { pgTable, uuid, text, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const citizens = pgTable(
  "citizens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    providerSub: text("provider_sub").notNull(),
    email: text("email"),
    handle: text("handle"),
    tier: text("tier").notNull().default("FREE"),
    badges: jsonb("badges").$type<string[]>().notNull().default([] as unknown as string[]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerUq: uniqueIndex("citizens_company_provider_sub_uq").on(table.companyId, table.providerSub),
    handleIdx: index("citizens_company_handle_idx").on(table.companyId, table.handle),
  }),
);
