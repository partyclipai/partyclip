import { describe, expect, it } from "vitest";
import { createInMemoryEventBus } from "./bus.js";
import type { PartyclipEventEnvelope } from "@partyclipai/shared/types/events";

let seq = 0;
function evt(type: string, overrides: Partial<PartyclipEventEnvelope> = {}): PartyclipEventEnvelope {
  seq += 1;
  return {
    type,
    aggregateType: "patch",
    aggregateId: `agg-${seq}`,
    companyId: "co-1",
    actorType: "system",
    actorId: "test",
    payload: {},
    occurredAt: new Date(2026, 0, 1, 0, 0, seq),
    ...overrides,
  };
}

describe("event bus (in-memory)", () => {
  it("delivers events to exact-match subscribers", async () => {
    const bus = createInMemoryEventBus();
    const seen: string[] = [];
    bus.subscribe("patch.published", (e) => {
      seen.push(e.type);
    });
    await bus.emit(evt("patch.published"));
    await bus.emit(evt("patch.killed"));
    expect(seen).toEqual(["patch.published"]);
  });

  it("delivers to wildcard subscribers", async () => {
    const bus = createInMemoryEventBus();
    const seen: string[] = [];
    bus.subscribe("patch.*", (e) => {
      seen.push(e.type);
    });
    await bus.emit(evt("patch.stage.completed"));
    await bus.emit(evt("patch.killed"));
    await bus.emit(evt("budget.threshold_crossed"));
    expect(seen).toEqual(["patch.stage.completed", "patch.killed"]);
  });

  it("records emitted events for assertions", async () => {
    const bus = createInMemoryEventBus();
    await bus.emit(evt("patch.created"));
    await bus.emit(evt("patch.published"));
    expect(bus.emitted.map((e) => e.type)).toEqual(["patch.created", "patch.published"]);
  });

  it("unsubscribe stops delivery", async () => {
    const bus = createInMemoryEventBus();
    let count = 0;
    const unsub = bus.subscribe("*", () => {
      count += 1;
    });
    await bus.emit(evt("patch.created"));
    expect(count).toBe(1);
    unsub();
    await bus.emit(evt("patch.created"));
    expect(count).toBe(1);
  });

  it("isolates a throwing handler from sibling subscribers", async () => {
    const bus = createInMemoryEventBus();
    let later = 0;
    bus.subscribe("patch.*", () => {
      throw new Error("first handler boom");
    });
    bus.subscribe("patch.*", () => {
      later += 1;
    });
    await bus.emit(evt("patch.created"));
    expect(later).toBe(1);
  });

  it("subscriberCount tracks live subscriptions", () => {
    const bus = createInMemoryEventBus();
    const a = bus.subscribe("patch.*", () => {});
    const b = bus.subscribe("budget.*", () => {});
    expect(bus.subscriberCount()).toBe(2);
    a();
    expect(bus.subscriberCount()).toBe(1);
    b();
    expect(bus.subscriberCount()).toBe(0);
  });

  it("fanout delivers without recording (replay path)", async () => {
    const bus = createInMemoryEventBus();
    const seen: string[] = [];
    bus.subscribe("*", (e) => {
      seen.push(e.type);
    });
    await bus.fanout(evt("patch.created"));
    expect(seen).toEqual(["patch.created"]);
    expect(bus.emitted).toHaveLength(0);
  });
});
