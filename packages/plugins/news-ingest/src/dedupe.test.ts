import { describe, expect, it } from "vitest";
import { dedupeAgainstWatermark, EMPTY_WATERMARK, readWatermark } from "./dedupe.js";
import type { NewsItem } from "./feed-parser.js";

const NOW = new Date("2026-05-15T12:00:00Z");

function item(id: string): NewsItem {
  return {
    id,
    sourceId: "test",
    url: `https://example.com/${id}`,
    title: `t-${id}`,
    summary: "",
    publishedAt: null,
    authors: [],
    tags: [],
  };
}

describe("dedupeAgainstWatermark", () => {
  it("returns all items as new on empty watermark", () => {
    const result = dedupeAgainstWatermark([item("a"), item("b")], EMPTY_WATERMARK, NOW);
    expect(result.newItems.map((i) => i.id)).toEqual(["a", "b"]);
    expect(result.nextWatermark.seenIds.slice(0, 2)).toEqual(["a", "b"]);
    expect(result.nextWatermark.lastFetchedAt).toBe(NOW.toISOString());
  });

  it("filters items already in the watermark", () => {
    const wm = { seenIds: ["b"], lastFetchedAt: "2026-05-14T00:00:00Z" };
    const result = dedupeAgainstWatermark([item("a"), item("b"), item("c")], wm, NOW);
    expect(result.newItems.map((i) => i.id)).toEqual(["a", "c"]);
    expect(result.nextWatermark.seenIds.slice(0, 3)).toEqual(["a", "c", "b"]);
  });

  it("dedupes within the same batch", () => {
    const result = dedupeAgainstWatermark([item("a"), item("a"), item("b")], EMPTY_WATERMARK, NOW);
    expect(result.newItems.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("trims to ring limit", () => {
    const wmIds = Array.from({ length: 510 }, (_, i) => `old-${i}`);
    const wm = { seenIds: wmIds, lastFetchedAt: "" };
    const result = dedupeAgainstWatermark([item("new")], wm, NOW);
    expect(result.nextWatermark.seenIds).toHaveLength(500);
    expect(result.nextWatermark.seenIds[0]).toBe("new");
  });
});

describe("readWatermark", () => {
  it("returns empty for null/undefined/non-object", () => {
    expect(readWatermark(null)).toEqual(EMPTY_WATERMARK);
    expect(readWatermark(undefined)).toEqual(EMPTY_WATERMARK);
    expect(readWatermark("garbage")).toEqual(EMPTY_WATERMARK);
  });

  it("filters non-string ids out of stored payload", () => {
    const wm = readWatermark({ seenIds: ["a", 42, null, "b"], lastFetchedAt: "2026-05-01T00:00:00Z" });
    expect(wm.seenIds).toEqual(["a", "b"]);
  });
});
