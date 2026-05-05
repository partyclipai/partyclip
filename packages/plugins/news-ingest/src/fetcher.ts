import type { NewsSource } from "./sources.js";
import { parseJsonFeed, type NewsItem } from "./feed-parser.js";

/**
 * Pure-with-injected-fetch fetcher. The plugin worker passes a real
 * fetch (ctx.http.fetch); tests pass a fake. Returns parsed items
 * without applying dedupe — that's the next step in the pipeline.
 *
 * Errors are not thrown directly; they're returned as a discriminated
 * result so the worker can record per-source success/failure without
 * killing the whole tick.
 */

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export type FetchSourceResult =
  | { kind: "ok"; items: NewsItem[]; httpStatus: number }
  | { kind: "error"; reasonCode: string; message: string; httpStatus?: number };

export interface FetchSourceDeps {
  fetch: FetchFn;
  /** Resolves a secret reference to the bearer-token value. Required iff source.auth_secret_ref set. */
  resolveSecret?: (ref: string) => Promise<string>;
  /** For attributable telemetry / log redaction. */
  userAgent?: string;
  /** Time source for testability. */
  now?: () => Date;
}

const DEFAULT_USER_AGENT = "partyclip-news-ingest/0.1";

export async function fetchSource(source: NewsSource, deps: FetchSourceDeps): Promise<FetchSourceResult> {
  const headers: Record<string, string> = {
    accept: "application/feed+json, application/json;q=0.9",
    "user-agent": deps.userAgent ?? DEFAULT_USER_AGENT,
  };

  if (source.auth_secret_ref) {
    if (!deps.resolveSecret) {
      return {
        kind: "error",
        reasonCode: "MISCONFIGURED",
        message: `source '${source.id}' declares auth_secret_ref but no resolver was injected`,
      };
    }
    try {
      const token = await deps.resolveSecret(source.auth_secret_ref);
      headers.authorization = `Bearer ${token}`;
    } catch (err) {
      return {
        kind: "error",
        reasonCode: "SECRET_RESOLVE_FAILED",
        message: (err as Error).message,
      };
    }
  }

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), source.timeout_seconds * 1000);
  try {
    const response = await deps.fetch(source.url, { headers, signal: ac.signal });
    if (!response.ok) {
      return {
        kind: "error",
        reasonCode: response.status >= 500 ? "UPSTREAM_ERROR" : "HTTP_ERROR",
        message: `${response.status} ${response.statusText}`,
        httpStatus: response.status,
      };
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (err) {
      return {
        kind: "error",
        reasonCode: "INVALID_JSON",
        message: (err as Error).message,
        httpStatus: response.status,
      };
    }
    let parsed: NewsItem[];
    try {
      parsed = parseJsonFeed(source.id, body);
    } catch (err) {
      return {
        kind: "error",
        reasonCode: "FEED_PARSE_ERROR",
        message: (err as Error).message,
        httpStatus: response.status,
      };
    }
    const cap = source.max_items_per_fetch;
    return { kind: "ok", items: parsed.slice(0, cap), httpStatus: response.status };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      return {
        kind: "error",
        reasonCode: "TIMEOUT",
        message: `fetch exceeded ${source.timeout_seconds}s`,
      };
    }
    return {
      kind: "error",
      reasonCode: "NETWORK_ERROR",
      message: (err as Error).message,
    };
  } finally {
    clearTimeout(timeout);
  }
}
