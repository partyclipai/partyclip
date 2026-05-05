import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { pipelineDefinitionSchema, type PipelineDefinition } from "@partyclipai/shared/types/pipeline";

export class PipelineLoadError extends Error {
  constructor(message: string, public readonly file: string) {
    super(message);
    this.name = "PipelineLoadError";
  }
}

export async function loadPipelineFromFile(filePath: string): Promise<PipelineDefinition> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    throw new PipelineLoadError(
      `Failed to read pipeline file: ${(err as Error).message}`,
      filePath,
    );
  }
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch (err) {
    throw new PipelineLoadError(`YAML parse failed: ${(err as Error).message}`, filePath);
  }
  const result = pipelineDefinitionSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.join(".") ?? "<root>";
    throw new PipelineLoadError(
      `Pipeline schema validation failed at ${where}: ${first?.message ?? "unknown"}`,
      filePath,
    );
  }
  return result.data;
}

export async function loadPipelinesFromDirectory(dir: string): Promise<Map<string, PipelineDefinition>> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    throw new PipelineLoadError(
      `Failed to read pipelines directory: ${(err as Error).message}`,
      dir,
    );
  }
  const yamlFiles = entries.filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"));
  const pipelines = new Map<string, PipelineDefinition>();
  for (const name of yamlFiles.sort()) {
    const def = await loadPipelineFromFile(path.join(dir, name));
    if (pipelines.has(def.id)) {
      throw new PipelineLoadError(
        `Duplicate pipeline id '${def.id}' in directory (also defined elsewhere)`,
        path.join(dir, name),
      );
    }
    pipelines.set(def.id, def);
  }
  return pipelines;
}

/** Pure-function variant for tests that already hold the YAML string in memory. */
export function parsePipelineYaml(source: string, file = "<inline>"): PipelineDefinition {
  let parsed: unknown;
  try {
    parsed = YAML.parse(source);
  } catch (err) {
    throw new PipelineLoadError(`YAML parse failed: ${(err as Error).message}`, file);
  }
  const result = pipelineDefinitionSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.join(".") ?? "<root>";
    throw new PipelineLoadError(
      `Pipeline schema validation failed at ${where}: ${first?.message ?? "unknown"}`,
      file,
    );
  }
  return result.data;
}
