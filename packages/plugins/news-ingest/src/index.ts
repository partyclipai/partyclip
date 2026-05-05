export { default as manifest, NEWS_INGEST_FETCH_JOB_KEY, NEWS_INGESTED_EVENT_NAME } from "./manifest.js";
export { default as worker } from "./worker.js";

// Re-export the pure pieces so other plugins or host tooling can reuse them.
export { newsSourcesFileSchema, newsSourceSchema, parseSourcesConfig, InvalidSourcesConfigError, type NewsSource, type NewsSourcesFile } from "./sources.js";
export { parseJsonFeed, JsonFeedParseError, type NewsItem } from "./feed-parser.js";
export { dedupeAgainstWatermark, readWatermark, EMPTY_WATERMARK, type SourceWatermark, type DedupeResult } from "./dedupe.js";
export { fetchSource, type FetchFn, type FetchSourceResult, type FetchSourceDeps } from "./fetcher.js";
export { runOnce, type OrchestratorDeps, type SourceTickReport, type TickReport } from "./orchestrator.js";
