import type { Db } from "@partyclipai/db";
import type { AgentRunner } from "../pipelines/executor.js";
import { createAgentRunner, type AgentRunnerOptions, type AgentRunnerProviders } from "./runner.js";
import { createDbRosterProviders } from "./db-providers.js";
import { createDbPatchProviders } from "./patch-providers.js";
import { resolveModelAdapter } from "./live-model-adapter.js";
import type { ModelAdapter } from "./model-adapter.js";

/**
 * Production wiring (L4-A): assemble the full, DB-backed `AgentRunnerProviders` for one company and
 * build the live `AgentRunner` the pipeline executor depends on. Composes L4-E's roster providers
 * (loadAgent/loadPersona/loadConstitution) with L4-A's patch providers (loadPatch/loadInputArtifacts/
 * resolveToolset) and the model adapter. Production gets a live model adapter via
 * `resolveModelAdapter(env)`; tests inject a fake adapter through `modelAdapter`.
 */

export interface LiveAgentRunnerDeps {
  db: Db;
  companyId: string;
  /** Inject a model adapter (tests pass a fake/stub). Defaults to resolveModelAdapter(env). */
  modelAdapter?: ModelAdapter;
  /** Environment used to resolve the model adapter when `modelAdapter` is not given. */
  env?: NodeJS.ProcessEnv;
  runnerOptions?: AgentRunnerOptions;
}

/** Build the full DB-backed provider set for one company. */
export function createLiveAgentRunnerProviders(deps: LiveAgentRunnerDeps): AgentRunnerProviders {
  const roster = createDbRosterProviders(deps.db, deps.companyId);
  const patch = createDbPatchProviders(deps.db);
  const modelAdapter = deps.modelAdapter ?? resolveModelAdapter(deps.env);
  return {
    modelAdapter,
    loadAgent: roster.loadAgent,
    loadPersona: roster.loadPersona,
    loadConstitution: roster.loadConstitution,
    loadPatch: patch.loadPatch,
    loadInputArtifacts: patch.loadInputArtifacts,
    resolveToolset: patch.resolveToolset,
  };
}

/** Build the live AgentRunner the pipeline executor's `executeStage` runs against in production. */
export function createLiveAgentRunner(deps: LiveAgentRunnerDeps): AgentRunner {
  return createAgentRunner(createLiveAgentRunnerProviders(deps), deps.runnerOptions);
}
