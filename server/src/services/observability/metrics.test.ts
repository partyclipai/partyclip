import { describe, expect, it, vi } from "vitest";
import { METRIC_NAMES, createMetricsRegistry } from "./metrics.js";

describe("metrics registry", () => {
  it("aggregates counters by name+tags", () => {
    const reg = createMetricsRegistry();
    reg.emit({ kind: "counter", name: METRIC_NAMES.STAGE_REJECTION, value: 1, tags: { stage: "critique" } });
    reg.emit({ kind: "counter", name: METRIC_NAMES.STAGE_REJECTION, value: 1, tags: { stage: "critique" } });
    reg.emit({ kind: "counter", name: METRIC_NAMES.STAGE_REJECTION, value: 1, tags: { stage: "bias_mirror" } });
    const snap = reg.snapshot();
    expect(snap.counters.get("partyclip.stage.rejection{stage=critique}")).toBe(2);
    expect(snap.counters.get("partyclip.stage.rejection{stage=bias_mirror}")).toBe(1);
  });

  it("replaces gauges (last write wins)", () => {
    const reg = createMetricsRegistry();
    reg.emit({ kind: "gauge", name: METRIC_NAMES.BIAS_MIRROR_FILL_RATIO, value: 0.5, tags: {} });
    reg.emit({ kind: "gauge", name: METRIC_NAMES.BIAS_MIRROR_FILL_RATIO, value: 0.8, tags: {} });
    expect(reg.snapshot().gauges.get(METRIC_NAMES.BIAS_MIRROR_FILL_RATIO)).toBe(0.8);
  });

  it("tracks histogram count/sum/min/max", () => {
    const reg = createMetricsRegistry();
    reg.emit({ kind: "histogram", name: METRIC_NAMES.STAGE_DURATION_MS, value: 100, tags: { stage: "executor" } });
    reg.emit({ kind: "histogram", name: METRIC_NAMES.STAGE_DURATION_MS, value: 300, tags: { stage: "executor" } });
    reg.emit({ kind: "histogram", name: METRIC_NAMES.STAGE_DURATION_MS, value: 50, tags: { stage: "executor" } });
    const h = reg.snapshot().histograms.get("partyclip.stage.duration_ms{stage=executor}");
    expect(h).toEqual({ count: 3, sum: 450, min: 50, max: 300 });
  });

  it("forwards every event to the sink", () => {
    const reg = createMetricsRegistry();
    const sink = vi.fn();
    reg.setSink(sink);
    reg.emit({ kind: "counter", name: METRIC_NAMES.PATCH_PUBLISHED, value: 1, tags: {} });
    expect(sink).toHaveBeenCalledTimes(1);
  });

  it("isolates sink errors from the registry", () => {
    const reg = createMetricsRegistry();
    reg.setSink(() => {
      throw new Error("backend down");
    });
    expect(() => reg.emit({ kind: "counter", name: "x", value: 1, tags: {} })).not.toThrow();
  });
});
