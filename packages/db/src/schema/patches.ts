import { pgTable, uuid, text, jsonb, numeric, timestamp, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export type PatchCitation = {
  stable_id: string;
  relevance: "supporting" | "tension" | "opposing";
};

export const patches = pgTable(
  "patches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    title: text("title").notNull(),
    classification: text("classification").notNull().default("REGULAR"),
    state: text("state").notNull().default("DRAFTING"),
    body: text("body").notNull().default(""),
    citations: jsonb("citations").$type<PatchCitation[]>().notNull().default([] as unknown as PatchCitation[]),
    parentPatchId: uuid("parent_patch_id").references((): AnyPgColumn => patches.id),
    repealedBy: uuid("repealed_by").references((): AnyPgColumn => patches.id),
    pipelineId: text("pipeline_id"),
    costTotal: numeric("cost_total", { precision: 18, scale: 6 }).notNull().default("0"),
    createdByAgentId: uuid("created_by_agent_id").references(() => agents.id),
    createdByUserId: text("created_by_user_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    repealedAt: timestamp("repealed_at", { withTimezone: true }),
    killedAt: timestamp("killed_at", { withTimezone: true }),
    killReasonCode: text("kill_reason_code"),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyStateIdx: index("patches_company_state_idx").on(table.companyId, table.state),
    companyClassIdx: index("patches_company_classification_idx").on(table.companyId, table.classification),
    parentIdx: index("patches_parent_idx").on(table.parentPatchId),
  }),
);
