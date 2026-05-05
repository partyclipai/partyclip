import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest, {
  GET_CURRENT_TIME_TOOL,
  HEARTBEAT_JOB,
  LAST_TICK_DATA_KEY,
} from "../src/manifest.js";
import plugin from "../src/worker.js";

describe("ministry-example plugin", () => {
  it("runs the heartbeat job and exposes the last tick via data", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    await harness.runJob(HEARTBEAT_JOB);
    const tick = await harness.getData<{ iso: string }>(LAST_TICK_DATA_KEY);
    expect(typeof tick.iso).toBe("string");
    expect(() => new Date(tick.iso).toISOString()).not.toThrow();
  });

  it("logs a stage line when an issue.updated event fires", async () => {
    const harness = createTestHarness({ manifest });
    harness.seed({
      issues: [
        {
          id: "iss_1",
          companyId: "co_1",
          projectId: "prj_1",
          title: "demo",
          status: "in_review",
        } as never,
      ],
    });
    await plugin.definition.setup(harness.ctx);

    await harness.emit("issue.updated", { issueId: "iss_1" }, { entityId: "iss_1", entityType: "issue" });
    const matched = harness.logs.find((entry) => entry.message?.includes("patch iss_1 reached"));
    expect(matched).toBeTruthy();
  });

  it("exposes get_current_time as a tool", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.executeTool<{ data: { iso: string } }>(GET_CURRENT_TIME_TOOL, {});
    expect(typeof result.data.iso).toBe("string");
  });
});
