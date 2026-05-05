import type { NewsItem } from "./feed-parser.js";

/**
 * Pure dedupe and watermark logic. The plugin tracks per-source
 * watermarks (last seen item ids + last fetch time) in plugin state.
 * On each fetch we filter out items already seen.
 *
 * We keep a bounded set of recent ids per source rather than tracking
 * everything forever — JSON Feeds are typically <100 items and items
 * rotate out of the feed on the publisher side. A 500-id ring is
 * generous and bounded.
 */

const ID_RING_LIMIT = 500;

export interface SourceWatermark {
  /** Most recently seen item ids (LRU; newest first up to ID_RING_LIMIT). */
  readonly seenIds: readonly string[];
  /** ISO timestamp of last successful fetch. */
  readonly lastFetchedAt: string;
}

export const EMPTY_WATERMARK: SourceWatermark = {
  seenIds: [],
  lastFetchedAt: "",
};

export interface DedupeResult {
  readonly newItems: NewsItem[];
  readonly nextWatermark: SourceWatermark;
}

export function dedupeAgainstWatermark(
  items: readonly NewsItem[],
  watermark: SourceWatermark,
  now: Date,
): DedupeResult {
  const seen = new Set(watermark.seenIds);
  const newItems: NewsItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    newItems.push(item);
    seen.add(item.id);
  }
  // newest-first: prepend new ids to the existing ring, trim to limit
  const nextSeen = [...newItems.map((i) => i.id), ...watermark.seenIds];
  const trimmed = nextSeen.slice(0, ID_RING_LIMIT);
  return {
    newItems,
    nextWatermark: {
      seenIds: trimmed,
      lastFetchedAt: now.toISOString(),
    },
  };
}

/** Convenience: parse a stored watermark blob back into the typed shape. */
export function readWatermark(stored: unknown): SourceWatermark {
  if (!stored || typeof stored !== "object") return EMPTY_WATERMARK;
  const obj = stored as Record<string, unknown>;
  const seenIds = Array.isArray(obj.seenIds) ? obj.seenIds.filter((x): x is string => typeof x === "string") : [];
  const lastFetchedAt = typeof obj.lastFetchedAt === "string" ? obj.lastFetchedAt : "";
  return { seenIds, lastFetchedAt };
}
