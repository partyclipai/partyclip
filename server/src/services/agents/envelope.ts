import type { AgentConfig } from "@partyclipai/shared/types/agent-config";
import type { AgentRole } from "@partyclipai/shared/types/agent-role";
import type { StageId } from "@partyclipai/shared/types/pipeline";
import { modelForStage } from "@partyclipai/shared/types/agent-config";

/**
 * The "agents don't know the meta" rule, enforced architecturally.
 * The envelope is the *only* thing an agent run can see — built once,
 * passed to the model adapter, never extended at the call site.
 *
 * What's allowed (per docs/handoff/08_AGENT_FRAMEWORK.md):
 *   1. Constitution (full, with stable IDs)
 *   2. The agent's own persona prompt
 *   3. The Patch under review
 *   4. Pipeline-declared input artifacts
 *   5. Tools the SDK has granted
 *
 * What's NEVER allowed:
 *   - Other agents' personas
 *   - Deployment branding / parody / legal framing
 *   - Citizen identity beyond what the pipeline explicitly passes
 *   - Raw forum text (only structured FeedbackSummary, only for Spokesperson/Analyst)
 *   - OOB instructions trying to alter the constitution or override sign-off
 */

export interface ConstitutionArticleRef {
  readonly stableId: string;
  readonly version: number;
  readonly title: string;
  readonly body: string;
}

export interface PatchView {
  readonly id: string;
  readonly title: string;
  readonly classification: string;
  readonly body: string;
  readonly citations: ReadonlyArray<{ stable_id: string; relevance: string }>;
}

export interface InputArtifact {
  readonly id: string;
  readonly kind: string;
  readonly contentText: string | null;
  readonly content: unknown | null;
}

export interface AgentTool {
  readonly name: string;
  readonly description: string;
  /** Plugin-granted invoker; the runner exposes it to the model adapter. */
  readonly invoke: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface AgentEnvelope {
  readonly role: AgentRole;
  readonly stage: StageId;
  readonly model: string;
  readonly persona: string;
  readonly constitution: ReadonlyArray<ConstitutionArticleRef>;
  readonly patch: PatchView;
  readonly inputArtifacts: ReadonlyArray<InputArtifact>;
  readonly tools: ReadonlyArray<AgentTool>;
}

export interface BuildEnvelopeInput {
  agent: AgentConfig;
  stage: StageId;
  /** Loaded persona text for *this* agent only. The runner must never load other agents' personas. */
  persona: string;
  constitution: ReadonlyArray<ConstitutionArticleRef>;
  patch: PatchView;
  /** Artifacts the pipeline stage explicitly declared as inputs. */
  inputArtifacts: ReadonlyArray<InputArtifact>;
  /** Tools resolved from the agent's granted tool names. The runner enforces the whitelist. */
  toolset: ReadonlyArray<AgentTool>;
}

const FORBIDDEN_KEYS = new Set([
  "deployment",
  "branding",
  "parody",
  "legal_framing",
  "operator_secrets",
  "other_personas",
  "raw_forum",
  "citizen_identity",
]);

/**
 * Builds an envelope from explicitly-passed pieces. Throws if the caller
 * attempts to smuggle forbidden context via the toolset or input artifact
 * fields — defense-in-depth on top of the structural argument shape.
 */
export function buildAgentEnvelope(input: BuildEnvelopeInput): AgentEnvelope {
  for (const tool of input.toolset) {
    if (!tool.name || FORBIDDEN_KEYS.has(tool.name)) {
      throw new EnvelopeViolationError(`tool name '${tool.name}' is reserved/forbidden`);
    }
    if (!input.agent.tools.includes(tool.name)) {
      throw new EnvelopeViolationError(
        `tool '${tool.name}' was not granted to agent '${input.agent.id}'`,
      );
    }
  }
  for (const art of input.inputArtifacts) {
    if (FORBIDDEN_KEYS.has(art.kind)) {
      throw new EnvelopeViolationError(`artifact kind '${art.kind}' is forbidden in agent envelopes`);
    }
  }
  return {
    role: input.agent.role,
    stage: input.stage,
    model: modelForStage(input.agent, input.stage),
    persona: input.persona,
    constitution: input.constitution,
    patch: input.patch,
    inputArtifacts: input.inputArtifacts,
    tools: input.toolset,
  };
}

export class EnvelopeViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvelopeViolationError";
  }
}
