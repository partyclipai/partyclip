import pc from "picocolors";
import { createDb } from "@partyclipai/db";
import { loadDeploymentContent } from "@partyclipai/server/services/agents";
import { readConfig } from "../config/store.js";

type ContentLoadOptions = {
  config?: string;
  companyId?: string;
  contentDir?: string;
  json?: boolean;
};

function resolveConnectionString(configPath?: string): string {
  const envUrl = process.env.DATABASE_URL?.trim();
  if (envUrl) return envUrl;
  const config = readConfig(configPath);
  if (config?.database.mode === "postgres" && config.database.connectionString?.trim()) {
    return config.database.connectionString.trim();
  }
  const port = config?.database.embeddedPostgresPort ?? 54329;
  return `postgres://partyclip:partyclip@127.0.0.1:${port}/partyclip`;
}

/**
 * Loads (or re-syncs) a deployment's content pack — agent roster, personas, and
 * constitution — from the content directory into the DB for one company (ADR-005 /
 * L4-E). Re-runnable: it upserts, so editing the content repo and re-running
 * brings the DB into line.
 */
export async function contentLoadCommand(opts: ContentLoadOptions): Promise<void> {
  const companyId = opts.companyId?.trim();
  const contentDir = opts.contentDir?.trim();
  if (!companyId) throw new Error("--company-id <uuid> is required");
  if (!contentDir) throw new Error("--content-dir <path> is required");

  const db = createDb(resolveConnectionString(opts.config));
  const result = await loadDeploymentContent(db, companyId, contentDir);

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${pc.bold("partyclip content load")}\n`);
  process.stdout.write(`  company: ${companyId}\n`);
  process.stdout.write(`  agents ingested: ${result.agents}\n`);
  process.stdout.write(`  constitution articles ingested: ${result.constitutionArticles}\n`);
}
