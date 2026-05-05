import { describe, expect, it } from "vitest";
import { patchProjector, projectPatch } from "./patch-projector.js";
import type { PartyclipEvent } from "./types.js";

let seq = 0;
function event(type: string, payload: Record<string, unknown> = {}, aggregateId = "patch-1"): PartyclipEvent {
  seq += 1;
  return {
    id: `evt-${seq}`,
    companyId: "co-1",
    type,
    aggregateType: "patch",
    aggregateId,
    actorType: "system",
    actorId: "test",
    payload,
    createdAt: new Date(2026, 0, 1, 0, 0, seq),
  };
}

describe("patchProjector", () => {
  it("returns null for an unknown aggregate", () => {
    expect(projectPatch([])).toBeNull();
  });

  it("creates a draft on patch.created", () => {
    const state = projectPatch([event("patch.created", { title: "Test", classification: "REGULAR" })]);
    expect(state?.state).toBe("DRAFTING");
    expect(state?.title).toBe("Test");
  });

  it("walks the canonical happy path to PUBLISHED", () => {
    const events: PartyclipEvent[] = [
      event("patch.created", { title: "T" }),
      event("patch.stage.completed", { nextState: "CRITIQUE" }),
      event("patch.stage.completed", { nextState: "RISK_ASSESS" }),
      event("patch.stage.completed", { nextState: "EXECUTOR" }),
      event("patch.stage.completed", { nextState: "BIAS_MIRROR" }),
      event("patch.stage.completed", { nextState: "AWAITING_SIGNOFF" }),
      event("patch.published", {}),
    ];
    const state = projectPatch(events);
    expect(state?.state).toBe("PUBLISHED");
    expect(state?.publishedAt).toBeInstanceOf(Date);
  });

  it("rejects illegal transitions silently (state unchanged)", () => {
    const state = projectPatch([
      event("patch.created", { title: "T" }),
      event("patch.stage.completed", { nextState: "EXECUTOR" }),
    ]);
    expect(state?.state).toBe("DRAFTING");
  });

  it("returns to DRAFTING on rejection from a reviewable stage", () => {
    const state = projectPatch([
      event("patch.created", { title: "T" }),
      event("patch.stage.completed", { nextState: "CRITIQUE" }),
      event("patch.stage.rejected", { reasonCode: "WEAK_DRAFT" }),
    ]);
    expect(state?.state).toBe("DRAFTING");
  });

  it("accumulates cost via patch.cost.recorded", () => {
    const state = projectPatch([
      event("patch.created", { title: "T" }),
      event("patch.cost.recorded", { cost: 0.12 }),
      event("patch.cost.recorded", { cost: 0.34 }),
    ]);
    expect(state?.costTotal).toBeCloseTo(0.46, 5);
  });

  it("kills from any non-terminal state", () => {
    const state = projectPatch([
      event("patch.created", { title: "T" }),
      event("patch.stage.completed", { nextState: "CRITIQUE" }),
      event("patch.killed", { reasonCode: "BUDGET_EXCEEDED" }),
    ]);
    expect(state?.state).toBe("KILLED");
    expect(state?.killReasonCode).toBe("BUDGET_EXCEEDED");
  });

  it("identity reducer for unknown event types", () => {
    const before = projectPatch([event("patch.created", { title: "T" })]);
    const after = patchProjector.apply(before, event("patch.unknown_event", {}));
    expect(after).toEqual(before);
  });
});
