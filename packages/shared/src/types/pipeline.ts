import { z } from "zod";
import { PATCH_CLASSIFICATIONS, PATCH_STATES, type PatchClassification, type PatchState } from "./patch.js";

/**
 * Pipeline definitions live in deployment YAML and route Patches through
 * a configured set of stages. See docs/handoff/04_PIPELINE.md.
 *
 * Phase 1 supports the seven canonical stages plus operator gates;
 * cabinet-vote stages are recognized in the schema but not activated
 * (Phase 1 is operator-sign-off-only — see plans/your-next-task-list-soft-lantern.md).
 */

export const STAGE_IDS = [
  "drafting",
  "critique",
  "risk_assess",
  "executor",
  "bias_mirror",
  "awaiting_signoff",
  "cabinet_vote",
] as const;
export type StageId = (typeof STAGE_IDS)[number];

const STAGE_TO_STATE: Record<StageId, PatchState> = {
  drafting: "DRAFTING",
  critique: "CRITIQUE",
  risk_assess: "RISK_ASSESS",
  executor: "EXECUTOR",
  bias_mirror: "BIAS_MIRROR",
  awaiting_signoff: "AWAITING_SIGNOFF",
  // Cabinet vote slots into the patch state machine via CRITIQUE-equivalent gating
  // when activated; for Phase 1 it never executes so the mapping is informational.
  cabinet_vote: "CRITIQUE",
};

export function patchStateForStage(stage: StageId): PatchState {
  return STAGE_TO_STATE[stage];
}

const stageIdSchema = z.enum(STAGE_IDS);

const onRejectSchema = z
  .object({
    goto: stageIdSchema,
    with_reason: z.boolean().default(true),
  })
  .strict();

const onBlockSchema = onRejectSchema;

const retryPolicySchema = z
  .object({
    max_attempts: z.number().int().min(1).max(5).default(2),
    /** Seconds. */
    initial_backoff: z.number().nonnegative().default(0),
  })
  .strict()
  .default({ max_attempts: 2, initial_backoff: 0 });

const stageDefinitionSchema = z
  .object({
    id: stageIdSchema,
    agent_role: z.string().trim().min(1).optional(),
    /** Operator-gated stages (awaiting_signoff) carry `gate: operator` and no agent_role. */
    gate: z.enum(["operator"]).optional(),
    decision: z.enum(["binary", "narrative"]).optional(),
    timeout_minutes: z.number().int().positive().max(24 * 60).default(30),
    retry_policy: retryPolicySchema,
    model: z.string().trim().min(1).optional(),
    on_reject: onRejectSchema.optional(),
    on_block: onBlockSchema.optional(),
    required_artifacts: z.array(z.string().trim().min(1)).default([]),
  })
  .strict()
  .superRefine((stage, ctx) => {
    const isOperatorGate = stage.gate === "operator";
    if (!isOperatorGate && !stage.agent_role) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["agent_role"],
        message: "agent_role is required for non-operator stages",
      });
    }
    if (isOperatorGate && stage.agent_role) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["agent_role"],
        message: "operator gates cannot specify agent_role",
      });
    }
  });

export const pipelineDefinitionSchema = z
  .object({
    id: z.string().trim().min(1).max(64).regex(/^[a-z0-9_-]+$/, "id must be kebab/snake"),
    name: z.string().trim().min(1),
    applies_to: z.array(z.enum(PATCH_CLASSIFICATIONS)).min(1),
    /** Maximum aggregate cost across all stage runs before the patch is killed. */
    max_cost_per_patch: z.number().positive().default(50),
    /** Days of operator inactivity at AWAITING_SIGNOFF after which generation pauses. */
    operator_inactivity_pause_days: z.number().int().positive().default(7),
    stages: z.array(stageDefinitionSchema).min(2),
  })
  .strict()
  .superRefine((pipeline, ctx) => {
    if (pipeline.stages[0]?.id !== "drafting") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stages", 0, "id"],
        message: "first stage must be 'drafting'",
      });
    }
    const last = pipeline.stages[pipeline.stages.length - 1];
    if (last?.gate !== "operator") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stages", pipeline.stages.length - 1, "gate"],
        message: "last stage must be an operator gate (awaiting_signoff)",
      });
    }
    const seen = new Set<StageId>();
    for (let i = 0; i < pipeline.stages.length; i += 1) {
      const stage = pipeline.stages[i];
      if (seen.has(stage.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["stages", i, "id"],
          message: `duplicate stage id '${stage.id}' in pipeline`,
        });
      }
      seen.add(stage.id);
    }
  });

export type PipelineDefinition = z.infer<typeof pipelineDefinitionSchema>;
export type StageDefinition = PipelineDefinition["stages"][number];
export type StageRetryPolicy = StageDefinition["retry_policy"];

export function pipelineAppliesTo(pipeline: PipelineDefinition, classification: PatchClassification): boolean {
  return pipeline.applies_to.includes(classification);
}

export function findStage(pipeline: PipelineDefinition, id: StageId): StageDefinition | undefined {
  return pipeline.stages.find((stage) => stage.id === id);
}

export function nextStage(pipeline: PipelineDefinition, currentId: StageId): StageDefinition | undefined {
  const idx = pipeline.stages.findIndex((stage) => stage.id === currentId);
  if (idx < 0 || idx >= pipeline.stages.length - 1) return undefined;
  return pipeline.stages[idx + 1];
}

export const ALL_PATCH_STATES = PATCH_STATES;
