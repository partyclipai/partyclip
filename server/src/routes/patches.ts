import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Db } from "@partyclipai/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { patches, biasReports, biasFindings } from "@partyclipai/db";
import type { PatchClassification, PatchState } from "@partyclipai/shared/types/patch";
import {
  operatorTokenMiddleware,
  type OperatorTokenConfig,
} from "../auth/operator-token.js";
import {
  OPERATOR_ACTIONS,
  RATIONALE_LIMITS,
  planOperatorAction,
  type OperatorAction,
} from "../services/operator-actions/planner.js";
import {
  PatchNotFoundError,
  StaleStateError,
  patchService,
} from "../services/patches.js";
import { logger } from "../middleware/logger.js";

/**
 * Operator-only API surface for Phase 1. All routes require a valid
 * Authorization: Bearer <token> header where the token matches
 * PARTYCLIP_OPERATOR_TOKEN. Every action endpoint requires a non-empty
 * rationale; rationale is logged into the activity_log and marked
 * visibility_class = PUBLIC.
 *
 * Mount under /api — see plans/.../soft-lantern.md Stage 5.
 */

const rationaleSchema = z
  .string()
  .trim()
  .min(RATIONALE_LIMITS.min, `rationale must be at least ${RATIONALE_LIMITS.min} characters`)
  .max(RATIONALE_LIMITS.max, `rationale must not exceed ${RATIONALE_LIMITS.max} characters`);

const actionBodySchema = z.object({ rationale: rationaleSchema }).strict();

const ACTION_PATH_TO_ENUM: Readonly<Record<string, OperatorAction>> = {
  intercept: "INTERCEPT",
  signoff: "SIGNOFF",
  kill: "KILL",
  repeal: "REPEAL",
  reinstate: "REINSTATE",
  "override-bias": "OVERRIDE_BIAS",
  "override-vote": "OVERRIDE_VOTE",
};

export interface PatchRoutesOptions {
  /** Provided by the host; if absent, operator endpoints return 503. */
  operatorAuth: OperatorTokenConfig | null;
  /** The single deployment company. Phase 1 is single-tenant. */
  defaultCompanyId: string;
}

export function patchRoutes(db: Db, opts: PatchRoutesOptions): Router {
  const router = Router();
  const svc = patchService(db);

  if (!opts.operatorAuth) {
    router.use((_req, res) => {
      res.status(503).json({ error: "operator_endpoints_disabled", reason: "PARTYCLIP_OPERATOR_TOKEN not configured" });
    });
    return router;
  }

  router.use(operatorTokenMiddleware(opts.operatorAuth));

  router.get("/patches", async (req: Request, res: Response) => {
    const stateParam = (req.query.state as string | undefined) ?? undefined;
    const classParam = (req.query.classification as string | undefined) ?? undefined;
    const limitParam = req.query.limit ? Number(req.query.limit) : undefined;

    const summaries = await svc.listPatches({
      companyId: opts.defaultCompanyId,
      state: stateParam as PatchState | undefined,
      classification: classParam as PatchClassification | undefined,
      limit: limitParam,
    });
    res.json({ patches: summaries });
  });

  router.get("/patches/:id", async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const detail = await svc.getPatchDetail(id, opts.defaultCompanyId);
    if (!detail) {
      res.status(404).json({ error: "patch_not_found" });
      return;
    }
    res.json({ patch: detail });
  });

  router.get("/patches/:id/bias-reports", async (req: Request, res: Response) => {
    const patchId = String(req.params.id);
    const [patchRow] = await db
      .select({ id: patches.id })
      .from(patches)
      .where(and(eq(patches.id, patchId), eq(patches.companyId, opts.defaultCompanyId)))
      .limit(1);
    if (!patchRow) {
      res.status(404).json({ error: "patch_not_found" });
      return;
    }
    const reportRows = await db
      .select({
        id: biasReports.id,
        stageRunId: biasReports.stageRunId,
        overallDecision: biasReports.overallDecision,
        createdAt: biasReports.createdAt,
      })
      .from(biasReports)
      .where(eq(biasReports.patchId, patchId))
      .orderBy(desc(biasReports.createdAt));
    if (reportRows.length === 0) {
      res.json({ reports: [] });
      return;
    }
    const findingRows = await db
      .select({
        id: biasFindings.id,
        reportId: biasFindings.reportId,
        category: biasFindings.category,
        severity: biasFindings.severity,
        quote: biasFindings.quote,
        explanation: biasFindings.explanation,
        suggestion: biasFindings.suggestion,
      })
      .from(biasFindings)
      .where(inArray(biasFindings.reportId, reportRows.map((r) => r.id)));
    const findingsByReport = new Map<string, typeof findingRows>();
    for (const f of findingRows) {
      const arr = findingsByReport.get(f.reportId) ?? [];
      arr.push(f);
      findingsByReport.set(f.reportId, arr);
    }
    res.json({
      reports: reportRows.map((r) => ({
        ...r,
        findings: findingsByReport.get(r.id) ?? [],
      })),
    });
  });

  for (const [path, action] of Object.entries(ACTION_PATH_TO_ENUM)) {
    router.post(`/patches/:id/${path}`, async (req, res) => handleAction(action, req, res));
  }

  async function handleAction(action: OperatorAction, req: Request, res: Response) {
    const operator = req.operator;
    if (!operator) {
      res.status(401).json({ error: "operator_required" });
      return;
    }
    const parsed = actionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "invalid_body",
        details: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      });
      return;
    }

    const patchId = String(req.params.id);
    const [row] = await db
      .select({ state: patches.state, companyId: patches.companyId })
      .from(patches)
      .where(and(eq(patches.id, patchId), eq(patches.companyId, opts.defaultCompanyId)))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "patch_not_found" });
      return;
    }

    const planResult = planOperatorAction({
      action,
      patchId,
      companyId: row.companyId,
      operatorId: operator.id,
      rationale: parsed.data.rationale,
      currentPatchState: row.state as PatchState,
    });
    if (planResult.kind === "error") {
      res.status(planResult.code === "RATIONALE_INVALID" ? 400 : 409).json({
        error: planResult.code,
        message: planResult.message,
      });
      return;
    }

    try {
      await svc.applyOperatorPlan({ plan: planResult.plan, patchId, actorId: operator.id });
    } catch (err) {
      if (err instanceof StaleStateError) {
        res.status(409).json({ error: "stale_state", message: err.message });
        return;
      }
      if (err instanceof PatchNotFoundError) {
        res.status(404).json({ error: "patch_not_found" });
        return;
      }
      logger.error({ err, action, patchId }, "operator action failed");
      res.status(500).json({ error: "internal_error" });
      return;
    }

    res.status(202).json({
      ok: true,
      action,
      patchId,
      transition: planResult.plan.patchTransition,
    });
  }

  return router;
}

export const OPERATOR_ROUTE_ACTIONS = Object.keys(ACTION_PATH_TO_ENUM);
export { OPERATOR_ACTIONS };
