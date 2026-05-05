import { describe, expect, it } from "vitest";
import { evaluateEscalation, pauseEventFor, type EscalationCandidate } from "./auto-escalation.js";

const NOW = new Date("2026-05-15T12:00:00Z");

function patch(overrides: Partial<EscalationCandidate> = {}): EscalationCandidate {
  return {
    patchId: "p-1",
    state: "AWAITING_SIGNOFF",
    enteredCurrentStateAt: new Date("2026-05-01T12:00:00Z"),
    lastOperatorActivityAt: null,
    pausedAt: null,
    ...overrides,
  };
}

describe("evaluateEscalation", () => {
  it("only acts on AWAITING_SIGNOFF", () => {
    expect(evaluateEscalation(patch({ state: "EXECUTOR" }), { thresholdDays: 7 }, NOW)).toEqual({
      kind: "noop",
      reason: "WRONG_STATE",
    });
  });

  it("noops when patch is already paused", () => {
    expect(
      evaluateEscalation(patch({ pausedAt: new Date("2026-05-10T00:00:00Z") }), { thresholdDays: 7 }, NOW),
    ).toEqual({ kind: "noop", reason: "ALREADY_PAUSED" });
  });

  it("noops within threshold from state-entry timestamp", () => {
    const recent = patch({ enteredCurrentStateAt: new Date("2026-05-12T00:00:00Z") });
    expect(evaluateEscalation(recent, { thresholdDays: 7 }, NOW)).toEqual({
      kind: "noop",
      reason: "WITHIN_THRESHOLD",
    });
  });

  it("uses lastOperatorActivityAt when available (resets the clock)", () => {
    const stale = patch({
      enteredCurrentStateAt: new Date("2026-04-01T00:00:00Z"),
      lastOperatorActivityAt: new Date("2026-05-13T00:00:00Z"),
    });
    expect(evaluateEscalation(stale, { thresholdDays: 7 }, NOW)).toEqual({
      kind: "noop",
      reason: "WITHIN_THRESHOLD",
    });
  });

  it("pauses with daysOverdue when threshold is crossed", () => {
    const stale = patch({ enteredCurrentStateAt: new Date("2026-05-01T12:00:00Z") }); // 14 days at NOW
    const decision = evaluateEscalation(stale, { thresholdDays: 7 }, NOW);
    expect(decision.kind).toBe("pause");
    if (decision.kind === "pause") {
      expect(decision.reason).toBe("OPERATOR_INACTIVITY");
      expect(decision.daysOverdue).toBeCloseTo(7, 2);
    }
  });

  it("pauseEventFor surfaces the patch + reason for the runtime to emit", () => {
    const decision = evaluateEscalation(
      patch({ enteredCurrentStateAt: new Date("2026-05-01T12:00:00Z") }),
      { thresholdDays: 7 },
      NOW,
    );
    if (decision.kind === "pause") {
      const event = pauseEventFor(decision, "p-1");
      expect(event).toEqual({
        type: "patch.paused",
        patchId: "p-1",
        reasonCode: "OPERATOR_INACTIVITY",
        daysOverdue: decision.daysOverdue,
      });
    }
  });
});
