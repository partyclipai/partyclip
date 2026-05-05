/**
 * Pipeline error taxonomy. Transient errors are subject to the stage's
 * retry policy; terminal errors fail the stage immediately. Budget and
 * timeout violations have their own dedicated subclasses so callers can
 * pattern-match for control-flow decisions (kill vs. retry vs. reject).
 *
 * See docs/handoff/04_PIPELINE.md "Stage cost & retry policy".
 */

export type ErrorClassification = "transient" | "terminal";

export class PipelineError extends Error {
  public readonly classification: ErrorClassification;
  public readonly reasonCode: string;

  constructor(message: string, classification: ErrorClassification, reasonCode: string) {
    super(message);
    this.name = this.constructor.name;
    this.classification = classification;
    this.reasonCode = reasonCode;
  }
}

export class TransientPipelineError extends PipelineError {
  constructor(message: string, reasonCode = "TRANSIENT_FAILURE") {
    super(message, "transient", reasonCode);
  }
}

export class TerminalPipelineError extends PipelineError {
  constructor(message: string, reasonCode = "TERMINAL_FAILURE") {
    super(message, "terminal", reasonCode);
  }
}

/** Stage exceeded its configured wall-clock budget. Treated as transient by default. */
export class StageTimeoutError extends TransientPipelineError {
  constructor(public readonly timeoutMs: number) {
    super(`Stage timed out after ${timeoutMs}ms`, "STAGE_TIMEOUT");
  }
}

/** Patch exceeded the pipeline's max_cost_per_patch. Always terminal — sends patch to KILLED. */
export class BudgetExceededError extends TerminalPipelineError {
  constructor(public readonly spent: number, public readonly cap: number) {
    super(`Patch cost ${spent.toFixed(4)} exceeds cap ${cap.toFixed(4)}`, "BUDGET_EXCEEDED");
  }
}

/**
 * Heuristic classifier for unexpected errors raised inside an agent run.
 * Network/timeout/rate-limit signals → transient (retryable). Anything
 * else → terminal. Callers can override by raising a typed error directly.
 */
export function classifyError(err: unknown): ErrorClassification {
  if (err instanceof PipelineError) return err.classification;
  if (!(err instanceof Error)) return "terminal";
  const msg = err.message.toLowerCase();
  const transientHints = [
    "etimedout",
    "econnreset",
    "econnrefused",
    "socket hang up",
    "network",
    "timeout",
    "rate limit",
    "rate-limit",
    "429",
    "503",
    "502",
    "504",
  ];
  return transientHints.some((hint) => msg.includes(hint)) ? "transient" : "terminal";
}

export function reasonCodeFor(err: unknown): string {
  if (err instanceof PipelineError) return err.reasonCode;
  return classifyError(err) === "transient" ? "TRANSIENT_FAILURE" : "TERMINAL_FAILURE";
}
