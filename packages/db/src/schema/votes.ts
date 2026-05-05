import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { patches } from "./patches.js";
import { artifacts } from "./artifacts.js";

export const votes = pgTable(
  "votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    patchId: uuid("patch_id").notNull().references(() => patches.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id"),
    voterRole: text("voter_role").notNull(),
    vote: text("vote").notNull(),
    weight: integer("weight").notNull().default(1),
    rationaleArtifactId: uuid("rationale_artifact_id").references(() => artifacts.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    patchIdx: index("votes_patch_idx").on(table.patchId),
    sessionIdx: index("votes_session_idx").on(table.sessionId),
  }),
);
