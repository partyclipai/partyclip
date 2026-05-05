import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

/**
 * Phase 1 operator authentication: the simplest thing that works.
 * A single shared token sourced from PARTYCLIP_OPERATOR_TOKEN. Any
 * caller that presents `Authorization: Bearer <token>` with a
 * timing-safe-equal value is treated as the operator.
 *
 * No multi-operator auth, no user identity, no session storage.
 * Operator identity is stored as a free-form string ("operator"
 * by default, overrideable via PARTYCLIP_OPERATOR_ID) so the
 * audit log shows *who* without us pretending to know more than
 * we do.
 *
 * Replace before going public — see plans/.../soft-lantern.md.
 */

export interface OperatorPrincipal {
  readonly id: string;
  readonly source: "bearer-token";
}

declare global {
  namespace Express {
    interface Request {
      operator?: OperatorPrincipal;
    }
  }
}

export interface OperatorTokenConfig {
  readonly token: string;
  readonly operatorId: string;
}

export class OperatorTokenMissingError extends Error {
  constructor() {
    super("PARTYCLIP_OPERATOR_TOKEN is required to enable operator endpoints");
    this.name = "OperatorTokenMissingError";
  }
}

export function loadOperatorTokenConfig(env: NodeJS.ProcessEnv = process.env): OperatorTokenConfig | null {
  const token = env.PARTYCLIP_OPERATOR_TOKEN?.trim();
  if (!token) return null;
  const operatorId = env.PARTYCLIP_OPERATOR_ID?.trim() || "operator";
  return { token, operatorId };
}

function compareTokens(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function operatorTokenMiddleware(config: OperatorTokenConfig): RequestHandler {
  return (req, res, next) => {
    const header = req.header("authorization");
    if (!header?.toLowerCase().startsWith("bearer ")) {
      res.status(401).json({ error: "missing_bearer_token" });
      return;
    }
    const provided = header.slice("bearer ".length).trim();
    if (!compareTokens(provided, config.token)) {
      res.status(401).json({ error: "invalid_operator_token" });
      return;
    }
    req.operator = { id: config.operatorId, source: "bearer-token" };
    next();
  };
}

/** Convenience for tests + non-Express callers. */
export function authenticateOperatorToken(
  config: OperatorTokenConfig,
  authorizationHeader: string | undefined,
): { ok: true; operator: OperatorPrincipal } | { ok: false; error: string } {
  if (!authorizationHeader?.toLowerCase().startsWith("bearer ")) {
    return { ok: false, error: "missing_bearer_token" };
  }
  const provided = authorizationHeader.slice("bearer ".length).trim();
  if (!compareTokens(provided, config.token)) return { ok: false, error: "invalid_operator_token" };
  return { ok: true, operator: { id: config.operatorId, source: "bearer-token" } };
}
