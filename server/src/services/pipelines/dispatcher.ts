import {
  findStage,
  nextStage,
  patchStateForStage,
  type PipelineDefinition,
  type StageDefinition,
  type StageId,
} from "@partyclipai/shared/types/pipeline";
import type { PatchState } from "@partyclipai/shared/types/patch";

/**
 * Pure decision function: given a pipeline, the patch's current state,
 * and the outcome of the most recent stage run, return the next action
 * the runtime should perform. No I/O, no clock — easy to unit-test.
 *
 * The runtime feeds the result into the executor + projection layer.
 * See docs/handoff/04_PIPELINE.md.
 */

export type StageOutcome =
  | { kind: "pass" }
  | { kind: "reject"; reasonCode: string }
  | { kind: "block"; reasonCode: string }
  | { kind: "defer" }
  | { kind: "transient_failure"; reasonCode: string }
  | { kind: "terminal_failure"; reasonCode: string };

export type DispatchAction =
  | { type: "run_stage"; stage: StageDefinition; patchState: PatchState }
  | { type: "operator_gate"; stage: StageDefinition }
  | { type: "publish" }
  | { type: "reject_to_drafting"; from: StageId; reasonCode: string }
  | { type: "kill"; reasonCode: string }
  | { type: "retry_stage"; stage: StageDefinition; nextAttempt: number; reasonCode: string }
  | { type: "wait" }
  | { type: "halt"; reason: string };

export interface DispatchInput {
  pipeline: PipelineDefinition;
  patchState: PatchState;
  /** The stage just completed. `null` for the initial dispatch on a brand-new patch. */
  currentStageId: StageId | null;
  /** Outcome of the just-completed stage. `null` for initial dispatch. */
  outcome: StageOutcome | null;
  /** Number of attempts already made on the current stage (1-based). */
  attempt: number;
  /** Aggregate cost incurred by this patch so far. */
  costTotal: number;
}

export function dispatch(input: DispatchInput): DispatchAction {
  const { pipeline, patchState, currentStageId, outcome, attempt, costTotal } = input;

  if (patchState === "PUBLISHED" || patchState === "REPEALED" || patchState === "KILLED") {
    return { type: "halt", reason: `Patch is ${patchState}` };
  }

  if (costTotal > pipeline.max_cost_per_patch) {
    return { type: "kill", reasonCode: "BUDGET_EXCEEDED" };
  }

  if (currentStageId === null || outcome === null) {
    const first = pipeline.stages[0];
    return { type: "run_stage", stage: first, patchState: patchStateForStage(first.id) };
  }

  const stage = findStage(pipeline, currentStageId);
  if (!stage) return { type: "halt", reason: `Unknown stage '${currentStageId}'` };

  if (outcome.kind === "transient_failure") {
    if (attempt < stage.retry_policy.max_attempts) {
      return { type: "retry_stage", stage, nextAttempt: attempt + 1, reasonCode: outcome.reasonCode };
    }
    return { type: "halt", reason: `stage ${stage.id} exhausted retries (${outcome.reasonCode})` };
  }

  if (outcome.kind === "terminal_failure") {
    if (outcome.reasonCode === "BUDGET_EXCEEDED") return { type: "kill", reasonCode: "BUDGET_EXCEEDED" };
    return { type: "halt", reason: `stage ${stage.id} terminal: ${outcome.reasonCode}` };
  }

  if (outcome.kind === "defer") return { type: "wait" };

  if (outcome.kind === "reject" && stage.on_reject) {
    return { type: "reject_to_drafting", from: stage.id, reasonCode: outcome.reasonCode };
  }
  if (outcome.kind === "block" && stage.on_block) {
    return { type: "reject_to_drafting", from: stage.id, reasonCode: outcome.reasonCode };
  }
  if (outcome.kind === "reject" || outcome.kind === "block") {
    return { type: "halt", reason: `stage ${stage.id} returned ${outcome.kind} but defines no fallback` };
  }

  // PASS — move forward
  const next = nextStage(pipeline, stage.id);
  if (!next) return { type: "halt", reason: `no stage after ${stage.id}` };

  if (next.gate === "operator") return { type: "operator_gate", stage: next };

  return { type: "run_stage", stage: next, patchState: patchStateForStage(next.id) };
}
