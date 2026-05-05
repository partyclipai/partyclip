import { describe, expect, it } from "vitest";
import { isLiveEventType, matchesSubscription } from "./events.js";

describe("matchesSubscription", () => {
  it("matches exact types", () => {
    expect(matchesSubscription("patch.published", "patch.published")).toBe(true);
    expect(matchesSubscription("patch.published", "patch.killed")).toBe(false);
  });

  it("matches dotted-prefix wildcards", () => {
    expect(matchesSubscription("patch.stage.completed", "patch.*")).toBe(true);
    expect(matchesSubscription("patch.published", "patch.*")).toBe(true);
    expect(matchesSubscription("budget.threshold_crossed", "patch.*")).toBe(false);
  });

  it("matches the catch-all", () => {
    expect(matchesSubscription("anything.at.all", "*")).toBe(true);
  });

  it("does not match prefix without the dot", () => {
    expect(matchesSubscription("patches.x", "patch.*")).toBe(false);
  });
});

describe("isLiveEventType", () => {
  it("recognizes Phase 1 active events", () => {
    expect(isLiveEventType("patch.stage.completed")).toBe(true);
    expect(isLiveEventType("patch.published")).toBe(true);
    expect(isLiveEventType("budget.threshold_crossed")).toBe(true);
  });

  it("recognizes scheduled.tick.<cron_id> variants", () => {
    expect(isLiveEventType("scheduled.tick.daily-news-fetch")).toBe(true);
    expect(isLiveEventType("scheduled.tick.")).toBe(true);
  });

  it("rejects dormant types that have no producer in Phase 1", () => {
    expect(isLiveEventType("news.ingested")).toBe(false);
    expect(isLiveEventType("forum.feedback_summary.updated")).toBe(false);
  });
});
