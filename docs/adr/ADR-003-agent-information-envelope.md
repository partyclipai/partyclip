# ADR-003: Agent information envelope

| | |
|---|---|
| Status | Accepted |
| Date | 2026-05-06 |
| Deciders | Operator |
| Supersedes | — |
| Superseded by | — |

## Context

partyclip orchestrates many LLM agents — Architect, Critic, Legal,
Executor, BiasMirror, plus Spokesperson / Head / Analyst /
ForumIngestor / NewsIngestor / GovActionMonitor in later phases. Each
agent has different inputs, different outputs, different tools, and
different trust assumptions.

A real failure mode in this kind of system is *context leakage*: an
agent that's supposed to evaluate the patch on its own merits ends up
seeing the deployment's branding decisions, other agents' personas,
operator notes, citizen identities, or raw forum text — and either
imitates the framing it was supposed to audit, or gets prompt-injected
by something a citizen wrote three days ago.

The defense can't be "we'll be careful." It has to be structural.

## Decision

Every agent run goes through `buildAgentEnvelope()` in
`server/src/services/agents/envelope.ts`. The envelope is a
strictly-typed object containing **only**:

1. The constitution (full, with stable IDs)
2. The agent's own persona prompt
3. The Patch under review
4. Pipeline-declared input artifacts for this stage
5. Tools the SDK has explicitly granted to this agent role

Anything else — other agents' personas, deployment branding/legal
framing, citizen identity, raw forum text, OOB instructions — is
**not addressable from the envelope**. There is no "context bag";
the envelope's TypeScript shape is the spec.

`buildAgentEnvelope` enforces three runtime checks on top of the
structural typing:

1. Tools passed in must be in the agent's `tools` whitelist from its
   AgentConfig. Smuggling an ungranted tool throws
   `EnvelopeViolationError`.
2. Tool names that match a reserved/forbidden set
   (`deployment`, `branding`, `parody`, `legal_framing`,
   `operator_secrets`, `other_personas`, `raw_forum`,
   `citizen_identity`) throw, even if granted.
3. Input artifact `kind` values matching the same forbidden set
   throw — so `raw_forum` content can't be smuggled in as an
   "artifact."

Outputs run through per-role parsers
(`server/src/services/agents/role-parsers.ts`). Free-text rejection
reasons are explicitly forbidden — REJECT requires a SCREAMING_SNAKE
`reason_code` from a fixed vocabulary per role (see ADR-004).

The runner — `createAgentRunner(providers)` — takes its envelope
ingredients via dependency-injected providers
(`AgentRunnerProviders`), so envelope contents are never read from a
global. Tests pass fakes; production wires DB-backed providers.

## Consequences

### Positive

1. **Compile-time guarantee on context surface area.** Adding a new
   field to the envelope requires editing `envelope.ts` — there's no
   way for a feature to grow the context implicitly.
2. **Forum / news / external content is structurally isolated.**
   Untrusted text reaches agents only through structured ingestor
   summaries (FeedbackSummary, structured news payloads) — never as
   raw text.
3. **Agents don't know the meta.** An Architect for partyclip-as-a-
   parody-deployment and an Architect for partyclip-as-a-real-party
   see literally identical context. Whatever framing the deployment
   wears externally, agents under the hood see only constitution +
   persona + patch + artifacts + tools.
4. **Tool grants are auditable.** Every tool an agent can invoke
   appears in its `AgentConfig.tools` array. A grep on a deployment's
   content repo answers "what can the Critic do?".

### Negative

1. **Adding context is friction.** When a real new need arises (e.g.,
   the Bias Mirror needing access to a `bias_history_summary`
   artifact for a single source), it requires a typed addition rather
   than dropping a field into a Map. Acceptable cost for the
   guarantee.
2. **Provider-injection plumbing.** The runner takes seven providers.
   It's verbose at the call site. Mitigated by the
   `AgentRunnerProviders` interface.

### Operational

- New agent roles require a registered output parser. Without one,
  the runner returns
  `terminal_failure(reasonCode: "UNSUPPORTED_ROLE")` rather than
  attempting a generic dispatch.
- New event kinds that producers want agents to consume have to land
  as structured artifacts (or summaries thereof) — not as opaque
  free-text payloads.

## Alternatives considered

- **Open context bag (Map<string, unknown>).** Rejected: the failure
  mode this ADR exists to prevent.
- **Per-role hand-written context builders.** Rejected: same
  guarantee, much more code, plus a higher chance that one role's
  builder grows differently from the others over time.
- **Allowlist + denylist on a single context object.** Rejected:
  denylists fail open. Whitelist via a typed envelope fails closed.

## References

- `server/src/services/agents/envelope.ts`
- `server/src/services/agents/runner.ts`
- `server/src/services/agents/role-parsers.ts`
- `docs/handoff/08_AGENT_FRAMEWORK.md`
