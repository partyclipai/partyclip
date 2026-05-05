import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@partyclipai/db";
import {
  activityLog,
  artifacts,
  operatorActions,
  patchStageRuns,
  patches,
} from "@partyclipai/db";
import type { PatchClassification, PatchState } from "@partyclipai/shared/types/patch";
import type { OperatorActionPlan } from "./operator-actions/planner.js";

/**
 * Read-and-act service for the operator UI / API. List + detail + the
 * transactional applier for operator-action plans produced by
 * planOperatorAction(). The planner stays pure; the side-effects all
 * live here in a single transaction so an aborted SIGNOFF/KILL never
 * leaves a half-written audit trail.
 */

export interface PatchSummary {
  id: string;
  title: string;
  classification: PatchClassification;
  state: PatchState;
  costTotal: string;
  publishedAt: Date | null;
  pausedAt: Date | null;
  killedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PatchDetail extends PatchSummary {
  body: string;
  citations: ReadonlyArray<{ stable_id: string; relevance: string }>;
  pipelineId: string | null;
  stageRuns: ReadonlyArray<StageRunRow>;
}

export interface StageRunRow {
  id: string;
  stage: string;
  agentRole: string;
  agentId: string | null;
  model: string | null;
  decision: string | null;
  reasonCode: string | null;
  cost: string;
  durationMs: number | null;
  attempt: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  outputArtifactId: string | null;
}

export interface ListPatchesFilters {
  companyId: string;
  state?: PatchState;
  classification?: PatchClassification;
  limit?: number;
}

export interface ApplyOperatorPlanInput {
  plan: OperatorActionPlan;
  patchId: string;
  /** "system" or operator id; written into activity_log.actor_id. */
  actorId: string;
}

export class PatchNotFoundError extends Error {
  constructor(public readonly patchId: string) {
    super(`patch ${patchId} not found`);
    this.name = "PatchNotFoundError";
  }
}

export class StaleStateError extends Error {
  constructor(public readonly expected: PatchState, public readonly actual: PatchState) {
    super(`patch state changed: expected ${expected}, found ${actual}`);
    this.name = "StaleStateError";
  }
}

export function patchService(db: Db) {
  async function listPatches(filters: ListPatchesFilters): Promise<PatchSummary[]> {
    const conditions = [eq(patches.companyId, filters.companyId)];
    if (filters.state) conditions.push(eq(patches.state, filters.state));
    if (filters.classification) conditions.push(eq(patches.classification, filters.classification));

    const rows = await db
      .select({
        id: patches.id,
        title: patches.title,
        classification: patches.classification,
        state: patches.state,
        costTotal: patches.costTotal,
        publishedAt: patches.publishedAt,
        pausedAt: patches.pausedAt,
        killedAt: patches.killedAt,
        createdAt: patches.createdAt,
        updatedAt: patches.updatedAt,
      })
      .from(patches)
      .where(and(...conditions))
      .orderBy(desc(patches.updatedAt))
      .limit(Math.min(Math.max(filters.limit ?? 50, 1), 500));

    return rows.map((r) => ({
      ...r,
      classification: r.classification as PatchClassification,
      state: r.state as PatchState,
    }));
  }

  async function getPatchDetail(patchId: string, companyId: string): Promise<PatchDetail | null> {
    const [row] = await db
      .select()
      .from(patches)
      .where(and(eq(patches.id, patchId), eq(patches.companyId, companyId)))
      .limit(1);
    if (!row) return null;

    const stageRunRows = await db
      .select({
        id: patchStageRuns.id,
        stage: patchStageRuns.stage,
        agentRole: patchStageRuns.agentRole,
        agentId: patchStageRuns.agentId,
        model: patchStageRuns.model,
        decision: patchStageRuns.decision,
        reasonCode: patchStageRuns.reasonCode,
        cost: patchStageRuns.cost,
        durationMs: patchStageRuns.durationMs,
        attempt: patchStageRuns.attempt,
        startedAt: patchStageRuns.startedAt,
        finishedAt: patchStageRuns.finishedAt,
        outputArtifactId: patchStageRuns.outputArtifactId,
      })
      .from(patchStageRuns)
      .where(eq(patchStageRuns.patchId, patchId))
      .orderBy(desc(patchStageRuns.createdAt));

    return {
      id: row.id,
      title: row.title,
      classification: row.classification as PatchClassification,
      state: row.state as PatchState,
      body: row.body,
      citations: (row.citations ?? []) as PatchDetail["citations"],
      pipelineId: row.pipelineId,
      costTotal: row.costTotal,
      publishedAt: row.publishedAt,
      pausedAt: row.pausedAt,
      killedAt: row.killedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      stageRuns: stageRunRows,
    };
  }

  /** Inserts the operator-action row, applies the patch transition, and writes the activity_log event. */
  async function applyOperatorPlan(input: ApplyOperatorPlanInput): Promise<void> {
    const { plan, patchId, actorId } = input;
    await db.transaction(async (tx) => {
      // Read the latest state inside the txn so two concurrent operators can't both SIGNOFF.
      const [current] = await tx
        .select({ state: patches.state })
        .from(patches)
        .where(eq(patches.id, patchId))
        .limit(1);
      if (!current) throw new PatchNotFoundError(patchId);

      if (plan.patchTransition) {
        const expected = plan.patchTransition.from;
        if ((current.state as PatchState) !== expected) {
          throw new StaleStateError(expected, current.state as PatchState);
        }
      }

      await tx.insert(operatorActions).values({
        companyId: plan.insertOperatorAction.companyId,
        patchId: plan.insertOperatorAction.patchId ?? null,
        action: plan.insertOperatorAction.action,
        operatorUserId: plan.insertOperatorAction.operatorUserId,
        rationale: plan.insertOperatorAction.rationale,
        visibilityClass: plan.insertOperatorAction.visibilityClass,
      });

      if (plan.patchTransition) {
        const transition = plan.patchTransition;
        const updates: Record<string, unknown> = {
          state: transition.to,
          updatedAt: sql`now()`,
        };
        if (transition.to === "PUBLISHED") updates.publishedAt = sql`now()`;
        if (transition.to === "KILLED") updates.killedAt = sql`now()`;
        if (transition.to === "REPEALED") updates.repealedAt = sql`now()`;
        await tx.update(patches).set(updates).where(eq(patches.id, patchId));
      }

      await tx.insert(activityLog).values({
        companyId: plan.insertOperatorAction.companyId,
        actorType: "user",
        actorId,
        action: plan.event.type,
        entityType: "patch",
        entityId: patchId,
        details: plan.event.payload as Record<string, unknown>,
      });
    });
  }

  return { listPatches, getPatchDetail, applyOperatorPlan, _table: { artifacts } };
}

export type PatchService = ReturnType<typeof patchService>;
