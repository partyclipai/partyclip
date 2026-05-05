import { describe, expect, it } from "vitest";
import {
  biasReportSchema,
  computeFieldFillRates,
  type BiasReport,
} from "./bias-report.js";

const FINDING = {
  category: "tone-drift" as const,
  severity: "MEDIUM" as const,
  quote: "we will crush",
  explanation: "Aggressive framing.",
  suggestion: "Use neutral verbs.",
};

describe("biasReportSchema", () => {
  it("accepts a PASS report with no findings", () => {
    expect(biasReportSchema.safeParse({ decision: "PASS", findings: [] }).success).toBe(true);
  });

  it("accepts a FLAG with findings", () => {
    expect(biasReportSchema.safeParse({ decision: "FLAG", findings: [FINDING] }).success).toBe(true);
  });

  it("rejects BLOCK with no findings (must be reviewable)", () => {
    expect(biasReportSchema.safeParse({ decision: "BLOCK", findings: [] }).success).toBe(false);
  });

  it("rejects PASS containing HIGH-severity findings", () => {
    const bad = {
      decision: "PASS",
      findings: [{ ...FINDING, severity: "HIGH" }],
    };
    expect(biasReportSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown category", () => {
    const bad = { decision: "FLAG", findings: [{ ...FINDING, category: "vibes" }] };
    expect(biasReportSchema.safeParse(bad).success).toBe(false);
  });

  it("defaults missing text fields to empty string", () => {
    const sparse = {
      decision: "FLAG",
      findings: [{ category: "linguistic", severity: "LOW" }],
    };
    const parsed = biasReportSchema.parse(sparse);
    expect(parsed.findings[0].quote).toBe("");
    expect(parsed.findings[0].suggestion).toBe("");
  });
});

describe("computeFieldFillRates", () => {
  it("returns zeros on empty report", () => {
    const rates = computeFieldFillRates({ decision: "PASS", findings: [] });
    expect(rates).toEqual({ totalFindings: 0, quoteFilled: 0, suggestionFilled: 0, bothFilledRatio: 0 });
  });

  it("counts non-empty quote and suggestion separately", () => {
    const report: BiasReport = {
      decision: "FLAG",
      findings: [
        { ...FINDING, quote: "x", suggestion: "y" },
        { ...FINDING, quote: "x", suggestion: "" },
        { ...FINDING, quote: "", suggestion: "" },
      ],
    };
    const rates = computeFieldFillRates(report);
    expect(rates.totalFindings).toBe(3);
    expect(rates.quoteFilled).toBe(2);
    expect(rates.suggestionFilled).toBe(1);
    expect(rates.bothFilledRatio).toBeCloseTo(1 / 3, 4);
  });

  it("treats whitespace-only fields as empty", () => {
    const report: BiasReport = {
      decision: "FLAG",
      findings: [{ ...FINDING, quote: "  ", suggestion: "\t\n" }],
    };
    const rates = computeFieldFillRates(report);
    expect(rates.quoteFilled).toBe(0);
    expect(rates.suggestionFilled).toBe(0);
  });
});
