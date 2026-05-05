import type { AgentRole } from "@partyclipai/shared/types/agent-role";
import { biasReportSchema } from "@partyclipai/shared/types/bias-report";
import type { StageOutcome } from "../pipelines/dispatcher.js";
import { TerminalPipelineError } from "../pipelines/errors.js";

/**
 * Per-role parsers convert raw model text into a typed StageOutcome
 * the dispatcher understands. Each role expects a tiny, machine-checkable
 * envelope on the first JSON line; surrounding prose is ignored. The
 * BiasMirror parser is intentionally permissive on the *shape* of
 * findings — Stage 4 owns the BiasReport row layout — but it must
 * surface a `decision` field.
 *
 * Free-text reason strings are explicitly *not* used as Rejection
 * reason_codes. Roles must emit a constant from the role's reason_code
 * vocabulary; anything else is a TerminalPipelineError (BAD_OUTPUT).
 */

export type AgentEmittedOutcome = Exclude<StageOutcome, { kind: "transient_failure" } | { kind: "terminal_failure" }>;

export interface ParsedAgentOutput {
  outcome: AgentEmittedOutcome;
  /** Structured payload to persist as the run's Artifact.content. */
  artifact: Record<string, unknown>;
}

const REASON_CODE_RE = /^[A-Z][A-Z0-9_]{1,63}$/;

function extractFirstJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  // Try direct parse.
  try {
    const direct = JSON.parse(trimmed);
    if (direct && typeof direct === "object" && !Array.isArray(direct)) return direct as Record<string, unknown>;
  } catch {
    // fall through
  }
  // Try fenced code block.
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fence) {
    try {
      const inner = JSON.parse(fence[1]);
      if (inner && typeof inner === "object" && !Array.isArray(inner)) return inner as Record<string, unknown>;
    } catch {
      // fall through
    }
  }
  // Try first balanced {...}.
  const start = trimmed.indexOf("{");
  if (start >= 0) {
    let depth = 0;
    for (let i = start; i < trimmed.length; i += 1) {
      const ch = trimmed[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const slice = JSON.parse(trimmed.slice(start, i + 1));
            if (slice && typeof slice === "object" && !Array.isArray(slice)) {
              return slice as Record<string, unknown>;
            }
          } catch {
            break;
          }
        }
      }
    }
  }
  throw new TerminalPipelineError("agent output did not contain a JSON object", "BAD_OUTPUT");
}

function requireReasonCode(value: unknown): string {
  if (typeof value !== "string" || !REASON_CODE_RE.test(value)) {
    throw new TerminalPipelineError(
      `agent must emit a SCREAMING_SNAKE reason_code; got ${JSON.stringify(value)}`,
      "BAD_OUTPUT",
    );
  }
  return value;
}

function parseArchitect(text: string): ParsedAgentOutput {
  const obj = extractFirstJsonObject(text);
  if (typeof obj.body !== "string" || obj.body.trim().length === 0) {
    throw new TerminalPipelineError("Architect must produce a non-empty body", "BAD_OUTPUT");
  }
  const citations = Array.isArray(obj.citations) ? obj.citations : [];
  return {
    outcome: { kind: "pass" },
    artifact: { kind: "draft", body: obj.body, citations, title: typeof obj.title === "string" ? obj.title : undefined },
  };
}

function parseBinaryDecision(text: string, role: AgentRole): ParsedAgentOutput {
  const obj = extractFirstJsonObject(text);
  const decision = typeof obj.decision === "string" ? obj.decision.toUpperCase() : "";
  if (decision === "PASS") {
    return { outcome: { kind: "pass" }, artifact: { kind: `${role.toLowerCase()}_vote`, decision } };
  }
  if (decision === "REJECT") {
    const reasonCode = requireReasonCode(obj.reason_code ?? obj.reasonCode);
    return {
      outcome: { kind: "reject", reasonCode },
      artifact: { kind: `${role.toLowerCase()}_vote`, decision, reason_code: reasonCode },
    };
  }
  if (decision === "DEFER") {
    return { outcome: { kind: "defer" }, artifact: { kind: `${role.toLowerCase()}_vote`, decision } };
  }
  throw new TerminalPipelineError(`${role} returned unknown decision '${decision}'`, "BAD_OUTPUT");
}

function parseLegal(text: string): ParsedAgentOutput {
  return parseBinaryDecision(text, "Legal");
}

function parseCritic(text: string): ParsedAgentOutput {
  return parseBinaryDecision(text, "Critic");
}

function parseExecutor(text: string): ParsedAgentOutput {
  const obj = extractFirstJsonObject(text);
  if (typeof obj.body !== "string" || obj.body.trim().length === 0) {
    throw new TerminalPipelineError("Executor must produce a non-empty final body", "BAD_OUTPUT");
  }
  return {
    outcome: { kind: "pass" },
    artifact: { kind: "final_draft", body: obj.body, citations: Array.isArray(obj.citations) ? obj.citations : [] },
  };
}

function parseBiasMirror(text: string): ParsedAgentOutput {
  const obj = extractFirstJsonObject(text);
  if (typeof obj.decision === "string") obj.decision = obj.decision.toUpperCase();
  const result = biasReportSchema.safeParse(obj);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new TerminalPipelineError(
      `BiasMirror output failed validation at ${first?.path.join(".") ?? "<root>"}: ${first?.message ?? "unknown"}`,
      "BAD_OUTPUT",
    );
  }
  const report = result.data;
  const artifact: Record<string, unknown> = {
    kind: "bias_report",
    decision: report.decision,
    findings: report.findings,
  };
  if (report.decision === "BLOCK") {
    return { outcome: { kind: "block", reasonCode: "BIAS_BLOCKED" }, artifact };
  }
  return { outcome: { kind: "pass" }, artifact };
}

const PARSERS: Partial<Record<AgentRole, (text: string) => ParsedAgentOutput>> = {
  Architect: parseArchitect,
  Critic: parseCritic,
  Legal: parseLegal,
  Executor: parseExecutor,
  BiasMirror: parseBiasMirror,
};

export function parseRoleOutput(role: AgentRole, text: string): ParsedAgentOutput {
  const parser = PARSERS[role];
  if (!parser) {
    throw new TerminalPipelineError(`No output parser registered for role '${role}'`, "UNSUPPORTED_ROLE");
  }
  return parser(text);
}
