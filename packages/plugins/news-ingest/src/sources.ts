import { z } from "zod";

/**
 * Source definitions for the news-ingest plugin. Operators configure
 * a list of news feeds the plugin should poll. Phase 1 only supports
 * JSON Feed (jsonfeed.org) — RSS/Atom support is a follow-up.
 *
 * Each source is fetched on the plugin's cron schedule. New items
 * are deduped by `id` (or by URL hash if `id` is missing) against
 * plugin state and emitted as structured events.
 *
 * Sources YAML lives in the deployment's content repo. The plugin
 * reads it via ctx.config when the host loads it.
 */

export const sourceKindSchema = z.enum(["json_feed"]);
export type SourceKind = z.infer<typeof sourceKindSchema>;

export const newsSourceSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9_-]+$/, "source id must be kebab/snake"),
    kind: sourceKindSchema.default("json_feed"),
    url: z.string().url(),
    /** Optional human-readable label for operator UI / logs. */
    label: z.string().trim().min(1).max(120).optional(),
    /** Cap on items pulled per fetch (most recent N). */
    max_items_per_fetch: z.number().int().positive().max(500).default(50),
    /** Soft timeout for a single source fetch. Hard cap is 60s; the host enforces. */
    timeout_seconds: z.number().int().positive().max(60).default(15),
    /** Optional — if set, plugin resolves via ctx.secrets and includes as Bearer token. */
    auth_secret_ref: z.string().trim().min(1).optional(),
  })
  .strict();
export type NewsSource = z.infer<typeof newsSourceSchema>;

export const newsSourcesFileSchema = z
  .object({
    sources: z.array(newsSourceSchema).min(1).max(100),
  })
  .strict()
  .superRefine((file, ctx) => {
    const ids = new Set<string>();
    for (let i = 0; i < file.sources.length; i += 1) {
      const id = file.sources[i].id;
      if (ids.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sources", i, "id"],
          message: `duplicate source id '${id}'`,
        });
      }
      ids.add(id);
    }
  });
export type NewsSourcesFile = z.infer<typeof newsSourcesFileSchema>;

export class InvalidSourcesConfigError extends Error {
  constructor(public readonly path: string, message: string) {
    super(`news-ingest sources config invalid at '${path}': ${message}`);
    this.name = "InvalidSourcesConfigError";
  }
}

export function parseSourcesConfig(raw: unknown): NewsSourcesFile {
  const result = newsSourcesFileSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new InvalidSourcesConfigError(
      first?.path.join(".") ?? "<root>",
      first?.message ?? "unknown",
    );
  }
  return result.data;
}
