import type { StageDefinition } from "@partyclipai/shared/types/pipeline";
import {
  BudgetExceededError,
  PipelineError,
  StageTimeoutError,
  TransientPipelineError,
  classifyError,
  reasonCodeFor,
} from "./errors.js";
import type { StageOutcome } from "./dispatcher.js";

/**
 * Single-stage executor. Dependency-injects the agent runner so the
 * pipeline engine stays decoupled from the agent framework (Stage 3).
 * Tests pass a fake runner; production wires the real one.
 *
 * Responsibilities:
 *   - apply per-stage timeout
 *   - apply per-stage retry policy on transient failures
 *   - measure wall-clock duration
 *   - aggregate token cost and enforce max_cost_per_patch
 *   - return a StageRunResult that the caller persists + dispatches on
 */

export interface AgentRunInput {
  patchId: string;
  companyId: string;
  stage: StageDefinition;
  attempt: number;
  /** Hand-off context (input artifact ids, prior decisions). The agent framework owns the shape. */
  context: Record<string, unknown>;
}

export interface AgentRunResult {
  /** Decision the agent reports for this stage. */
  outcome: Exclude<StageOutcome, { kind: "transient_failure" } | { kind: "terminal_failure" }>;
  /** Cost incurred this run, in the same scale as Patch.cost_total. */
  cost: number;
  /** Free-form provenance. Persisted into the resulting Artifact. */
  output: Record<string, unknown>;
  /** Model identifier actually used. */
  model: string | null;
}

export interface AgentRunner {
  run(input: AgentRunInput): Promise<AgentRunResult>;
}

export interface StageRunResult {
  outcome: StageOutcome;
  cost: number;
  durationMs: number;
  attempts: number;
  output: Record<string, unknown> | null;
  model: string | null;
}

export interface StageExecutorDeps {
  runner: AgentRunner;
  /** Returns a millisecond timestamp; injected for deterministic tests. */
  now?: () => number;
  /** Returns the patch's cost total *prior* to this run (for cap enforcement). */
  costSoFar: number;
  /** Pipeline-level cap. Cross → BudgetExceededError. */
  maxCostPerPatch: number;
}

export async function executeStage(
  input: AgentRunInput,
  deps: StageExecutorDeps,
): Promise<StageRunResult> {
  const now = deps.now ?? (() => Date.now());
  const start = now();
  const timeoutMs = input.stage.timeout_minutes * 60_000;
  const maxAttempts = input.stage.retry_policy.max_attempts;

  let attempt = 0;
  let lastError: unknown = null;
  let totalCost = 0;
  let model: string | null = null;
  let output: Record<string, unknown> | null = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    const attemptStart = now();
    try {
      const result = await withTimeout(
        deps.runner.run({ ...input, attempt }),
        timeoutMs,
        () => now() - attemptStart,
      );

      totalCost += Math.max(0, result.cost);
      model = result.model;
      output = result.output;

      const projected = deps.costSoFar + totalCost;
      if (projected > deps.maxCostPerPatch) {
        throw new BudgetExceededError(projected, deps.maxCostPerPatch);
      }

      return {
        outcome: result.outcome,
        cost: totalCost,
        durationMs: now() - start,
        attempts: attempt,
        output,
        model,
      };
    } catch (err) {
      lastError = err;
      if (err instanceof BudgetExceededError) {
        return {
          outcome: { kind: "terminal_failure", reasonCode: err.reasonCode },
          cost: totalCost,
          durationMs: now() - start,
          attempts: attempt,
          output,
          model,
        };
      }
      const cls = classifyError(err);
      if (cls === "terminal" || attempt >= maxAttempts) break;
      // transient — loop and retry
    }
  }

  return {
    outcome: {
      kind: classifyError(lastError) === "transient" ? "transient_failure" : "terminal_failure",
      reasonCode: reasonCodeFor(lastError),
    },
    cost: totalCost,
    durationMs: now() - start,
    attempts: attempt,
    output,
    model,
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  elapsed: () => number,
): Promise<T> {
  if (timeoutMs <= 0) return promise;
  let handle: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    handle = setTimeout(() => {
      reject(new StageTimeoutError(elapsed()));
    }, timeoutMs);
    handle.unref?.();
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (handle) clearTimeout(handle);
  }
}

/** Convenience for callers: surface PipelineError reason codes when persisting. */
export function reasonCodeFromOutcome(outcome: StageOutcome): string | null {
  if (outcome.kind === "pass" || outcome.kind === "defer") return null;
  return outcome.reasonCode;
}

export { PipelineError };
