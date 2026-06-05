import { promises as fs } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import {
  constitutionArticleSchema,
  type ConstitutionArticleInput,
} from "@partyclipai/shared/validators/constitution-article";

/**
 * Loads the deployment constitution from the content repo (ADR-005). Authored as
 * `constitution.yaml` ({ articles: [...] }), validated against the shared
 * constitutionArticleSchema, and ingested into `constitution_articles` by
 * `db-providers.ingestConstitution`. Mirrors roster-loader.ts.
 */

export class ConstitutionLoadError extends Error {
  constructor(message: string, public readonly file: string) {
    super(message);
    this.name = "ConstitutionLoadError";
  }
}

const constitutionDocSchema = z.object({
  articles: z.array(constitutionArticleSchema).min(1),
});

export const CONSTITUTION_FILENAME = "constitution.yaml";

/** Pure-function variant for tests that already hold the YAML string. */
export function parseConstitutionYaml(source: string, file = "<inline>"): ConstitutionArticleInput[] {
  let parsed: unknown;
  try {
    parsed = YAML.parse(source);
  } catch (err) {
    throw new ConstitutionLoadError(`YAML parse failed: ${(err as Error).message}`, file);
  }
  const result = constitutionDocSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.join(".") ?? "<root>";
    throw new ConstitutionLoadError(
      `Constitution schema validation failed at ${where}: ${first?.message ?? "unknown"}`,
      file,
    );
  }
  const seen = new Set<string>();
  for (const article of result.data.articles) {
    const key = `${article.stable_id}@${article.version}`;
    if (seen.has(key)) {
      throw new ConstitutionLoadError(`Duplicate constitution article '${key}'`, file);
    }
    seen.add(key);
  }
  return result.data.articles;
}

export async function loadConstitutionFromDirectory(contentDir: string): Promise<ConstitutionArticleInput[]> {
  const file = path.join(contentDir, CONSTITUTION_FILENAME);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (err) {
    throw new ConstitutionLoadError(`Failed to read constitution file: ${(err as Error).message}`, file);
  }
  return parseConstitutionYaml(raw, file);
}
