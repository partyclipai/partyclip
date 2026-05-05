import { describe, expect, it } from "vitest";
import { InvalidSourcesConfigError, parseSourcesConfig } from "./sources.js";

const VALID = {
  sources: [
    { id: "blog", url: "https://example.com/feed.json" },
    { id: "press", url: "https://press.example.com/feed.json", auth_secret_ref: "TOKEN" },
  ],
};

describe("parseSourcesConfig", () => {
  it("accepts a minimal valid config and applies defaults", () => {
    const parsed = parseSourcesConfig(VALID);
    expect(parsed.sources).toHaveLength(2);
    expect(parsed.sources[0].max_items_per_fetch).toBe(50);
    expect(parsed.sources[0].timeout_seconds).toBe(15);
    expect(parsed.sources[0].kind).toBe("json_feed");
  });

  it("rejects empty source list", () => {
    expect(() => parseSourcesConfig({ sources: [] })).toThrow(InvalidSourcesConfigError);
  });

  it("rejects duplicate source ids", () => {
    expect(() =>
      parseSourcesConfig({
        sources: [
          { id: "x", url: "https://a.example.com/feed.json" },
          { id: "x", url: "https://b.example.com/feed.json" },
        ],
      }),
    ).toThrow(InvalidSourcesConfigError);
  });

  it("rejects bad ids", () => {
    expect(() =>
      parseSourcesConfig({ sources: [{ id: "Bad ID!", url: "https://a.example.com/feed.json" }] }),
    ).toThrow(InvalidSourcesConfigError);
  });

  it("rejects bad URLs", () => {
    expect(() =>
      parseSourcesConfig({ sources: [{ id: "ok", url: "not a url" }] }),
    ).toThrow(InvalidSourcesConfigError);
  });

  it("rejects unsupported kinds (RSS/Atom not in v0)", () => {
    expect(() =>
      parseSourcesConfig({ sources: [{ id: "rss-source", kind: "rss", url: "https://x/feed.xml" }] }),
    ).toThrow(InvalidSourcesConfigError);
  });

  it("rejects timeout out of range", () => {
    expect(() =>
      parseSourcesConfig({ sources: [{ id: "ok", url: "https://a.example.com/feed.json", timeout_seconds: 120 }] }),
    ).toThrow(InvalidSourcesConfigError);
  });
});
