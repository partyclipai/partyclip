import { TerminalPipelineError, TransientPipelineError } from "../pipelines/errors.js";
import type { ModelAdapter, ModelInvocation, ModelResponse } from "./model-adapter.js";

/**
 * Live model adapter for the pipeline (L4-A / ADR-006). Provider-agnostic: `resolveModelAdapter`
 * picks a concrete provider from the environment. The first provider is Anthropic, called over
 * its REST Messages API via native `fetch` — no SDK dependency (keeps the dep surface minimal and
 * the call synchronous/single-turn, which is all the pipeline needs). Tests inject a `fetchImpl`
 * (or their own ModelAdapter); production reads `ANTHROPIC_API_KEY` from the env.
 */

type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

export interface AnthropicAdapterOptions {
  apiKey: string;
  /** Override the API base (default https://api.anthropic.com). */
  baseUrl?: string;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: FetchLike;
}

const ANTHROPIC_VERSION = "2023-06-01";

// HTTP statuses worth retrying (rate limit / overloaded / transient server errors). Anything else
// (400/401/403/404/422/…) is a terminal misconfiguration. 529 is Anthropic's "overloaded".
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504, 529]);

// Best-effort USD-per-million-token rates by model family, for the ModelResponse.cost field.
// Authoritative cost production + persistence is L4-B's job; this is a static estimate so the
// runner can record a non-zero cost today.
const PRICING: ReadonlyArray<{ match: RegExp; inPerMTok: number; outPerMTok: number }> = [
  { match: /opus/i, inPerMTok: 15, outPerMTok: 75 },
  { match: /sonnet/i, inPerMTok: 3, outPerMTok: 15 },
  { match: /haiku/i, inPerMTok: 0.8, outPerMTok: 4 },
];
const DEFAULT_PRICING = { inPerMTok: 3, outPerMTok: 15 };

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rate = PRICING.find((p) => p.match.test(model)) ?? DEFAULT_PRICING;
  return (inputTokens * rate.inPerMTok + outputTokens * rate.outPerMTok) / 1_000_000;
}

interface AnthropicMessagesResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
}

export function createAnthropicModelAdapter(opts: AnthropicAdapterOptions): ModelAdapter {
  const baseUrl = (opts.baseUrl ?? "https://api.anthropic.com").replace(/\/+$/, "");
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  if (!fetchImpl) {
    throw new Error("createAnthropicModelAdapter: no fetch implementation available");
  }
  return {
    async invoke(input: ModelInvocation): Promise<ModelResponse> {
      const model = input.envelope.model;
      const res = await fetchImpl(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "x-api-key": opts.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: input.maxOutputTokens,
          system: input.systemPrompt,
          messages: [{ role: "user", content: input.userPrompt }],
        }),
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 500);
        const message = `Anthropic Messages API returned ${res.status}: ${detail}`;
        if (RETRYABLE_STATUSES.has(res.status)) {
          throw new TransientPipelineError(message, "MODEL_API_TRANSIENT");
        }
        throw new TerminalPipelineError(message, "MODEL_API_ERROR");
      }
      const data = (await res.json()) as AnthropicMessagesResponse;
      const text = (data.content ?? [])
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("");
      const inputTokens = data.usage?.input_tokens ?? 0;
      const outputTokens = data.usage?.output_tokens ?? 0;
      const modelUsed = data.model ?? model;
      return {
        text,
        cost: estimateCost(modelUsed, inputTokens, outputTokens),
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        modelUsed,
      };
    },
  };
}

/** Fallback when no provider is configured: fails loudly at invoke time. Tests inject a fake. */
export function disabledModelAdapter(): ModelAdapter {
  return {
    async invoke(): Promise<ModelResponse> {
      throw new Error(
        "No model provider configured: set ANTHROPIC_API_KEY for a live run, or inject a ModelAdapter in tests",
      );
    },
  };
}

export interface ResolveModelAdapterOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

/**
 * Pick a model adapter from the environment. Anthropic when `ANTHROPIC_API_KEY` is set; otherwise
 * a disabled adapter that throws on invoke (so a misconfigured production run fails loudly rather
 * than silently doing nothing).
 */
export function resolveModelAdapter(
  env: NodeJS.ProcessEnv = process.env,
  opts: ResolveModelAdapterOptions = {},
): ModelAdapter {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (apiKey) {
    return createAnthropicModelAdapter({ apiKey, baseUrl: opts.baseUrl, fetchImpl: opts.fetchImpl });
  }
  return disabledModelAdapter();
}
