import { and, asc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import type { Db } from "@partyclipai/db";
import { artifacts, patches, patchStageRuns } from "@partyclipai/db";
import type { AgentConfig } from "@partyclipai/shared/types/agent-config";
import type { StageId } from "@partyclipai/shared/types/pipeline";
import { TerminalPipelineError } from "../pipelines/errors.js";
import type { AgentTool, InputArtifact, PatchView } from "./envelope.js";

/**
 * DB-backed patch / input-artifact / toolset providers for the pipeline (L4-A).
 * Together with L4-E's roster providers (loadAgent/loadPersona/loadConstitution) these
 * complete the six `AgentRunnerProviders` loaders. `createDbPatchProviders` returns the
 * three this file owns; `createLiveAgentRunner` (live-runner.ts) composes both halves +
 * the model adapter into the full provider set.
 */

export interface DbPatchProviders {
  loadPatch(patchId: string, companyId: string): Promise<PatchView>;
  loadInputArtifacts(input: { patchId: string; companyId: string; stage: StageId }): Promise<ReadonlyArray<InputArtifact>>;
  resolveToolset(agent: AgentConfig): Promise<ReadonlyArray<AgentTool>>;
}

export function createDbPatchProviders(db: Db): DbPatchProviders {
  return {
    async loadPatch(patchId, companyId) {
      const rows = await db
        .select({
          id: patches.id,
          title: patches.title,
          classification: patches.classification,
          body: patches.body,
          citations: patches.citations,
        })
        .from(patches)
        .where(and(eq(patches.id, patchId), eq(patches.companyId, companyId)))
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new TerminalPipelineError(
          `Patch '${patchId}' not found for company ${companyId}`,
          "PATCH_NOT_FOUND",
        );
      }
      return {
        id: row.id,
        title: row.title,
        classification: row.classification,
        body: row.body ?? "",
        citations: (row.citations ?? []) as PatchView["citations"],
      };
    },

    async loadInputArtifacts({ patchId, companyId, stage }) {
      // Input artifacts for a stage are the accumulated work products of this patch's
      // already-finished prior stage runs (each run records its outputArtifactId). The
      // current stage is excluded so a re-attempt is not fed its own prior output.
      const runs = await db
        .select({ outputArtifactId: patchStageRuns.outputArtifactId })
        .from(patchStageRuns)
        .where(
          and(
            eq(patchStageRuns.patchId, patchId),
            eq(patchStageRuns.companyId, companyId),
            isNotNull(patchStageRuns.finishedAt),
            isNotNull(patchStageRuns.outputArtifactId),
            ne(patchStageRuns.stage, stage),
          ),
        );
      const ids = runs.map((r) => r.outputArtifactId).filter((id): id is string => Boolean(id));
      if (ids.length === 0) return [];

      const rows = await db
        .select({
          id: artifacts.id,
          kind: artifacts.kind,
          contentText: artifacts.contentText,
          content: artifacts.content,
        })
        .from(artifacts)
        .where(and(inArray(artifacts.id, ids), eq(artifacts.companyId, companyId)))
        .orderBy(asc(artifacts.createdAt));
      return rows.map((r): InputArtifact => ({
        id: r.id,
        kind: r.kind,
        contentText: r.contentText ?? null,
        content: r.content ?? null,
      }));
    },

    async resolveToolset(agent) {
      // Phase-1 minimal registry: surface exactly the tool names the agent config grants,
      // each as an AgentTool whose invoke is an explicit not-implemented stub. The Phase-1
      // pipeline stages do not invoke tools; the grant whitelist is what the envelope checks.
      return agent.tools.map((name): AgentTool => ({
        name,
        description: `Granted tool '${name}' (declared in agent config; no executable binding in Phase 1).`,
        invoke: async () => {
          throw new TerminalPipelineError(
            `Tool '${name}' has no Phase-1 executable binding`,
            "TOOL_NOT_IMPLEMENTED",
          );
        },
      }));
    },
  };
}
