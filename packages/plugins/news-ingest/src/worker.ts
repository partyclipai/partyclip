import { definePlugin, runWorker } from "@partyclipai/plugin-sdk";
import type { PluginContext } from "@partyclipai/plugin-sdk";
import type { NewsItem } from "./feed-parser.js";
import { NEWS_INGEST_FETCH_JOB_KEY, NEWS_INGESTED_EVENT_NAME } from "./manifest.js";
import { runOnce } from "./orchestrator.js";
import { parseSourcesConfig, type NewsSourcesFile } from "./sources.js";
import type { SourceWatermark } from "./dedupe.js";

const WATERMARK_NAMESPACE = "news-ingest:watermarks";

/**
 * Out-of-process plugin worker. Wires SDK clients (http, secrets,
 * state, events, logger, activity) into the pure orchestrator.
 * The handler runs once per scheduled tick of the news-ingest-fetch
 * job; the schedule itself is declared in manifest.ts.
 */
const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("news-ingest plugin setup complete");

    ctx.jobs.register(NEWS_INGEST_FETCH_JOB_KEY, async (job) => {
      const config = await loadConfig(ctx);
      if (!config) {
        ctx.logger.warn("news-ingest: no sources configured; skipping tick");
        return;
      }

      // Scheduled jobs run instance-wide; iterate companies so per-company
      // watermarks stay isolated. Phase 1 deployments have a single company
      // but the loop costs nothing and keeps the contract honest.
      const companies = await ctx.companies.list({ limit: 100, offset: 0 });
      if (companies.length === 0) {
        ctx.logger.info("news-ingest: no companies; skipping tick");
        return;
      }

      for (const company of companies) {
        const companyId = company.id;
        const report = await runOnce(config, {
          fetch: (url, init) => ctx.http.fetch(url, init),
          resolveSecret: (ref) => ctx.secrets.resolve(ref),
          getWatermark: (sourceId) =>
            ctx.state.get({
              scopeKind: "company",
              scopeId: companyId,
              namespace: WATERMARK_NAMESPACE,
              stateKey: sourceId,
            }),
          setWatermark: (sourceId, value: SourceWatermark) =>
            ctx.state.set(
              {
                scopeKind: "company",
                scopeId: companyId,
                namespace: WATERMARK_NAMESPACE,
                stateKey: sourceId,
              },
              value as unknown,
            ),
          emitEvent: (item: NewsItem) => emitNewsItem(ctx, companyId, item),
          log: (level, message, fields) => {
            if (level === "error") ctx.logger.error(message, fields);
            else if (level === "warn") ctx.logger.warn(message, fields);
            else ctx.logger.info(message, fields);
          },
        });

        ctx.logger.info("news-ingest tick complete", {
          runId: job.runId,
          companyId,
          totalNewItems: report.totalNewItems,
          perSource: report.perSource,
        });

        await ctx.activity.log({
          companyId,
          message: `news-ingest fetched ${report.totalNewItems} new item(s) across ${config.sources.length} source(s)`,
          entityType: "plugin_run",
          entityId: job.runId,
          metadata: { perSource: report.perSource },
        });
      }
    });
  },

  async onHealth() {
    return { status: "ok", message: "news-ingest worker ready" };
  },
});

async function loadConfig(ctx: PluginContext): Promise<NewsSourcesFile | null> {
  const raw = await ctx.config.get();
  if (!raw || typeof raw !== "object") return null;
  try {
    return parseSourcesConfig(raw);
  } catch (err) {
    ctx.logger.error("news-ingest: invalid sources config", { err: (err as Error).message });
    return null;
  }
}

async function emitNewsItem(ctx: PluginContext, companyId: string, item: NewsItem): Promise<void> {
  await ctx.events.emit(NEWS_INGESTED_EVENT_NAME, companyId, {
    sourceId: item.sourceId,
    itemId: item.id,
    url: item.url,
    title: item.title,
    summary: item.summary,
    publishedAt: item.publishedAt,
    authors: item.authors,
    tags: item.tags,
  });
}

export default plugin;
runWorker(plugin, import.meta.url);
