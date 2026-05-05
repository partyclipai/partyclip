import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { patches } from "./patches.js";

export const pressReleases = pgTable(
  "press_releases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    patchId: uuid("patch_id").notNull().references(() => patches.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    translations: jsonb("translations").$type<Record<string, string>>().notNull().default({} as Record<string, string>),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    patchIdx: index("press_releases_patch_idx").on(table.patchId),
    companyIdx: index("press_releases_company_idx").on(table.companyId),
  }),
);
