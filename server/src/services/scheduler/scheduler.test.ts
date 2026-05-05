import { describe, expect, it } from "vitest";
import { createScheduler, InvalidCronError } from "./scheduler.js";
import { createInMemoryEventBus } from "../events/bus.js";
import type { SchedulerClock } from "./scheduler.js";

interface FakeTimer {
  fn: () => void;
  fires: Date;
}

function fakeClock(start: Date): {
  clock: SchedulerClock;
  advanceTo(target: Date): Promise<void>;
  pendingCount(): number;
} {
  let now = start;
  let nextHandle = 0;
  const timers = new Map<number, FakeTimer>();

  const clock: SchedulerClock = {
    now: () => new Date(now.getTime()),
    setTimeout: (fn, delayMs) => {
      const handle = ++nextHandle;
      timers.set(handle, { fn, fires: new Date(now.getTime() + delayMs) });
      return handle as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (h) => {
      timers.delete(h as unknown as number);
    },
  };

  return {
    clock,
    async advanceTo(target) {
      while (true) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.fires.getTime() <= target.getTime())
          .sort(([, a], [, b]) => a.fires.getTime() - b.fires.getTime());
        if (due.length === 0) break;
        const [handle, timer] = due[0];
        timers.delete(handle);
        now = timer.fires;
        timer.fn();
        // Allow microtasks (the scheduler's async fire) to run.
        await new Promise<void>((r) => setImmediate(r));
      }
      now = target;
    },
    pendingCount: () => timers.size,
  };
}

describe("scheduler", () => {
  it("rejects invalid cron expressions", () => {
    const bus = createInMemoryEventBus();
    const sched = createScheduler({ bus });
    expect(() =>
      sched.register({ id: "x", cronExpression: "invalid", companyId: "c-1" }),
    ).toThrow(InvalidCronError);
    sched.stop();
  });

  it("emits scheduled.tick.<id> at the next cron tick", async () => {
    const bus = createInMemoryEventBus();
    const fc = fakeClock(new Date("2026-05-15T11:59:30Z"));
    const sched = createScheduler({ bus, clock: fc.clock });
    sched.register({ id: "noon", cronExpression: "0 12 * * *", companyId: "c-1" });

    await fc.advanceTo(new Date("2026-05-15T12:00:00Z"));
    expect(bus.emitted.map((e) => e.type)).toEqual(["scheduled.tick.noon"]);
    expect(bus.emitted[0].aggregateType).toBe("scheduled_tick");
    expect(bus.emitted[0].aggregateId).toBe("noon");

    sched.stop();
  });

  it("re-arms after each fire", async () => {
    const bus = createInMemoryEventBus();
    const fc = fakeClock(new Date("2026-05-15T11:59:00Z"));
    const sched = createScheduler({ bus, clock: fc.clock });
    sched.register({ id: "every-min", cronExpression: "* * * * *", companyId: "c-1" });

    await fc.advanceTo(new Date("2026-05-15T12:03:30Z"));
    expect(bus.emitted.length).toBeGreaterThanOrEqual(4);
    expect(bus.emitted.every((e) => e.type === "scheduled.tick.every-min")).toBe(true);

    sched.stop();
  });

  it("deregister cancels pending timers", () => {
    const bus = createInMemoryEventBus();
    const fc = fakeClock(new Date("2026-05-15T11:59:30Z"));
    const sched = createScheduler({ bus, clock: fc.clock });
    sched.register({ id: "a", cronExpression: "0 12 * * *", companyId: "c-1" });
    expect(fc.pendingCount()).toBe(1);
    expect(sched.deregister("a")).toBe(true);
    expect(fc.pendingCount()).toBe(0);
    expect(sched.deregister("missing")).toBe(false);
    sched.stop();
  });

  it("replaces existing schedule on re-register", () => {
    const bus = createInMemoryEventBus();
    const fc = fakeClock(new Date("2026-05-15T11:59:30Z"));
    const sched = createScheduler({ bus, clock: fc.clock });
    sched.register({ id: "x", cronExpression: "0 12 * * *", companyId: "c-1" });
    sched.register({ id: "x", cronExpression: "0 13 * * *", companyId: "c-1" });
    const next = sched.list().find((s) => s.id === "x")?.nextRunAt;
    expect(next?.toISOString()).toBe("2026-05-15T13:00:00.000Z");
    sched.stop();
  });

  it("fireNow emits without waiting for the timer", async () => {
    const bus = createInMemoryEventBus();
    const fc = fakeClock(new Date("2026-05-15T00:00:00Z"));
    const sched = createScheduler({ bus, clock: fc.clock });
    sched.register({ id: "manual", cronExpression: "0 12 * * *", companyId: "c-1", payload: { source: "test" } });

    await sched.fireNow("manual");
    expect(bus.emitted.length).toBe(1);
    expect(bus.emitted[0].payload).toEqual({ source: "test" });

    sched.stop();
  });

  it("stop() halts further fires", async () => {
    const bus = createInMemoryEventBus();
    const fc = fakeClock(new Date("2026-05-15T11:59:30Z"));
    const sched = createScheduler({ bus, clock: fc.clock });
    sched.register({ id: "noon", cronExpression: "0 12 * * *", companyId: "c-1" });
    sched.stop();
    await fc.advanceTo(new Date("2026-05-16T12:00:00Z"));
    expect(bus.emitted).toHaveLength(0);
  });
});
