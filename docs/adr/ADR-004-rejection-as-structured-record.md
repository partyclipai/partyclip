# ADR-004: Rejections are structured records, not free text

| | |
|---|---|
| Status | Accepted |
| Date | 2026-05-06 |
| Deciders | Operator |
| Supersedes | — |
| Superseded by | — |

## Context

When a downstream pipeline stage rejects a Patch (Critic returns
REJECT, Legal returns REJECT, BiasMirror returns BLOCK), the Patch
returns to DRAFTING with a reason. The question this ADR settles is
*what shape that reason takes*.

Two recurring failures in similar systems shaped the answer:

1. **Free-text reasons drift into LLM coordination.** When the
   reason field is "anything an agent writes about why it
   rejected," the next Architect run spends tokens decoding the
   prose, sometimes responds to it as though it were a request,
   and sometimes hallucinates rebuttals. The reason field becomes a
   side channel.
2. **Free-text reasons can't be aggregated.** Asking "how often
   does the Critic reject for missing citations?" against a
   free-text column requires reading every entry. Operators
   browsing the dashboard can't see patterns; auditors can't write
   queries; the public can't see *why* the framework rejects what
   it rejects without LLM summarization (which is itself unreliable).

partyclip operates under public scrutiny. The audit log has to be
queryable by humans with grep, not just by LLMs.

## Decision

**Rejections are structured `Rejection` rows, not free text.** The
shape is fixed:

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | server-assigned |
| `patch_id` | uuid | which patch was rejected |
| `from_stage` | enum | `critique` / `risk_assess` / `bias_mirror` |
| `reason_code` | string | `SCREAMING_SNAKE_CASE`, from a fixed per-role vocabulary |
| `details_artifact_id` | uuid? | optional pointer to a structured details artifact |
| `created_at` | timestamp | |

`reason_code` matches the regex `^[A-Z][A-Z0-9_]{1,63}$`. Per-role
vocabularies live in the personas
(`partyclip-content/agents/<role>.md`) and are enforced at the parser
layer (`server/src/services/agents/role-parsers.ts`):

- **Critic:** `WEAK_DRAFT`, `MISSING_CITATIONS`, `OUT_OF_SCOPE`,
  `INTERNAL_CONTRADICTION`
- **Legal:** `IMMUTABLE_CONFLICT`, `UNDERMINES_SIGNOFF`,
  `VAGUE_OBLIGATION`, `OUT_OF_JURISDICTION`, `MISSING_LEGAL_BASIS`
- **BiasMirror BLOCK:** always `BIAS_BLOCKED`; the `BiasReport.findings`
  carry the structured detail

Anything else — REJECT without a reason_code, lowercase, with
spaces, or with a code outside the role's vocabulary — is
`TerminalPipelineError(BAD_OUTPUT)`. The run fails terminally; it
is not retried. The expectation is that the upstream agent's
persona / model is broken, not the agent's wifi.

If an agent genuinely needs to convey more than the code (a quote
from the patch, a citation the rejection turns on), it produces a
**structured details artifact** that the rejection's
`details_artifact_id` points to. The artifact is typed; the
rejection record itself stays terse.

## Consequences

### Positive

1. **Aggregation is trivial.**
   `SELECT reason_code, COUNT(*) FROM rejections GROUP BY 1` is a
   real query that gives a real answer. Stage-rejection-rate
   dashboards (Stage 10) read the column directly.
2. **Public legibility.** Anyone reading the audit log sees a
   small finite vocabulary of rejection codes. The framework's
   *reasoning* is auditable without translating prose.
3. **No LLM cross-talk.** The next Architect run sees the
   reason_code, not whatever the Critic wrote about it. The reason
   is an instruction shape, not a conversation.
4. **Vocabulary changes are visible.** Adding a new reason_code
   requires editing the role's persona and the parser. Both are
   in source control; both show up in code review.

### Negative

1. **Less expressive in the small.** A Critic that wants to say
   "this is a `WEAK_DRAFT` *because* paragraph three contradicts
   paragraph one" can't put that in the reason itself. The Critic
   must produce a details artifact, which is more setup. Acceptable
   — the cases where this matters are rare enough that the
   ceremony pays for itself.
2. **Vocabulary must be maintained.** A reason_code that doesn't
   show up in operator filters is dead weight; one that's missing
   forces agents to reach for the closest neighbor and lie. We
   refresh these per phase, starting with the Phase 1 set above.

### Operational

- Adding a reason_code requires (1) editing the persona, (2)
  optionally adding a parser-level allowlist, (3) running the
  full agent test suite to confirm rejection paths still pass.
- Removing one is a deprecation: leave it parseable for the audit
  log, mark the persona "legacy," watch dashboards drop the count
  to zero, then remove from the parser.

## Alternatives considered

- **Free-text rejection field.** Rejected: the original failure
  mode.
- **Free-text + extracted reason_code via LLM.** Rejected: the
  extracted code lies whenever the prose lies. Adds a dependency
  on a second LLM call to make the audit log queryable.
- **Structured rejection with optional free text.** Rejected:
  optionality means agents will use the free-text field when the
  vocabulary doesn't fit, which means the vocabulary doesn't
  evolve, which means we end up with a partial enum and a partial
  free-text column — the worst of both.

## References

- `packages/db/src/schema/rejections.ts`
- `server/src/services/agents/role-parsers.ts`
- `partyclip-content/agents/{critic,legal,bias-mirror}.md`
- `docs/handoff/04_PIPELINE.md`
