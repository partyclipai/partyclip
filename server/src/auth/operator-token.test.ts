import { describe, expect, it } from "vitest";
import { authenticateOperatorToken, loadOperatorTokenConfig } from "./operator-token.js";

const CFG = { token: "test-secret-token-1234567890", operatorId: "op-1" } as const;

describe("operator token config", () => {
  it("returns null when env var is unset", () => {
    expect(loadOperatorTokenConfig({})).toBeNull();
  });

  it("loads token + default operator id", () => {
    const cfg = loadOperatorTokenConfig({ PARTYCLIP_OPERATOR_TOKEN: "abc" });
    expect(cfg).toEqual({ token: "abc", operatorId: "operator" });
  });

  it("trims and accepts custom operator id", () => {
    const cfg = loadOperatorTokenConfig({
      PARTYCLIP_OPERATOR_TOKEN: "  abc  ",
      PARTYCLIP_OPERATOR_ID: "  alice  ",
    });
    expect(cfg).toEqual({ token: "abc", operatorId: "alice" });
  });
});

describe("authenticateOperatorToken", () => {
  it("rejects missing header", () => {
    expect(authenticateOperatorToken(CFG, undefined)).toEqual({ ok: false, error: "missing_bearer_token" });
  });

  it("rejects non-bearer scheme", () => {
    expect(authenticateOperatorToken(CFG, "Basic abc")).toEqual({ ok: false, error: "missing_bearer_token" });
  });

  it("rejects wrong token", () => {
    expect(authenticateOperatorToken(CFG, "Bearer wrong")).toEqual({ ok: false, error: "invalid_operator_token" });
  });

  it("rejects token of equal length but different bytes (timing-safe-equal sanity)", () => {
    const wrong = "x".repeat(CFG.token.length);
    expect(authenticateOperatorToken(CFG, `Bearer ${wrong}`)).toEqual({ ok: false, error: "invalid_operator_token" });
  });

  it("accepts the canonical token", () => {
    const result = authenticateOperatorToken(CFG, `Bearer ${CFG.token}`);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.operator).toEqual({ id: "op-1", source: "bearer-token" });
  });

  it("is case-insensitive on the scheme", () => {
    expect(authenticateOperatorToken(CFG, `bearer ${CFG.token}`).ok).toBe(true);
    expect(authenticateOperatorToken(CFG, `BEARER ${CFG.token}`).ok).toBe(true);
  });
});
