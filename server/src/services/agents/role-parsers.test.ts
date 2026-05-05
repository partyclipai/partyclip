import { describe, expect, it } from "vitest";
import { parseRoleOutput } from "./role-parsers.js";
import { TerminalPipelineError } from "../pipelines/errors.js";

describe("role parsers — Architect", () => {
  it("accepts a body and citations", () => {
    const out = parseRoleOutput("Architect", `{"body":"# Title\\n\\nFirst draft.","citations":[{"stable_id":"CONST-K1-A1","relevance":"supporting"}]}`);
    expect(out.outcome.kind).toBe("pass");
    expect(out.artifact.kind).toBe("draft");
  });

  it("rejects empty body", () => {
    expect(() => parseRoleOutput("Architect", `{"body":""}`)).toThrow(TerminalPipelineError);
  });
});

describe("role parsers — Critic / Legal (binary)", () => {
  it("PASS yields a pass outcome", () => {
    expect(parseRoleOutput("Critic", `{"decision":"PASS"}`).outcome.kind).toBe("pass");
    expect(parseRoleOutput("Legal", `{"decision":"PASS"}`).outcome.kind).toBe("pass");
  });

  it("REJECT requires a SCREAMING_SNAKE reason_code", () => {
    expect(parseRoleOutput("Critic", `{"decision":"REJECT","reason_code":"WEAK_DRAFT"}`).outcome).toEqual({
      kind: "reject",
      reasonCode: "WEAK_DRAFT",
    });
    expect(() =>
      parseRoleOutput("Critic", `{"decision":"REJECT","reason_code":"weak draft"}`),
    ).toThrow(TerminalPipelineError);
    expect(() =>
      parseRoleOutput("Critic", `{"decision":"REJECT"}`),
    ).toThrow(TerminalPipelineError);
  });

  it("DEFER yields defer", () => {
    expect(parseRoleOutput("Legal", `{"decision":"DEFER"}`).outcome.kind).toBe("defer");
  });

  it("rejects unknown decision", () => {
    expect(() => parseRoleOutput("Critic", `{"decision":"MAYBE"}`)).toThrow(TerminalPipelineError);
  });
});

describe("role parsers — Executor", () => {
  it("requires a final body", () => {
    expect(parseRoleOutput("Executor", `{"body":"final"}`).artifact.kind).toBe("final_draft");
    expect(() => parseRoleOutput("Executor", `{"body":""}`)).toThrow(TerminalPipelineError);
  });
});

describe("role parsers — BiasMirror", () => {
  it("PASS keeps patch moving", () => {
    const out = parseRoleOutput("BiasMirror", `{"decision":"PASS","findings":[]}`);
    expect(out.outcome.kind).toBe("pass");
  });

  it("FLAG keeps patch moving but records findings", () => {
    const out = parseRoleOutput(
      "BiasMirror",
      `{"decision":"FLAG","findings":[{"category":"tone-drift","severity":"LOW"}]}`,
    );
    expect(out.outcome.kind).toBe("pass");
    expect((out.artifact.findings as unknown[])).toHaveLength(1);
  });

  it("BLOCK sends back to drafting with BIAS_BLOCKED", () => {
    const out = parseRoleOutput("BiasMirror", `{"decision":"BLOCK","findings":[]}`);
    expect(out.outcome).toEqual({ kind: "block", reasonCode: "BIAS_BLOCKED" });
  });
});

describe("role parsers — JSON extraction", () => {
  it("extracts JSON inside a fenced code block", () => {
    const out = parseRoleOutput("Critic", "Here is my answer:\n```json\n{\"decision\":\"PASS\"}\n```");
    expect(out.outcome.kind).toBe("pass");
  });

  it("extracts the first balanced JSON object even with prose", () => {
    const out = parseRoleOutput("Critic", "Thinking... { \"decision\": \"PASS\" } done.");
    expect(out.outcome.kind).toBe("pass");
  });

  it("fails cleanly when no JSON is present", () => {
    expect(() => parseRoleOutput("Critic", "no json here")).toThrow(TerminalPipelineError);
  });
});
