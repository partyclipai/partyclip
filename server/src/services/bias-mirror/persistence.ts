import {
  biasReportSchema,
  computeFieldFillRates,
  type BiasFieldFillRates,
  type BiasReport,
} from "@partyclipai/shared/types/bias-report";

/**
 * Translates a parsed BiasMirror artifact (from role-parsers.ts) into
 * the row shapes expected by the bias_reports + bias_findings tables.
 * Pure function — the runtime layer (Stage 5+) handles the actual
 * INSERTs, transactional with the PatchStageRun row, so projection
 * and write paths stay in lock-step.
 */

export interface BiasReportInsert {
  patchId: string;
  companyId: string;
  stageRunId: string;
  overallDecision: BiasReport["decision"];
}

export interface BiasFindingInsert {
  companyId: string;
  // reportId is filled in by the runtime once the bias_reports row is inserted.
  category: string;
  severity: string;
  quote: string;
  explanation: string;
  suggestion: string;
}

export interface BiasMirrorPersistencePlan {
  report: BiasReportInsert;
  findings: BiasFindingInsert[];
  fillRates: BiasFieldFillRates;
}

export interface BuildPlanInput {
  patchId: string;
  companyId: string;
  stageRunId: string;
  /** The `output` field on AgentRunResult (parsed BiasMirror artifact). */
  artifact: Record<string, unknown>;
}

export class InvalidBiasArtifactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidBiasArtifactError";
  }
}

/**
 * Reconstructs the BiasReport from the artifact and produces row inserts.
 * The artifact format matches what role-parsers.ts emits:
 *   { kind: "bias_report", decision, findings: [...] }
 */
export function buildBiasMirrorPersistencePlan(input: BuildPlanInput): BiasMirrorPersistencePlan {
  const candidate = {
    decision: input.artifact.decision,
    findings: Array.isArray(input.artifact.findings) ? input.artifact.findings : [],
  };
  const result = biasReportSchema.safeParse(candidate);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new InvalidBiasArtifactError(
      `bias artifact rejected at ${first?.path.join(".") ?? "<root>"}: ${first?.message ?? "unknown"}`,
    );
  }
  const report = result.data;

  return {
    report: {
      patchId: input.patchId,
      companyId: input.companyId,
      stageRunId: input.stageRunId,
      overallDecision: report.decision,
    },
    findings: report.findings.map((f) => ({
      companyId: input.companyId,
      category: f.category,
      severity: f.severity,
      quote: f.quote,
      explanation: f.explanation,
      suggestion: f.suggestion,
    })),
    fillRates: computeFieldFillRates(report),
  };
}

/**
 * Telemetry attribute payload for an emitted bias-mirror run, for
 * observability sinks that want to record fill-rates as gauges.
 */
export function fillRateAttributes(rates: BiasFieldFillRates): Record<string, number> {
  return {
    "bias_mirror.findings_total": rates.totalFindings,
    "bias_mirror.quote_filled": rates.quoteFilled,
    "bias_mirror.suggestion_filled": rates.suggestionFilled,
    "bias_mirror.both_filled_ratio": Number(rates.bothFilledRatio.toFixed(4)),
  };
}
