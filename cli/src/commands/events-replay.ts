import pc from "picocolors";
import { createDb } from "@partyclipai/db";
import { patchProjector, replayProjector } from "@partyclipai/server/services/projections";
import { readConfig } from "../config/store.js";

type EventsReplayOptions = {
  config?: string;
  from?: string;
  companyId?: string;
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

export async function eventsReplayCommand(opts: EventsReplayOptions): Promise<void> {
  const url = resolveConnectionString(opts.config);
  const fromTimestamp = opts.from ? new Date(opts.from) : undefined;
  if (fromTimestamp && Number.isNaN(fromTimestamp.getTime())) {
    throw new Error(`Invalid --from timestamp: ${opts.from}`);
  }

  const db = createDb(url);
  const summary = await replayProjector(db, patchProjector, {
    fromTimestamp,
    companyId: opts.companyId,
  });

  const result = {
    eventsRead: summary.eventsRead,
    aggregates: summary.aggregates.size,
    byType: summary.byType,
  };

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${pc.bold("partyclip events replay")}\n`);
  process.stdout.write(`  events read: ${result.eventsRead}\n`);
  process.stdout.write(`  patches reconstructed: ${result.aggregates}\n`);
  for (const [type, count] of Object.entries(result.byType).sort()) {
    process.stdout.write(`    ${type.padEnd(32)} ${count}\n`);
  }
}
