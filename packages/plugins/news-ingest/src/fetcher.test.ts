import { describe, expect, it } from "vitest";
import { fetchSource } from "./fetcher.js";
import type { NewsSource } from "./sources.js";

const SOURCE: NewsSource = {
  id: "test",
  kind: "json_feed",
  url: "https://example.com/feed.json",
  max_items_per_fetch: 50,
  timeout_seconds: 5,
};

const FEED_BODY = {
  version: "https://jsonfeed.org/version/1.1",
  title: "Test",
  items: [
    { id: "1", url: "https://example.com/1", title: "one" },
    { id: "2", url: "https://example.com/2", title: "two" },
  ],
};

function ok(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchSource", () => {
  it("returns parsed items on success", async () => {
    const result = await fetchSource(SOURCE, {
      fetch: async () => ok(FEED_BODY),
    });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.items).toHaveLength(2);
      expect(result.httpStatus).toBe(200);
    }
  });

  it("caps items at max_items_per_fetch", async () => {
    const big = {
      ...FEED_BODY,
      items: Array.from({ length: 75 }, (_, i) => ({ id: `${i}`, url: `https://example.com/${i}`, title: `i${i}` })),
    };
    const result = await fetchSource({ ...SOURCE, max_items_per_fetch: 10 }, {
      fetch: async () => ok(big),
    });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.items).toHaveLength(10);
  });

  it("classifies HTTP 4xx as HTTP_ERROR", async () => {
    const result = await fetchSource(SOURCE, {
      fetch: async () => new Response("nope", { status: 404, statusText: "Not Found" }),
    });
    expect(result).toMatchObject({ kind: "error", reasonCode: "HTTP_ERROR", httpStatus: 404 });
  });

  it("classifies HTTP 5xx as UPSTREAM_ERROR", async () => {
    const result = await fetchSource(SOURCE, {
      fetch: async () => new Response("oops", { status: 503, statusText: "Service Unavailable" }),
    });
    expect(result).toMatchObject({ kind: "error", reasonCode: "UPSTREAM_ERROR", httpStatus: 503 });
  });

  it("classifies bad JSON as INVALID_JSON", async () => {
    const result = await fetchSource(SOURCE, {
      fetch: async () => new Response("not-json", { status: 200, headers: { "content-type": "application/json" } }),
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.reasonCode).toBe("INVALID_JSON");
  });

  it("classifies feed-shape mismatch as FEED_PARSE_ERROR", async () => {
    const result = await fetchSource(SOURCE, {
      fetch: async () => ok({ title: "no version", items: [] }),
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.reasonCode).toBe("FEED_PARSE_ERROR");
  });

  it("classifies abort/timeout as TIMEOUT", async () => {
    const result = await fetchSource({ ...SOURCE, timeout_seconds: 1 }, {
      fetch: async (_url, init) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    });
    expect(result.kind).toBe("error");
    if (result.kind === "error") expect(result.reasonCode).toBe("TIMEOUT");
  });

  it("flags MISCONFIGURED when source needs auth but no resolver was injected", async () => {
    const authed: NewsSource = { ...SOURCE, auth_secret_ref: "TOKEN" };
    const result = await fetchSource(authed, {
      fetch: async () => ok(FEED_BODY),
    });
    expect(result).toMatchObject({ kind: "error", reasonCode: "MISCONFIGURED" });
  });

  it("attaches Bearer header when secret resolves", async () => {
    let observedAuth: string | undefined;
    const authed: NewsSource = { ...SOURCE, auth_secret_ref: "TOKEN" };
    const result = await fetchSource(authed, {
      fetch: async (_url, init) => {
        observedAuth = (init?.headers as Record<string, string> | undefined)?.authorization;
        return ok(FEED_BODY);
      },
      resolveSecret: async () => "abc123",
    });
    expect(result.kind).toBe("ok");
    expect(observedAuth).toBe("Bearer abc123");
  });

  it("propagates SECRET_RESOLVE_FAILED", async () => {
    const authed: NewsSource = { ...SOURCE, auth_secret_ref: "TOKEN" };
    const result = await fetchSource(authed, {
      fetch: async () => ok(FEED_BODY),
      resolveSecret: async () => {
        throw new Error("secret missing");
      },
    });
    expect(result).toMatchObject({ kind: "error", reasonCode: "SECRET_RESOLVE_FAILED" });
  });
});
