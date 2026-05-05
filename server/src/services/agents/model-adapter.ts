import type { AgentEnvelope } from "./envelope.js";

/**
 * Thin abstraction over LLM invocation. Phase 1 ships a fake adapter
 * for tests; production will wire one of partyclip's existing adapters
 * (Claude/Codex/Cursor) or a direct Anthropic SDK call. Keeping this
 * small means we can swap in canned responses for end-to-end tests
 * without standing up a model provider.
 */

export interface ModelInvocation {
  envelope: AgentEnvelope;
  /** Prompts merged in role-specific shape by the runner. */
  systemPrompt: string;
  userPrompt: string;
  /** Maximum response tokens the runner is willing to spend. */
  maxOutputTokens: number;
}

export interface ModelResponse {
  /** Raw text the model emitted. The runner parses this into a typed outcome. */
  text: string;
  cost: number;
  promptTokens: number;
  completionTokens: number;
  /** Identifier the adapter actually used (may differ from envelope.model on fallback). */
  modelUsed: string;
}

export interface ModelAdapter {
  invoke(input: ModelInvocation): Promise<ModelResponse>;
}

/** Runtime guard so swapped adapters can't silently violate the contract. */
export function assertValidResponse(r: ModelResponse): void {
  if (typeof r.text !== "string") throw new Error("ModelAdapter returned non-string text");
  if (typeof r.cost !== "number" || r.cost < 0) throw new Error("ModelAdapter returned invalid cost");
  if (typeof r.modelUsed !== "string" || r.modelUsed.length === 0) {
    throw new Error("ModelAdapter must report modelUsed");
  }
}
