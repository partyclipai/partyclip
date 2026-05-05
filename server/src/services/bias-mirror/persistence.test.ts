import { describe, expect, it } from "vitest";
import {
  buildBiasMirrorPersistencePlan,
  fillRateAttributes,
  InvalidBiasArtifactError,
} from "./persistence.js";

const VALID_ARTIFACT = {
  kind: "bias_report",
  decision: "FLAG",
  findings: [
    {
      category: "tone-drift",
      severity: "MEDIUM",
      quote: "this is bad",
      explanation: "framing",
      suggestion: "soften",
    },
    {
      category: "linguistic",
      severity: "LOW",
      quote: "",
      explanation: "minor",
      suggestion: "",
    },
  ],
};

describe("buildBiasMirrorPersistencePlan", () => {
  it("translates a parsed artifact into row inserts and fill rates", () => {
    const plan = buildBiasMirrorPersistencePlan({
      patchId: "p-1",
      companyId: "c-1",
      stageRunId: "r-1",
      artifact: VALID_ARTIFACT,
    });
    expect(plan.report).toEqual({
      patchId: "p-1",
      companyId: "c-1",
      stageRunId: "r-1",
      overallDecision: "FLAG",
    });
    expect(plan.findings).toHaveLength(2);
    expect(plan.findings[0]).toEqual({
      companyId: "c-1",
      category: "tone-drift",
      severity: "MEDIUM",
      quote: "this is bad",
      explanation: "framing",
      suggestion: "soften",
    });
    expect(plan.fillRates.totalFindings).toBe(2);
    expect(plan.fillRates.quoteFilled).toBe(1);
    expect(plan.fillRates.suggestionFilled).toBe(1);
    expect(plan.fillRates.bothFilledRatio).toBeCloseTo(0.5);
  });

  it("rejects artifacts that fail BiasReport validation", () => {
    expect(() =>
      buildBiasMirrorPersistencePlan({
        patchId: "p-1",
        companyId: "c-1",
        stageRunId: "r-1",
        artifact: { kind: "bias_report", decision: "BLOCK", findings: [] },
      }),
    ).toThrow(InvalidBiasArtifactError);
  });

  it("rejects unknown decisions", () => {
    expect(() =>
      buildBiasMirrorPersistencePlan({
        patchId: "p-1",
        companyId: "c-1",
        stageRunId: "r-1",
        artifact: { kind: "bias_report", decision: "MAYBE", findings: [] },
      }),
    ).toThrow(InvalidBiasArtifactError);
  });

  it("emits telemetry attributes with rounded ratio", () => {
    const plan = buildBiasMirrorPersistencePlan({
      patchId: "p-1",
      companyId: "c-1",
      stageRunId: "r-1",
      artifact: VALID_ARTIFACT,
    });
    const attrs = fillRateAttributes(plan.fillRates);
    expect(attrs["bias_mirror.findings_total"]).toBe(2);
    expect(attrs["bias_mirror.both_filled_ratio"]).toBe(0.5);
  });
});
