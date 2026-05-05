import { dedupeAgainstWatermark, readWatermark, type SourceWatermark } from "./dedupe.js";
import { fetchSource, type FetchFn, type FetchSourceResult } from "./fetcher.js";
import type { NewsItem } from "./feed-parser.js";
import type { NewsSource, NewsSourcesFile } from "./sources.js";

/**
 * Single-tick runner for the news-ingest plugin. Pure orchestration
 * with all I/O dependencies injected — the worker file is then a thin
 * adapter that maps SDK clients to these functions. Tests exercise
 * this directly with fakes; the worker is just plumbing.
 */

export interface OrchestratorDeps {
  fetch: FetchFn;
  resolveSecret?: (ref: string) => Promise<string>;
  getWatermark: (sourceId: string) => Promise<unknown>;
  setWatermark: (sourceId: string, value: SourceWatermark) => Promise<void>;
  emitEvent: (item: NewsItem) => Promise<void>;
  log: (level: "info" | "warn" | "error", message: string, fields?: Record<string, unknown>) => void;
  now?: () => Date;
}

export interface SourceTickReport {
  sourceId: string;
  status: "ok" | "skipped" | "failed";
  newItemCount: number;
  reasonCode?: string;
  message?: string;
  httpStatus?: number;
}

export interface TickReport {
  startedAt: string;
  finishedAt: string;
  perSource: SourceTickReport[];
  totalNewItems: number;
}

export async function runOnce(
  config: NewsSourcesFile,
  deps: OrchestratorDeps,
): Promise<TickReport> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now();
  const perSource: SourceTickReport[] = [];
  let totalNewItems = 0;

  for (const source of config.sources) {
    const report = await runSource(source, deps, now());
    perSource.push(report);
    totalNewItems += report.newItemCount;
  }

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: now().toISOString(),
    perSource,
    totalNewItems,
  };
}

async function runSource(
  source: NewsSource,
  deps: OrchestratorDeps,
  tickNow: Date,
): Promise<SourceTickReport> {
  let result: FetchSourceResult;
  try {
    result = await fetchSource(source, {
      fetch: deps.fetch,
      resolveSecret: deps.resolveSecret,
      now: deps.now,
    });
  } catch (err) {
    deps.log("error", "news-ingest fetch crashed", { sourceId: source.id, err: (err as Error).message });
    return { sourceId: source.id, status: "failed", newItemCount: 0, reasonCode: "FETCH_CRASH", message: (err as Error).message };
  }

  if (result.kind === "error") {
    deps.log("warn", "news-ingest fetch failed", {
      sourceId: source.id,
      reasonCode: result.reasonCode,
      httpStatus: result.httpStatus,
    });
    return {
      sourceId: source.id,
      status: "failed",
      newItemCount: 0,
      reasonCode: result.reasonCode,
      message: result.message,
      httpStatus: result.httpStatus,
    };
  }

  const stored = await deps.getWatermark(source.id);
  const watermark = readWatermark(stored);
  const dedupe = dedupeAgainstWatermark(result.items, watermark, tickNow);

  for (const item of dedupe.newItems) {
    try {
      await deps.emitEvent(item);
    } catch (err) {
      deps.log("error", "news-ingest emit failed", { sourceId: source.id, itemId: item.id, err: (err as Error).message });
      // Don't update watermark on emission failure — we'll retry next tick.
      return {
        sourceId: source.id,
        status: "failed",
        newItemCount: 0,
        reasonCode: "EMIT_FAILED",
        message: (err as Error).message,
      };
    }
  }

  await deps.setWatermark(source.id, dedupe.nextWatermark);
  deps.log("info", "news-ingest source tick complete", {
    sourceId: source.id,
    newItemCount: dedupe.newItems.length,
  });
  return {
    sourceId: source.id,
    status: dedupe.newItems.length === 0 ? "skipped" : "ok",
    newItemCount: dedupe.newItems.length,
  };
}
