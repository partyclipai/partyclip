import { nextCronTick, parseCron, validateCron, type ParsedCron } from "../cron.js";
import type { EventBus } from "../events/bus.js";

/**
 * Phase 1 in-process scheduler. Each registered cron spec gets a
 * timer; when it fires, the scheduler emits a `scheduled.tick.{cron_id}`
 * event through the bus. SCHEDULED agents subscribe via the bus,
 * never via direct timer registration — see
 * docs/handoff/08_AGENT_FRAMEWORK.md ("every cadence is an explicit,
 * named scheduled tick visible in deployment config").
 *
 * Single-process; when partyclip shards, the equivalent runs on a
 * leader-elected scheduler process and emits via the same bus.
 */

export interface ScheduledTickSpec {
  /** Stable identifier; appended to `scheduled.tick.` to form the event type. */
  readonly id: string;
  readonly cronExpression: string;
  /** Required for audit-log tenancy. */
  readonly companyId: string;
  /** Optional payload to ride along with each tick. */
  readonly payload?: Record<string, unknown>;
}

export class InvalidCronError extends Error {
  constructor(public readonly cronExpression: string, public readonly detail: string) {
    super(`Invalid cron expression '${cronExpression}': ${detail}`);
    this.name = "InvalidCronError";
  }
}

interface ActiveSchedule {
  readonly spec: ScheduledTickSpec;
  readonly parsed: ParsedCron;
  timer: ReturnType<typeof setTimeout> | null;
  nextRunAt: Date | null;
}

export interface SchedulerClock {
  now(): Date;
  setTimeout(fn: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

const REAL_CLOCK: SchedulerClock = {
  now: () => new Date(),
  setTimeout: (fn, delay) => {
    const t = setTimeout(fn, delay);
    t.unref?.();
    return t;
  },
  clearTimeout: (h) => clearTimeout(h),
};

export interface Scheduler {
  register(spec: ScheduledTickSpec): void;
  deregister(id: string): boolean;
  /** Force-fire a registered schedule for tests; emits the event and reschedules. */
  fireNow(id: string): Promise<void>;
  list(): ReadonlyArray<{ id: string; cronExpression: string; nextRunAt: Date | null }>;
  stop(): void;
}

export interface SchedulerOptions {
  readonly bus: EventBus;
  readonly clock?: SchedulerClock;
  /** Defaults to "system" — used as actor_id on emitted events. */
  readonly actorId?: string;
}

/** Cap delay so we don't queue absurdly long timers (which Node can't represent reliably). */
const MAX_TIMEOUT_MS = 2_147_483_647; // ~24.85 days

export function createScheduler(opts: SchedulerOptions): Scheduler {
  const clock = opts.clock ?? REAL_CLOCK;
  const actorId = opts.actorId ?? "system";
  const schedules = new Map<string, ActiveSchedule>();
  let stopped = false;

  function arm(active: ActiveSchedule): void {
    if (stopped) return;
    if (active.timer) clock.clearTimeout(active.timer);
    const now = clock.now();
    const next = nextCronTick(active.parsed, now);
    active.nextRunAt = next;
    if (!next) {
      active.timer = null;
      return;
    }
    const delay = Math.min(Math.max(next.getTime() - now.getTime(), 0), MAX_TIMEOUT_MS);
    active.timer = clock.setTimeout(() => {
      void fire(active.spec.id);
    }, delay);
  }

  async function fire(id: string): Promise<void> {
    const active = schedules.get(id);
    if (!active || stopped) return;
    const eventType = `scheduled.tick.${active.spec.id}`;
    await opts.bus.emit({
      type: eventType,
      aggregateType: "scheduled_tick",
      aggregateId: active.spec.id,
      companyId: active.spec.companyId,
      actorType: "system",
      actorId,
      payload: active.spec.payload ?? {},
      occurredAt: clock.now(),
    });
    arm(active);
  }

  return {
    register(spec) {
      const error = validateCron(spec.cronExpression);
      if (error) throw new InvalidCronError(spec.cronExpression, error);
      if (schedules.has(spec.id)) {
        // Replace existing — useful for hot-reload of agent configs.
        const existing = schedules.get(spec.id)!;
        if (existing.timer) clock.clearTimeout(existing.timer);
      }
      const active: ActiveSchedule = {
        spec,
        parsed: parseCron(spec.cronExpression),
        timer: null,
        nextRunAt: null,
      };
      schedules.set(spec.id, active);
      arm(active);
    },
    deregister(id) {
      const existing = schedules.get(id);
      if (!existing) return false;
      if (existing.timer) clock.clearTimeout(existing.timer);
      schedules.delete(id);
      return true;
    },
    async fireNow(id) {
      await fire(id);
    },
    list() {
      return Array.from(schedules.values()).map((s) => ({
        id: s.spec.id,
        cronExpression: s.spec.cronExpression,
        nextRunAt: s.nextRunAt,
      }));
    },
    stop() {
      stopped = true;
      for (const s of schedules.values()) {
        if (s.timer) clock.clearTimeout(s.timer);
        s.timer = null;
      }
    },
  };
}
