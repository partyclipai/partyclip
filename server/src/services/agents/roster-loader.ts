import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { agentConfigSchema, type AgentConfig } from "@partyclipai/shared/types/agent-config";

/**
 * Loads the partyclip agent roster from the deployment content repo (ADR-005).
 * The content repo holds `regular.yaml` (a roster of AgentConfig entries) plus a
 * persona file per agent (referenced by `persona_ref`). This module parses and
 * validates the roster and resolves each persona to text; `db-providers.ts`
 * ingests the result into the `pipeline_agents` table. Mirrors the conventions of
 * `server/src/services/pipelines/loader.ts` (the pipeline-YAML loader).
 */

export class RosterLoadError extends Error {
  constructor(message: string, public readonly file: string) {
    super(message);
    this.name = "RosterLoadError";
  }
}

const rosterSchema = z.object({
  agents: z.array(agentConfigSchema).min(1),
});

export interface LoadedRosterAgent {
  readonly config: AgentConfig;
  /** Persona file text, resolved from `config.persona_ref`. */
  readonly persona: string;
}

/** Roster filename within the deployment content directory. */
export const ROSTER_FILENAME = "regular.yaml";

/** Pure-function variant for tests that already hold the YAML string. */
export function parseRosterYaml(source: string, file = "<inline>"): AgentConfig[] {
  let parsed: unknown;
  try {
    parsed = YAML.parse(source);
  } catch (err) {
    throw new RosterLoadError(`YAML parse failed: ${(err as Error).message}`, file);
  }
  const result = rosterSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.join(".") ?? "<root>";
    throw new RosterLoadError(
      `Roster schema validation failed at ${where}: ${first?.message ?? "unknown"}`,
      file,
    );
  }
  const seen = new Set<string>();
  for (const agent of result.data.agents) {
    if (seen.has(agent.role)) {
      throw new RosterLoadError(`Duplicate agent role '${agent.role}' in roster`, file);
    }
    seen.add(agent.role);
  }
  return result.data.agents;
}

/**
 * Reads `regular.yaml` from the content directory and resolves each agent's
 * persona file to text. `persona_ref` is resolved relative to the content dir and
 * is rejected if it escapes the directory (path-traversal guard).
 */
export async function loadRosterFromDirectory(contentDir: string): Promise<LoadedRosterAgent[]> {
  const rosterFile = path.join(contentDir, ROSTER_FILENAME);
  let raw: string;
  try {
    raw = await fs.readFile(rosterFile, "utf8");
  } catch (err) {
    throw new RosterLoadError(`Failed to read roster file: ${(err as Error).message}`, rosterFile);
  }
  const agents = parseRosterYaml(raw, rosterFile);
  const root = path.resolve(contentDir);
  const loaded: LoadedRosterAgent[] = [];
  for (const config of agents) {
    const personaPath = path.resolve(root, config.persona_ref);
    if (personaPath !== root && !personaPath.startsWith(root + path.sep)) {
      throw new RosterLoadError(
        `persona_ref '${config.persona_ref}' (role ${config.role}) escapes the content directory`,
        rosterFile,
      );
    }
    let persona: string;
    try {
      persona = await fs.readFile(personaPath, "utf8");
    } catch (err) {
      throw new RosterLoadError(
        `Failed to read persona '${config.persona_ref}' for role ${config.role}: ${(err as Error).message}`,
        personaPath,
      );
    }
    loaded.push({ config, persona });
  }
  return loaded;
}
