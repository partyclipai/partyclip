import type { AgentConfig } from "@partyclipai/shared/types/agent-config";
import type { AgentRole } from "@partyclipai/shared/types/agent-role";
import type { StageId } from "@partyclipai/shared/types/pipeline";
import type {
  AgentRunInput,
  AgentRunResult,
  AgentRunner,
} from "../pipelines/executor.js";
import { TerminalPipelineError } from "../pipelines/errors.js";
import {
  buildAgentEnvelope,
  type AgentEnvelope,
  type AgentTool,
  type ConstitutionArticleRef,
  type InputArtifact,
  type PatchView,
} from "./envelope.js";
import { assertValidResponse, type ModelAdapter } from "./model-adapter.js";
import { parseRoleOutput } from "./role-parsers.js";

/**
 * The AgentRunner the pipeline executor (Stage 2) depends on. Loads the
 * envelope ingredients via injected providers, builds the envelope,
 * invokes the model adapter, and parses output through the role's
 * structured-output parser. Stage 4 (BiasMirror persistence) and the
 * runtime wiring (database-backed providers) layer on top.
 *
 * Providers are injected (no global lookups, no module-time DB
 * connections) so the runner is fully testable in isolation.
 */

export interface AgentRunnerProviders {
  readonly modelAdapter: ModelAdapter;
  loadAgent(role: AgentRole, companyId: string): Promise<AgentConfig>;
  loadPersona(agent: AgentConfig): Promise<string>;
  loadConstitution(companyId: string): Promise<ReadonlyArray<ConstitutionArticleRef>>;
  loadPatch(patchId: string, companyId: string): Promise<PatchView>;
  loadInputArtifacts(input: { patchId: string; companyId: string; stage: StageId }): Promise<ReadonlyArray<InputArtifact>>;
  /** Returns *only* tools the deployment has explicitly granted to the agent role. */
  resolveToolset(agent: AgentConfig): Promise<ReadonlyArray<AgentTool>>;
}

export interface AgentRunnerOptions {
  /** Default cap to pass through to the model adapter. */
  maxOutputTokens?: number;
}

export function createAgentRunner(
  providers: AgentRunnerProviders,
  options: AgentRunnerOptions = {},
): AgentRunner {
  const maxOutputTokens = options.maxOutputTokens ?? 2048;

  return {
    async run(input: AgentRunInput): Promise<AgentRunResult> {
      const stageRole = (input.stage.agent_role ?? "") as AgentRole;
      if (!stageRole) {
        throw new TerminalPipelineError(
          `Stage '${input.stage.id}' has no agent_role; cannot dispatch`,
          "MISCONFIGURED_STAGE",
        );
      }
      const agent = await providers.loadAgent(stageRole, input.companyId);
      if (agent.role !== stageRole) {
        throw new TerminalPipelineError(
          `Agent '${agent.id}' role mismatch: config=${agent.role} stage=${stageRole}`,
          "AGENT_ROLE_MISMATCH",
        );
      }
      const [persona, constitution, patch, inputArtifacts, toolset] = await Promise.all([
        providers.loadPersona(agent),
        providers.loadConstitution(input.companyId),
        providers.loadPatch(input.patchId, input.companyId),
        providers.loadInputArtifacts({
          patchId: input.patchId,
          companyId: input.companyId,
          stage: input.stage.id,
        }),
        providers.resolveToolset(agent),
      ]);

      const envelope = buildAgentEnvelope({
        agent,
        stage: input.stage.id,
        persona,
        constitution,
        patch,
        inputArtifacts,
        toolset,
      });

      const { systemPrompt, userPrompt } = renderPrompts(envelope);

      const response = await providers.modelAdapter.invoke({
        envelope,
        systemPrompt,
        userPrompt,
        maxOutputTokens,
      });
      assertValidResponse(response);

      const parsed = parseRoleOutput(stageRole, response.text);

      return {
        outcome: parsed.outcome,
        cost: response.cost,
        output: {
          ...parsed.artifact,
          model_used: response.modelUsed,
          attempt: input.attempt,
          prompt_tokens: response.promptTokens,
          completion_tokens: response.completionTokens,
        },
        model: response.modelUsed,
      };
    },
  };
}

function renderPrompts(envelope: AgentEnvelope): { systemPrompt: string; userPrompt: string } {
  const constitution = envelope.constitution
    .map((a) => `[${a.stableId} v${a.version}] ${a.title}\n${a.body}`)
    .join("\n\n---\n\n");

  const systemPrompt = [
    `You are the ${envelope.role} for stage '${envelope.stage}'.`,
    `Persona:\n${envelope.persona.trim()}`,
    `Constitution (cite by stable_id; do not paraphrase as your own):\n${constitution || "(empty)"}`,
    "Output strictly the JSON envelope your role contract specifies. Do not include free-text.",
  ].join("\n\n");

  const artifactBlock = envelope.inputArtifacts.length
    ? envelope.inputArtifacts
        .map((art) => `<<artifact id=${art.id} kind=${art.kind}>>\n${art.contentText ?? JSON.stringify(art.content)}`)
        .join("\n\n")
    : "(no input artifacts)";

  const userPrompt = [
    `Patch ${envelope.patch.id} (${envelope.patch.classification}): ${envelope.patch.title}`,
    `Body:\n${envelope.patch.body || "(empty)"}`,
    `Citations: ${JSON.stringify(envelope.patch.citations)}`,
    `Input artifacts:\n${artifactBlock}`,
  ].join("\n\n");

  return { systemPrompt, userPrompt };
}
