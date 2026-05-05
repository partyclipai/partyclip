import { describe, expect, it } from "vitest";
import {
  BudgetExceededError,
  StageTimeoutError,
  TerminalPipelineError,
  TransientPipelineError,
  classifyError,
  reasonCodeFor,
} from "./errors.js";

describe("error classifier", () => {
  it("respects explicit PipelineError classification", () => {
    expect(classifyError(new TransientPipelineError("x"))).toBe("transient");
    expect(classifyError(new TerminalPipelineError("x"))).toBe("terminal");
    expect(classifyError(new StageTimeoutError(1000))).toBe("transient");
    expect(classifyError(new BudgetExceededError(2, 1))).toBe("terminal");
  });

  it("classifies common transient signals heuristically", () => {
    for (const msg of ["ETIMEDOUT", "fetch failed: ECONNRESET", "got 429 rate-limit", "503 upstream"]) {
      expect(classifyError(new Error(msg))).toBe("transient");
    }
  });

  it("classifies unknown errors as terminal by default", () => {
    expect(classifyError(new Error("validation failed"))).toBe("terminal");
    expect(classifyError("not an error")).toBe("terminal");
  });

  it("surfaces reasonCode from typed errors", () => {
    expect(reasonCodeFor(new BudgetExceededError(2, 1))).toBe("BUDGET_EXCEEDED");
    expect(reasonCodeFor(new StageTimeoutError(1000))).toBe("STAGE_TIMEOUT");
    expect(reasonCodeFor(new Error("ETIMEDOUT"))).toBe("TRANSIENT_FAILURE");
    expect(reasonCodeFor(new Error("nope"))).toBe("TERMINAL_FAILURE");
  });
});
