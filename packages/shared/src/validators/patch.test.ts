import { describe, expect, it } from "vitest";
import {
  IllegalTransitionError,
  assertLegalTransition,
  createPatchInputSchema,
  patchCitationSchema,
} from "./patch.js";

describe("patch state machine", () => {
  it("accepts the canonical happy path", () => {
    const path: Array<[string, string]> = [
      ["DRAFTING", "CRITIQUE"],
      ["CRITIQUE", "RISK_ASSESS"],
      ["RISK_ASSESS", "EXECUTOR"],
      ["EXECUTOR", "BIAS_MIRROR"],
      ["BIAS_MIRROR", "AWAITING_SIGNOFF"],
      ["AWAITING_SIGNOFF", "PUBLISHED"],
    ];
    for (const [from, to] of path) {
      expect(() => assertLegalTransition(from as never, to as never, "forward")).not.toThrow();
    }
  });

  it("allows rejection back to DRAFTING from any post-DRAFTING reviewable stage", () => {
    for (const from of ["CRITIQUE", "RISK_ASSESS", "EXECUTOR", "BIAS_MIRROR"] as const) {
      expect(() => assertLegalTransition(from, "DRAFTING", "reject")).not.toThrow();
    }
  });

  it("blocks rejection from AWAITING_SIGNOFF (operator-only stage)", () => {
    expect(() => assertLegalTransition("AWAITING_SIGNOFF", "DRAFTING", "reject")).toThrow(IllegalTransitionError);
  });

  it("blocks skipping stages", () => {
    expect(() => assertLegalTransition("DRAFTING", "EXECUTOR", "forward")).toThrow(IllegalTransitionError);
  });

  it("blocks transitions out of terminal states", () => {
    expect(() => assertLegalTransition("KILLED", "DRAFTING", "forward")).toThrow(IllegalTransitionError);
    expect(() => assertLegalTransition("REPEALED", "PUBLISHED", "forward")).toThrow(IllegalTransitionError);
  });

  it("permits KILL from any non-terminal state", () => {
    for (const from of ["DRAFTING", "CRITIQUE", "RISK_ASSESS", "EXECUTOR", "BIAS_MIRROR", "AWAITING_SIGNOFF"] as const) {
      expect(() => assertLegalTransition(from, "KILLED", "kill")).not.toThrow();
    }
    expect(() => assertLegalTransition("PUBLISHED", "KILLED", "kill")).toThrow(IllegalTransitionError);
  });

  it("permits REPEAL only from PUBLISHED", () => {
    expect(() => assertLegalTransition("PUBLISHED", "REPEALED", "repeal")).not.toThrow();
    expect(() => assertLegalTransition("DRAFTING", "REPEALED", "repeal")).toThrow(IllegalTransitionError);
  });
});

describe("patch input schema", () => {
  it("requires a non-empty title", () => {
    expect(createPatchInputSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("defaults classification to REGULAR", () => {
    const parsed = createPatchInputSchema.parse({ title: "x" });
    expect(parsed.classification).toBe("REGULAR");
  });

  it("rejects unknown citation relevance", () => {
    expect(
      patchCitationSchema.safeParse({ stable_id: "CONST-K1-A1", relevance: "neutral" }).success,
    ).toBe(false);
  });
});
