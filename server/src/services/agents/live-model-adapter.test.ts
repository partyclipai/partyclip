import { describe, expect, it } from "vitest";
import type { AgentEnvelope } from "./envelope.js";
import { TerminalPipelineError, TransientPipelineError } from "../pipelines/errors.js";
import { assertValidResponse } from "./model-adapter.js";
import {
  createAnthropicModelAdapter,
  disabledModelAdapter,
  resolveModelAdapter,
} from "./live-model-adapter.js";

function invocation(model: string) {
  return {
    envelope: { model } as AgentEnvelope,
    systemPrompt: "system",
    userPrompt: "user",
    maxOutputTokens: 1024,
  };
}

function stubFetch(response: unknown, init?: { ok?: boolean; status?: number; body?: string }) {
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const fn = async (url: string, opts: { method: string; headers: Record<string, string>; body: string }) => {
    calls.push({ url, headers: opts.headers, body: opts.body });
    return {
      ok: init?.ok ?? true,
      status: init?.status ?? 200,
      text: async () => init?.body ?? "",
      json: async () => response,
    };
  };
  return Object.assign(fn, { calls });
}

describe("createAnthropicModelAdapter", () => {
  it("calls the Messages API and maps text/usage/cost (opus pricing)", async () => {
    const fetchImpl = stubFetch({
      content: [{ type: "text", text: "the answer" }],
      usage: { input_tokens: 100, output_tokens: 20 },
      model: "claude-opus-4-8",
    });
    const adapter = createAnthropicModelAdapter({ apiKey: "sk-test", fetchImpl });
    const res = await adapter.invoke(invocation("claude-opus-4-8"));

    expect(res.text).toBe("the answer");
    expect(res.promptTokens).toBe(100);
    expect(res.completionTokens).toBe(20);
    expect(res.modelUsed).toBe("claude-opus-4-8");
    // opus: (100*15 + 20*75)/1e6 = 0.003
    expect(res.cost).toBeCloseTo(0.003, 6);
    assertValidResponse(res);

    // request shape
    expect(fetchImpl.calls).toHaveLength(1);
    expect(fetchImpl.calls[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(fetchImpl.calls[0]!.headers["x-api-key"]).toBe("sk-test");
    expect(JSON.parse(fetchImpl.calls[0]!.body)).toMatchObject({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system: "system",
      messages: [{ role: "user", content: "user" }],
    });
  });

  it("prices sonnet and haiku from the model id", async () => {
    const sonnet = createAnthropicModelAdapter({
      apiKey: "k",
      fetchImpl: stubFetch({ content: [{ type: "text", text: "x" }], usage: { input_tokens: 1000, output_tokens: 1000 }, model: "claude-sonnet-4-6" }),
    });
    // sonnet: (1000*3 + 1000*15)/1e6 = 0.018
    expect((await sonnet.invoke(invocation("claude-sonnet-4-6"))).cost).toBeCloseTo(0.018, 6);
  });

  it("throws a TransientPipelineError on a retryable status (429) so the executor retries", async () => {
    const adapter = createAnthropicModelAdapter({
      apiKey: "k",
      fetchImpl: stubFetch({}, { ok: false, status: 429, body: "rate limited" }),
    });
    await expect(adapter.invoke(invocation("claude-opus-4-8"))).rejects.toThrow(TransientPipelineError);
    await expect(adapter.invoke(invocation("claude-opus-4-8"))).rejects.toThrow(/returned 429/);
  });

  it("throws a TerminalPipelineError on a non-retryable status (400)", async () => {
    const adapter = createAnthropicModelAdapter({
      apiKey: "k",
      fetchImpl: stubFetch({}, { ok: false, status: 400, body: "bad request" }),
    });
    await expect(adapter.invoke(invocation("claude-opus-4-8"))).rejects.toThrow(TerminalPipelineError);
  });

  it("throws a TransientPipelineError on a 529 overloaded response", async () => {
    const adapter = createAnthropicModelAdapter({
      apiKey: "k",
      fetchImpl: stubFetch({}, { ok: false, status: 529, body: "overloaded" }),
    });
    await expect(adapter.invoke(invocation("claude-opus-4-8"))).rejects.toThrow(TransientPipelineError);
  });
});

describe("resolveModelAdapter", () => {
  it("returns an Anthropic adapter when ANTHROPIC_API_KEY is set", async () => {
    const fetchImpl = stubFetch({ content: [{ type: "text", text: "ok" }], usage: { input_tokens: 1, output_tokens: 1 }, model: "claude-opus-4-8" });
    const adapter = resolveModelAdapter({ ANTHROPIC_API_KEY: "sk-x" } as NodeJS.ProcessEnv, { fetchImpl });
    const res = await adapter.invoke(invocation("claude-opus-4-8"));
    expect(res.text).toBe("ok");
    expect(fetchImpl.calls).toHaveLength(1);
  });

  it("returns a disabled adapter that throws on invoke when no key is set", async () => {
    const adapter = resolveModelAdapter({} as NodeJS.ProcessEnv);
    await expect(adapter.invoke(invocation("claude-opus-4-8"))).rejects.toThrow(/No model provider configured/);
  });

  it("disabledModelAdapter always throws on invoke", async () => {
    await expect(disabledModelAdapter().invoke(invocation("m"))).rejects.toThrow(/No model provider configured/);
  });
});
