import { z } from "zod";
import { ACTIVATION_MODES, AGENT_ROLES } from "./agent-role.js";
import { STAGE_IDS } from "./pipeline.js";

/**
 * Per-deployment agent configuration. Defines how a single agent
 * instance activates, which constitution + persona it loads, and which
 * model it talks to. See docs/handoff/08_AGENT_FRAMEWORK.md.
 */

const cronExprSchema = z
  .string()
  .trim()
  .regex(/^[\s\S]+$/, "cron must be a non-empty string");

const triggerSubscriptionSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[a-z0-9_]+(\.[a-z0-9_]+)*(\.\*)?$/, "trigger subscription must be dotted, optionally ending in .*");

export const agentConfigSchema = z
  .object({
    id: z.string().trim().min(1).max(64).regex(/^[a-z0-9_-]+$/, "id must be kebab/snake"),
    role: z.enum(AGENT_ROLES),
    activation_mode: z.enum(ACTIVATION_MODES).default("TRIGGER_ONLY"),
    schedule: cronExprSchema.optional(),
    triggers: z.array(triggerSubscriptionSchema).default([]),
    /** Reference to a persona file in the deployment content repo. */
    persona_ref: z.string().trim().min(1),
    /** Reference to the constitution path in the deployment content repo. */
    constitution_ref: z.string().trim().min(1).default("constitution/"),
    /** Default model for this agent across all stages it handles. */
    model: z.string().trim().min(1),
    /** Per-stage model overrides. */
    model_overrides: z.record(z.enum(STAGE_IDS), z.string().trim().min(1)).optional(),
    /** Tools the plugin SDK exposes to this agent. Empty = none. */
    tools: z.array(z.string().trim().min(1)).default([]),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    const isScheduled = cfg.activation_mode === "SCHEDULED" || cfg.activation_mode === "SCHEDULED_AND_TRIGGER";
    if (isScheduled && !cfg.schedule) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["schedule"],
        message: "schedule is required when activation_mode is SCHEDULED or SCHEDULED_AND_TRIGGER",
      });
    }
    const usesTriggers = cfg.activation_mode === "TRIGGER_ONLY" || cfg.activation_mode === "SCHEDULED_AND_TRIGGER";
    if (usesTriggers && cfg.triggers.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["triggers"],
        message: "trigger-driven agents must declare at least one trigger subscription",
      });
    }
  });

export type AgentConfig = z.infer<typeof agentConfigSchema>;

export function modelForStage(cfg: AgentConfig, stageId: (typeof STAGE_IDS)[number]): string {
  return cfg.model_overrides?.[stageId] ?? cfg.model;
}
