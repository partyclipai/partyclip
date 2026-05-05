import { describe, expect, it } from "vitest";
import { JsonFeedParseError, parseJsonFeed } from "./feed-parser.js";

const FEED = {
  version: "https://jsonfeed.org/version/1.1",
  title: "Example",
  home_page_url: "https://example.com/",
  items: [
    {
      id: "post-1",
      url: "https://example.com/post-1",
      title: "Hello",
      summary: "First post",
      date_published: "2026-05-01T12:00:00Z",
      authors: [{ name: "Ada" }, { name: "Bea" }],
      tags: ["news", "policy"],
    },
    {
      id: "post-2",
      url: "https://example.com/post-2",
      title: "Long post",
      content_html: "<p>Lots of <strong>html</strong> here</p>",
      date_modified: "2026-05-02T00:00:00Z",
    },
    {
      // Missing both id and url — should be dropped
      title: "ghost",
    },
  ],
};

describe("parseJsonFeed", () => {
  it("extracts structured items", () => {
    const items = parseJsonFeed("example", FEED);
    expect(items).toHaveLength(2); // ghost dropped
    expect(items[0].id).toBe("post-1");
    expect(items[0].sourceId).toBe("example");
    expect(items[0].title).toBe("Hello");
    expect(items[0].summary).toBe("First post");
    expect(items[0].authors).toEqual(["Ada", "Bea"]);
    expect(items[0].tags).toEqual(["news", "policy"]);
  });

  it("uses url as id when item-level id is missing", () => {
    const items = parseJsonFeed("example", {
      ...FEED,
      items: [{ url: "https://example.com/p1", title: "ok" }],
    });
    expect(items[0].id).toBe("https://example.com/p1");
  });

  it("strips HTML when only content_html is present", () => {
    const items = parseJsonFeed("example", FEED);
    expect(items[1].summary).toBe("Lots of html here");
    expect(items[1].summary).not.toContain("<");
  });

  it("falls back to date_modified when date_published missing", () => {
    const items = parseJsonFeed("example", FEED);
    expect(items[1].publishedAt).toBe("2026-05-02T00:00:00Z");
  });

  it("clips long titles and summaries", () => {
    const longTitle = "x".repeat(500);
    const longSummary = "y ".repeat(500);
    const items = parseJsonFeed("example", {
      ...FEED,
      items: [{ id: "long", url: "https://example.com/long", title: longTitle, summary: longSummary }],
    });
    expect(items[0].title.length).toBeLessThanOrEqual(280);
    expect(items[0].summary.length).toBeLessThanOrEqual(600);
  });

  it("rejects payloads missing the version marker", () => {
    expect(() => parseJsonFeed("x", { title: "Bad", items: [] })).toThrow(JsonFeedParseError);
  });

  it("rejects unknown feed version", () => {
    expect(() =>
      parseJsonFeed("x", { version: "rss-2.0", title: "Bad", items: [] }),
    ).toThrow(JsonFeedParseError);
  });

  it("rejects non-object payload", () => {
    expect(() => parseJsonFeed("x", "not json feed")).toThrow(JsonFeedParseError);
  });
});
