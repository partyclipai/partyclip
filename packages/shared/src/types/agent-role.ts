/**
 * Generic role kinds defined by the partyclip core. The number of
 * instances, their personas, their constitutions, and their model
 * assignments are content/config — see docs/handoff/08_AGENT_FRAMEWORK.md.
 */

export const AGENT_ROLES = [
  "Architect",
  "Critic",
  "Legal",
  "Executor",
  "BiasMirror",
  "Spokesperson",
  "Head",
  "Analyst",
  "ForumIngestor",
  "NewsIngestor",
  "GovActionMonitor",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

/** Roles required to drive a patch through the Phase 1 pipeline to PUBLISHED. */
export const PHASE_1_ROLES: readonly AgentRole[] = [
  "Architect",
  "Critic",
  "Legal",
  "Executor",
  "BiasMirror",
] as const;

export const ACTIVATION_MODES = [
  "TRIGGER_ONLY",
  "SCHEDULED",
  "SCHEDULED_AND_TRIGGER",
  "REACTIVE",
] as const;
export type ActivationMode = (typeof ACTIVATION_MODES)[number];

export function isAgentRole(value: unknown): value is AgentRole {
  return typeof value === "string" && (AGENT_ROLES as readonly string[]).includes(value);
}
