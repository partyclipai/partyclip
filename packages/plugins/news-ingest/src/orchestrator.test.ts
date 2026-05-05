import { describe, expect, it } from "vitest";
import { runOnce } from "./orchestrator.js";
import { parseSourcesConfig } from "./sources.js";
import type { SourceWatermark } from "./dedupe.js";

const NOW = new Date("2026-05-15T12:00:00Z");

function makeFeedResponse(items: Array<{ id: string; title: string }>): Response {
  return new Response(
    JSON.stringify({
      version: "https://jsonfeed.org/version/1.1",
      title: "T",
      items: items.map((i) => ({ id: i.id, url: `https://example.com/${i.id}`, title: i.title })),
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function makeDeps(opts: {
  feeds: Record<string, Array<{ id: string; title: string }>>;
  watermarks?: Record<string, SourceWatermark>;
}) {
  const watermarks = new Map<string, SourceWatermark>(Object.entries(opts.watermarks ?? {}));
  const emitted: Array<{ id: string; sourceId: string }> = [];
  const logs: Array<{ level: string; message: string }> = [];
  return {
    deps: {
      fetch: async (url: string) => {
        const sourceId = Object.entries(opts.feeds).find(([, _]) => url.includes(_[0]?.id ?? "??"))?.[0];
        const id = url.includes("blog") ? "blog" : url.includes("press") ? "press" : null;
        if (!id || !opts.feeds[id]) return new Response("", { status: 404 });
        return makeFeedResponse(opts.feeds[id]);
      },
      getWatermark: async (sourceId: string) => watermarks.get(sourceId) ?? null,
      setWatermark: async (sourceId: string, value: SourceWatermark) => {
        watermarks.set(sourceId, value);
      },
      emitEvent: async (item: { id: string; sourceId: string }) => {
        emitted.push({ id: item.id, sourceId: item.sourceId });
      },
      log: (level: "info" | "warn" | "error", message: string) => {
        logs.push({ level, message });
      },
      now: () => NOW,
    },
    emitted,
    watermarks,
    logs,
  };
}

const CONFIG = parseSourcesConfig({
  sources: [
    { id: "blog", url: "https://example.com/blog/feed.json" },
    { id: "press", url: "https://press.example.com/feed.json" },
  ],
});

describe("runOnce", () => {
  it("emits one event per new item across sources, updates watermarks", async () => {
    const { deps, emitted, watermarks } = makeDeps({
      feeds: {
        blog: [{ id: "b1", title: "x" }, { id: "b2", title: "y" }],
        press: [{ id: "p1", title: "z" }],
      },
    });
    const report = await runOnce(CONFIG, deps);
    expect(report.totalNewItems).toBe(3);
    expect(emitted.map((e) => e.id).sort()).toEqual(["b1", "b2", "p1"]);
    expect(watermarks.get("blog")?.seenIds).toContain("b1");
    expect(watermarks.get("press")?.seenIds).toContain("p1");
  });

  it("emits only new items on second tick", async () => {
    const { deps, emitted } = makeDeps({
      feeds: { blog: [{ id: "b1", title: "x" }], press: [{ id: "p1", title: "y" }] },
      watermarks: { blog: { seenIds: ["b1"], lastFetchedAt: "" } },
    });
    const report = await runOnce(CONFIG, deps);
    expect(report.totalNewItems).toBe(1);
    expect(emitted.map((e) => e.id)).toEqual(["p1"]);
    expect(report.perSource.find((s) => s.sourceId === "blog")?.status).toBe("skipped");
  });

  it("isolates per-source failures", async () => {
    const deps = {
      fetch: async (url: string) => {
        if (url.includes("blog")) return new Response("oops", { status: 500 });
        return makeFeedResponse([{ id: "p1", title: "z" }]);
      },
      getWatermark: async () => null,
      setWatermark: async () => {},
      emitEvent: async () => {},
      log: () => {},
      now: () => NOW,
    };
    const report = await runOnce(CONFIG, deps);
    expect(report.perSource.find((s) => s.sourceId === "blog")?.status).toBe("failed");
    expect(report.perSource.find((s) => s.sourceId === "press")?.status).toBe("ok");
    expect(report.totalNewItems).toBe(1);
  });

  it("does not advance the watermark when emit fails (retry-next-tick)", async () => {
    const { deps, watermarks } = makeDeps({
      feeds: { blog: [{ id: "b1", title: "x" }], press: [] },
    });
    deps.emitEvent = async () => {
      throw new Error("downstream offline");
    };
    const report = await runOnce(CONFIG, deps);
    expect(report.perSource.find((s) => s.sourceId === "blog")?.status).toBe("failed");
    expect(watermarks.has("blog")).toBe(false);
  });
});
