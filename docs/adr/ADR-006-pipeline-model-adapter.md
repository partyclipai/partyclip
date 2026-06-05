# ADR-006: Pipeline model adapter is provider-agnostic, Anthropic-first over REST

| | |
|---|---|
| Status | Accepted |
| Date | 2026-06-06 |
| Deciders | Operator |
| Supersedes | — |
| Superseded by | — |

## Context

The patch pipeline's `ModelAdapter` (`server/src/services/agents/model-adapter.ts`) shipped only a
fake for tests; production had no way to invoke a real model. `L4-A`'s open question reserved the
provider choice as an ADR. The adapter contract is tiny and single-turn: `invoke({ envelope,
systemPrompt, userPrompt, maxOutputTokens }) → { text, cost, promptTokens, completionTokens,
modelUsed }`. No tool-use, no streaming, no multi-turn — the role parsers consume one text blob.

Three options were on the table:

1. **Reuse a `packages/adapters/*` adapter** (e.g. `claude-local`). Those adapters drive the Claude
   Code CLI as a subprocess for autonomous coding agents — they spawn a process per run, manage
   sandboxes, workspaces, and session resumption. That is a large, mismatched surface for a
   single-turn prompt→text call.
2. **Add the `@anthropic-ai/sdk` dependency** and call `messages.create`.
3. **Call the Anthropic REST Messages API directly with native `fetch`.**

## Decision

**The pipeline model adapter is provider-agnostic, selected from the environment, with Anthropic as
the first provider called over its REST Messages API via native `fetch` — no SDK dependency.**

- `resolveModelAdapter(env)` picks the provider: `ANTHROPIC_API_KEY` set → the Anthropic adapter;
  otherwise a **disabled adapter that throws at `invoke`** (a misconfigured production run fails
  loudly rather than silently no-op'ing). Tests inject their own `ModelAdapter` (or a stub `fetch`).
- The Anthropic adapter (`live-model-adapter.ts`) POSTs to `/v1/messages` with `fetch`, maps
  `content[].text` → `text` and `usage` → `promptTokens`/`completionTokens`, and reports
  `modelUsed` from the response. `fetch` is injectable for tests.
- **Cost** is a best-effort static per-model-family estimate (opus/sonnet/haiku USD-per-MTok).
  Authoritative cost production and persistence is `L4-B`'s responsibility; this adapter only needs
  to return a non-zero `cost` for the runner to record.

Rejected: option 1 (CLI-subprocess adapter — overkill and a semantic mismatch for single-turn
prompt→text); option 2 (an SDK dependency for a single REST endpoint — `fetch` is sufficient and
keeps the dependency surface and install footprint minimal).

## Consequences

### Positive

1. **Minimal dependency surface** — no new external package; native `fetch` (Node 18+).
2. **Provider-agnostic seam** — a second provider (OpenAI, Bedrock, a local model) is a new branch
   in `resolveModelAdapter` without touching the runner or the contract.
3. **Testable offline** — `fetchImpl` is injected, so adapter behaviour (mapping, cost, error
   paths) is unit-tested with no network and no key.
4. **Fails loud when unconfigured** — the disabled fallback throws at `invoke`, surfacing a missing
   key instead of producing empty output.

### Negative

1. **Hand-maintained request/response mapping** — the REST shape (`anthropic-version`, `content`
   blocks, `usage`) is coded by hand and must track Anthropic API changes (an SDK would absorb
   some of that). Mitigated by the injected-`fetch` unit tests pinning the shape.
2. **Static pricing drifts** — the cost estimate is a checked-in table, not live pricing; it can go
   stale. `L4-B` owns authoritative cost, so this is a temporary stand-in.

## Follow-up

- `L4-A` composes `resolveModelAdapter(...)` into the live `AgentRunnerProviders` and wires the
  runner into the pipeline runtime.
- `L4-B` replaces the static cost estimate with authoritative cost events + per-patch roll-up.
