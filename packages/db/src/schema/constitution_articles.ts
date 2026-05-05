import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { type AnyPgColumn } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const constitutionArticles = pgTable(
  "constitution_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    stableId: text("stable_id").notNull(),
    version: integer("version").notNull().default(1),
    mutability: text("mutability").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    supersededBy: uuid("superseded_by").references((): AnyPgColumn => constitutionArticles.id),
    createdByUserId: text("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStableUq: uniqueIndex("constitution_articles_company_stable_version_uq").on(
      table.companyId,
      table.stableId,
      table.version,
    ),
    companyIdx: index("constitution_articles_company_idx").on(table.companyId),
  }),
);
