import { z } from "zod";

/**
 * Phase 1 supports JSON Feed (https://jsonfeed.org/version/1.1) only.
 * RSS/Atom is a follow-up; XML parsing is a defensive minefield not
 * worth shipping in v0 when the modern alternative exists.
 *
 * The parser deliberately discards full body text. Agents must never
 * see raw publisher content — they receive a structured summary only.
 * See docs/handoff/08_AGENT_FRAMEWORK.md ("ForumIngestor isolation"
 * principle generalized).
 */

const jsonFeedItemSchema = z
  .object({
    id: z.string().min(1).optional(),
    url: z.string().url().optional(),
    title: z.string().optional(),
    summary: z.string().optional(),
    content_text: z.string().optional(),
    content_html: z.string().optional(),
    date_published: z.string().optional(),
    date_modified: z.string().optional(),
    authors: z
      .array(z.object({ name: z.string().optional() }).passthrough())
      .optional(),
    author: z.object({ name: z.string().optional() }).passthrough().optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();

const jsonFeedSchema = z
  .object({
    version: z.string(),
    title: z.string(),
    home_page_url: z.string().url().optional(),
    items: z.array(jsonFeedItemSchema),
  })
  .passthrough();

/** Structured news event payload. The only thing agents may see. */
export interface NewsItem {
  /** Stable id within (sourceId, item-id). */
  readonly id: string;
  readonly sourceId: string;
  readonly url: string | null;
  readonly title: string;
  /** One-paragraph summary at most. Body text is stripped. */
  readonly summary: string;
  readonly publishedAt: string | null;
  readonly authors: readonly string[];
  readonly tags: readonly string[];
}

const SUMMARY_MAX_CHARS = 600;
const TITLE_MAX_CHARS = 280;

function clip(text: string | undefined, max: number): string {
  if (!text) return "";
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max - 1).trimEnd()}…`;
}

function fallbackSummary(item: z.infer<typeof jsonFeedItemSchema>): string {
  if (item.summary) return clip(item.summary, SUMMARY_MAX_CHARS);
  if (item.content_text) return clip(item.content_text, SUMMARY_MAX_CHARS);
  if (item.content_html) {
    return clip(item.content_html.replace(/<[^>]+>/g, ""), SUMMARY_MAX_CHARS);
  }
  return "";
}

function authorList(item: z.infer<typeof jsonFeedItemSchema>): string[] {
  const out: string[] = [];
  if (item.authors) {
    for (const a of item.authors) if (a.name) out.push(a.name);
  } else if (item.author?.name) {
    out.push(item.author.name);
  }
  return out;
}

export class JsonFeedParseError extends Error {
  constructor(public readonly sourceId: string, message: string) {
    super(`feed '${sourceId}' parse failed: ${message}`);
    this.name = "JsonFeedParseError";
  }
}

/**
 * Parse a JSON Feed payload into the structured envelope. Strict on
 * top-level shape (must declare `version`, `title`, `items`); lenient
 * on item-level fields (most are optional in the spec). Items missing
 * both `id` and `url` are dropped — they have no stable identity.
 */
export function parseJsonFeed(sourceId: string, raw: unknown): NewsItem[] {
  const result = jsonFeedSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new JsonFeedParseError(
      sourceId,
      `${first?.path.join(".") ?? "<root>"}: ${first?.message ?? "unknown"}`,
    );
  }
  const feed = result.data;
  if (!feed.version.startsWith("https://jsonfeed.org/version/")) {
    throw new JsonFeedParseError(sourceId, `unrecognized feed version '${feed.version}'`);
  }
  const items: NewsItem[] = [];
  for (const raw of feed.items) {
    const stableId = raw.id ?? raw.url;
    if (!stableId) continue;
    items.push({
      id: stableId,
      sourceId,
      url: raw.url ?? null,
      title: clip(raw.title, TITLE_MAX_CHARS),
      summary: fallbackSummary(raw),
      publishedAt: raw.date_published ?? raw.date_modified ?? null,
      authors: authorList(raw),
      tags: raw.tags ?? [],
    });
  }
  return items;
}
