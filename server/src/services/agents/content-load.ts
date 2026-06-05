import type { Db } from "@partyclipai/db";
import { loadRosterFromDirectory } from "./roster-loader.js";
import { loadConstitutionFromDirectory } from "./constitution-loader.js";
import { ingestConstitution, ingestRoster } from "./db-providers.js";

/**
 * Loads a deployment's content pack (agent roster + personas + constitution) from
 * the content directory into the DB for one company (ADR-005 / L4-E). This is the
 * step a deployment runs at onboarding / company import, and re-runs to re-sync
 * after editing the content repo. Pipelines are loaded separately by the pipeline
 * loader (server/src/services/pipelines/loader.ts).
 */

export interface ContentLoadResult {
  readonly agents: number;
  readonly constitutionArticles: number;
}

export async function loadDeploymentContent(
  db: Db,
  companyId: string,
  contentDir: string,
): Promise<ContentLoadResult> {
  // Read + validate everything first so a malformed content pack fails before any write.
  const roster = await loadRosterFromDirectory(contentDir);
  const articles = await loadConstitutionFromDirectory(contentDir);

  // Ingest atomically: either the whole pack lands or none of it does.
  await db.transaction(async (tx) => {
    await ingestRoster(tx, companyId, roster);
    await ingestConstitution(tx, companyId, articles);
  });

  return { agents: roster.length, constitutionArticles: articles.length };
}
