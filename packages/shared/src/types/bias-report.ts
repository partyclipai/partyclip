import { z } from "zod";

/**
 * Bias Mirror output schema. The five categories are core (set by
 * partyclip itself) — deployments can extend in future via plugin.
 * See docs/handoff/03_DATA_MODEL.md (BiasReport, BiasFinding) and
 * docs/handoff/05_GOVERNANCE.md.
 */

export const BIAS_CATEGORIES = [
  "cultural-default",
  "linguistic",
  "constitutional-misalignment",
  "epistemic-overconfidence",
  "tone-drift",
] as const;
export type BiasCategory = (typeof BIAS_CATEGORIES)[number];

export const BIAS_SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type BiasSeverity = (typeof BIAS_SEVERITIES)[number];

export const BIAS_DECISIONS = ["PASS", "FLAG", "BLOCK"] as const;
export type BiasDecision = (typeof BIAS_DECISIONS)[number];

export const biasFindingSchema = z
  .object({
    category: z.enum(BIAS_CATEGORIES),
    severity: z.enum(BIAS_SEVERITIES),
    quote: z.string().default(""),
    explanation: z.string().default(""),
    suggestion: z.string().default(""),
  })
  .strict();

export type BiasFinding = z.infer<typeof biasFindingSchema>;

export const biasReportSchema = z
  .object({
    decision: z.enum(BIAS_DECISIONS),
    findings: z.array(biasFindingSchema).default([]),
  })
  .strict()
  .superRefine((report, ctx) => {
    if (report.decision === "BLOCK" && report.findings.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["findings"],
        message: "BLOCK decisions must include at least one finding to be reviewable",
      });
    }
    const hasHigh = report.findings.some((f) => f.severity === "HIGH");
    if (hasHigh && report.decision === "PASS") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["decision"],
        message: "PASS is incompatible with HIGH-severity findings; use FLAG or BLOCK",
      });
    }
  });

export type BiasReport = z.infer<typeof biasReportSchema>;

/**
 * Field-fill-rate metric. Tracks the percentage of findings whose
 * `quote` and `suggestion` text fields are non-empty. The Phase 1
 * baseline; if rates stay low we know the BiasMirror persona prompt
 * needs work. Surfaced via observability — see plans/.../soft-lantern.md.
 */
export interface BiasFieldFillRates {
  totalFindings: number;
  quoteFilled: number;
  suggestionFilled: number;
  /** Convenience: 0..1, both fields filled. */
  bothFilledRatio: number;
}

export function computeFieldFillRates(report: BiasReport): BiasFieldFillRates {
  const total = report.findings.length;
  if (total === 0) {
    return { totalFindings: 0, quoteFilled: 0, suggestionFilled: 0, bothFilledRatio: 0 };
  }
  let quote = 0;
  let suggestion = 0;
  let both = 0;
  for (const f of report.findings) {
    const q = f.quote.trim().length > 0;
    const s = f.suggestion.trim().length > 0;
    if (q) quote += 1;
    if (s) suggestion += 1;
    if (q && s) both += 1;
  }
  return {
    totalFindings: total,
    quoteFilled: quote,
    suggestionFilled: suggestion,
    bothFilledRatio: both / total,
  };
}
