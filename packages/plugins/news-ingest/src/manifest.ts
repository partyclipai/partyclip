import type { PartyclipPluginManifestV1 } from "@partyclipai/plugin-sdk";

const PLUGIN_ID = "partyclip.news-ingest";
const PLUGIN_VERSION = "0.1.0";

export const NEWS_INGEST_FETCH_JOB_KEY = "news-ingest-fetch";
export const NEWS_INGESTED_EVENT_NAME = "ingested";

/**
 * Phase 1 first-party plugin. Out-of-process worker that polls
 * configured JSON Feed sources, dedupes against per-source watermark
 * state, and emits one structured event per new item.
 *
 * The plugin emits via ctx.events.emit which the SDK auto-namespaces
 * as `plugin.partyclip.news-ingest.ingested`. Subscribers in Phase 1
 * subscribe to that name. Stage 8+ adds a host-side rewriter that
 * surfaces this as the canonical core `news.ingested` event.
 *
 * Capabilities (least privilege):
 *   - http.outbound:    fetch source URLs
 *   - events.emit:      emit ingested events
 *   - plugin.state.*:   per-source watermark
 *   - secrets.read-ref: optional, only for sources with auth_secret_ref
 */
const manifest: PartyclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "News Ingest",
  description:
    "Polls configured JSON Feed sources on a cron schedule and emits structured news events. " +
    "Strips body text — agents only see id/title/summary/published-at/authors/tags.",
  author: "partyclip",
  categories: ["connector"],
  capabilities: [
    "http.outbound",
    "events.emit",
    "plugin.state.read",
    "plugin.state.write",
    "secrets.read-ref",
    "activity.log.write",
    "companies.read",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  jobs: [
    {
      jobKey: NEWS_INGEST_FETCH_JOB_KEY,
      displayName: "News Ingest Fetch",
      description:
        "Polls every configured news source. New items are emitted as structured events; " +
        "raw publisher body text is dropped at parse time.",
      // Hourly default; deployments can override per-environment.
      schedule: "0 * * * *",
    },
  ],
};

export default manifest;
