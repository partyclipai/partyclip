import { logger } from "../../middleware/logger.js";

/**
 * Correlation helpers for partyclip pipeline observability. Every log
 * entry that originates from a patch run should carry `patch_id` and
 * `stage_run_id` so operators can trace a single run end-to-end across
 * the dispatcher, executor, agent runner, and projection layers.
 *
 * Pure wrapper over the existing pino logger — no new logging
 * infrastructure, just a typed correlation context that callers
 * thread through.
 */

export interface PatchCorrelation {
  readonly patchId: string;
  readonly stageRunId?: string;
  readonly stage?: string;
  readonly companyId?: string;
}

export type Logger = ReturnType<typeof logger.child>;

export function patchLogger(corr: PatchCorrelation): Logger {
  return logger.child({
    patch_id: corr.patchId,
    stage_run_id: corr.stageRunId,
    stage: corr.stage,
    company_id: corr.companyId,
  });
}
