import type { PatchState } from "@partyclipai/shared/types/patch";

/**
 * Pure escalation policy: if a patch sits at AWAITING_SIGNOFF longer
 * than the configured threshold without operator activity, *pause
 * generation*. Per docs/handoff/04_PIPELINE.md and the plan, the
 * system never auto-approves — only pauses.
 *
 * The runtime side wakes this up on a scheduled tick, queries the
 * relevant patches, and applies the pause via a `patch.paused` event.
 */

const ONE_DAY_MS = 86_400_000;

export interface EscalationCandidate {
  readonly patchId: string;
  readonly state: PatchState;
  readonly enteredCurrentStateAt: Date;
  readonly lastOperatorActivityAt: Date | null;
  readonly pausedAt: Date | null;
}

export interface EscalationPolicy {
  readonly thresholdDays: number;
}

export type EscalationDecision =
  | { kind: "pause"; reason: "OPERATOR_INACTIVITY"; daysOverdue: number }
  | { kind: "noop"; reason: "WRONG_STATE" | "ALREADY_PAUSED" | "WITHIN_THRESHOLD" };

export function evaluateEscalation(
  patch: EscalationCandidate,
  policy: EscalationPolicy,
  now: Date,
): EscalationDecision {
  if (patch.state !== "AWAITING_SIGNOFF") {
    return { kind: "noop", reason: "WRONG_STATE" };
  }
  if (patch.pausedAt !== null) {
    return { kind: "noop", reason: "ALREADY_PAUSED" };
  }
  const reference = patch.lastOperatorActivityAt ?? patch.enteredCurrentStateAt;
  const elapsedMs = now.getTime() - reference.getTime();
  const elapsedDays = elapsedMs / ONE_DAY_MS;
  if (elapsedDays < policy.thresholdDays) {
    return { kind: "noop", reason: "WITHIN_THRESHOLD" };
  }
  return {
    kind: "pause",
    reason: "OPERATOR_INACTIVITY",
    daysOverdue: Number((elapsedDays - policy.thresholdDays).toFixed(2)),
  };
}

export interface PauseEvent {
  readonly type: "patch.paused";
  readonly patchId: string;
  readonly reasonCode: "OPERATOR_INACTIVITY";
  readonly daysOverdue: number;
}

export function pauseEventFor(decision: EscalationDecision & { kind: "pause" }, patchId: string): PauseEvent {
  return {
    type: "patch.paused",
    patchId,
    reasonCode: decision.reason,
    daysOverdue: decision.daysOverdue,
  };
}
