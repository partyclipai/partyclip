import type { Db } from "@partyclipai/db";
import { activityLog } from "@partyclipai/db";
import {
  matchesSubscription,
  type EventSubscription,
  type PartyclipEventEnvelope,
} from "@partyclipai/shared/types/events";
import { logger } from "../../middleware/logger.js";

/**
 * In-process pub/sub backed by the activity_log audit store. Every
 * emit() writes the event to activity_log inside the caller's
 * transaction (or as a single insert if none provided), then fans out
 * to in-process subscribers in the same tick. Subscribers are
 * fire-and-forget: a handler that throws is logged and skipped, but
 * never blocks downstream subscribers.
 *
 * Two reasons it lives here and not on top of an external broker:
 *   1) The audit log *is* the event store. A second store would
 *      drift out of sync and we already revoke UPDATE/DELETE on
 *      activity_log (migration 0076).
 *   2) Phase 1 is single-process. When we shard, a Postgres LISTEN/
 *      NOTIFY adapter slots in here without changing the API.
 */

export type EventHandler = (event: PartyclipEventEnvelope) => Promise<void> | void;

export interface Subscription {
  readonly id: string;
  readonly subscription: EventSubscription;
  readonly handler: EventHandler;
}

export interface EventBus {
  emit(event: PartyclipEventEnvelope): Promise<void>;
  subscribe(subscription: EventSubscription, handler: EventHandler): () => void;
  /** Fan out to subscribers without writing to activity_log. Used by replay. */
  fanout(event: PartyclipEventEnvelope): Promise<void>;
  /** Test-only: snapshot of registered subscriptions. */
  subscriberCount(): number;
}

export interface EventBusOptions {
  /** Override for tests; defaults to crypto.randomUUID. */
  readonly newSubscriptionId?: () => string;
}

export function createEventBus(db: Db, options: EventBusOptions = {}): EventBus {
  const subs = new Map<string, Subscription>();
  const newId = options.newSubscriptionId ?? (() => globalThis.crypto.randomUUID());

  async function persistEvent(event: PartyclipEventEnvelope): Promise<void> {
    await db.insert(activityLog).values({
      companyId: event.companyId,
      actorType: event.actorType,
      actorId: event.actorId,
      action: event.type,
      entityType: event.aggregateType,
      entityId: event.aggregateId,
      details: event.payload,
    });
  }

  async function fanout(event: PartyclipEventEnvelope): Promise<void> {
    for (const sub of subs.values()) {
      if (!matchesSubscription(event.type, sub.subscription)) continue;
      try {
        await sub.handler(event);
      } catch (err) {
        logger.warn(
          { err, subscription: sub.subscription, eventType: event.type },
          "event handler failed",
        );
      }
    }
  }

  return {
    async emit(event) {
      await persistEvent(event);
      await fanout(event);
    },
    async fanout(event) {
      await fanout(event);
    },
    subscribe(subscription, handler) {
      const id = newId();
      subs.set(id, { id, subscription, handler });
      return () => {
        subs.delete(id);
      };
    },
    subscriberCount() {
      return subs.size;
    },
  };
}

/**
 * In-memory bus for tests and bootstrap (no database). Useful for unit
 * tests that want to assert on emission without a Postgres connection.
 */
export function createInMemoryEventBus(options: EventBusOptions = {}): EventBus & {
  emitted: PartyclipEventEnvelope[];
} {
  const subs = new Map<string, Subscription>();
  const emitted: PartyclipEventEnvelope[] = [];
  const newId = options.newSubscriptionId ?? (() => globalThis.crypto.randomUUID());

  async function fanout(event: PartyclipEventEnvelope): Promise<void> {
    for (const sub of subs.values()) {
      if (!matchesSubscription(event.type, sub.subscription)) continue;
      try {
        await sub.handler(event);
      } catch (err) {
        logger.warn(
          { err, subscription: sub.subscription, eventType: event.type },
          "in-memory event handler failed",
        );
      }
    }
  }

  return {
    async emit(event) {
      emitted.push(event);
      await fanout(event);
    },
    async fanout(event) {
      await fanout(event);
    },
    subscribe(subscription, handler) {
      const id = newId();
      subs.set(id, { id, subscription, handler });
      return () => {
        subs.delete(id);
      };
    },
    subscriberCount() {
      return subs.size;
    },
    emitted,
  };
}
