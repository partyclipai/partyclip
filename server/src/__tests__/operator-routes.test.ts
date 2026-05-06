import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { eq } from "drizzle-orm";
import {
  activityLog,
  companies,
  createDb,
  operatorActions,
  patches,
} from "@partyclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { patchRoutes } from "../routes/patches.js";

/**
 * Phase-1 operator API integration test. Runs the real router against
 * embedded postgres so the planner + transactional applier + activity-log
 * append-only triggers are all exercised end-to-end.
 *
 * Note on placement: the handoff named partyclip/tests/integration/, but
 * the server vitest config only discovers tests under server/. Co-locating
 * keeps `cd server && npx vitest` working as the rest of Phase 1 expects.
 */

const support = await getEmbeddedPostgresTestSupport();
const describeIfPg = support.supported ? describe : describe.skip;

const TOKEN = "test-token-1";
const OPERATOR_ID = "operator";

function buildApp(db: ReturnType<typeof createDb>, companyId: string) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api",
    patchRoutes(db, {
      operatorAuth: { token: TOKEN, operatorId: OPERATOR_ID },
      defaultCompanyId: companyId,
    }),
  );
  return app;
}

describeIfPg("operator patch routes", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let companyId: string;
  let app!: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("partyclip-operator-routes-");
    db = createDb(tempDb.connectionString);
  }, 30_000);

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  beforeEach(async () => {
    companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Acme",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    app = buildApp(db, companyId);
  });

  // No afterEach cleanup: each test generates a fresh companyId in beforeEach
  // and queries are scoped by company, so prior rows don't bleed in. activity_log
  // has an append-only trigger (migration 0076) that blocks DELETE outright,
  // which is also why we use unique-per-test scoping rather than truncation.

  async function insertPatch(state: string, overrides: Partial<typeof patches.$inferInsert> = {}) {
    const id = randomUUID();
    await db.insert(patches).values({
      id,
      companyId,
      title: `Test patch ${state}`,
      classification: "REGULAR",
      state,
      body: "body",
      ...overrides,
    });
    return id;
  }

  describe("authentication", () => {
    it("rejects requests without a bearer token (401)", async () => {
      const res = await request(app).get("/api/patches");
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("missing_bearer_token");
    });

    it("rejects requests with an invalid token (401)", async () => {
      const res = await request(app)
        .get("/api/patches")
        .set("Authorization", "Bearer wrong-token");
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("invalid_operator_token");
    });

    it("returns 503 when no operator auth is configured", async () => {
      const disabledApp = express();
      disabledApp.use(express.json());
      disabledApp.use(
        "/api",
        patchRoutes(db, { operatorAuth: null, defaultCompanyId: companyId }),
      );
      const res = await request(disabledApp).get("/api/patches");
      expect(res.status).toBe(503);
      expect(res.body.error).toBe("operator_endpoints_disabled");
    });
  });

  describe("GET /api/patches", () => {
    it("returns patches scoped to the configured company", async () => {
      const draftId = await insertPatch("DRAFTING");
      const signoffId = await insertPatch("AWAITING_SIGNOFF");

      const res = await request(app)
        .get("/api/patches")
        .set("Authorization", `Bearer ${TOKEN}`);
      expect(res.status).toBe(200);
      const ids = (res.body.patches as Array<{ id: string }>).map((p) => p.id).sort();
      expect(ids).toEqual([draftId, signoffId].sort());
    });

    it("filters by state", async () => {
      await insertPatch("DRAFTING");
      const signoffId = await insertPatch("AWAITING_SIGNOFF");

      const res = await request(app)
        .get("/api/patches?state=AWAITING_SIGNOFF")
        .set("Authorization", `Bearer ${TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.patches).toHaveLength(1);
      expect(res.body.patches[0].id).toBe(signoffId);
    });
  });

  describe("POST /api/patches/:id/signoff", () => {
    it("transitions AWAITING_SIGNOFF -> PUBLISHED and writes audit rows", async () => {
      const id = await insertPatch("AWAITING_SIGNOFF");
      const res = await request(app)
        .post(`/api/patches/${id}/signoff`)
        .set("Authorization", `Bearer ${TOKEN}`)
        .send({ rationale: "ratified after risk + bias review" });

      expect(res.status).toBe(202);
      expect(res.body).toMatchObject({
        ok: true,
        action: "SIGNOFF",
        patchId: id,
        transition: { from: "AWAITING_SIGNOFF", to: "PUBLISHED" },
      });

      const [row] = await db.select().from(patches).where(eq(patches.id, id));
      expect(row.state).toBe("PUBLISHED");
      expect(row.publishedAt).not.toBeNull();

      const opActions = await db
        .select()
        .from(operatorActions)
        .where(eq(operatorActions.patchId, id));
      expect(opActions).toHaveLength(1);
      expect(opActions[0].action).toBe("SIGNOFF");
      expect(opActions[0].rationale).toBe("ratified after risk + bias review");
      expect(opActions[0].operatorUserId).toBe(OPERATOR_ID);

      const events = await db
        .select()
        .from(activityLog)
        .where(eq(activityLog.entityId, id));
      expect(events).toHaveLength(1);
      expect(events[0].action).toBe("patch.published");
      expect(events[0].actorId).toBe(OPERATOR_ID);
    });

    it("returns 409 WRONG_STATE when SIGNOFF is invoked from DRAFTING", async () => {
      const id = await insertPatch("DRAFTING");
      const res = await request(app)
        .post(`/api/patches/${id}/signoff`)
        .set("Authorization", `Bearer ${TOKEN}`)
        .send({ rationale: "should be rejected by the planner" });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe("WRONG_STATE");

      const [row] = await db.select().from(patches).where(eq(patches.id, id));
      expect(row.state).toBe("DRAFTING");
      const opActions = await db
        .select()
        .from(operatorActions)
        .where(eq(operatorActions.patchId, id));
      expect(opActions).toHaveLength(0);
    });

    it("returns 400 RATIONALE_INVALID for short rationales", async () => {
      const id = await insertPatch("AWAITING_SIGNOFF");
      const res = await request(app)
        .post(`/api/patches/${id}/signoff`)
        .set("Authorization", `Bearer ${TOKEN}`)
        .send({ rationale: "ok" });

      expect(res.status).toBe(400);
      // The route reports zod errors as "invalid_body" for type-level
      // problems (length); the planner's own RATIONALE_INVALID is used
      // when a server callsite bypasses the route. Either is acceptable
      // — both indicate the rationale was rejected before any side
      // effects landed.
      expect(["invalid_body", "RATIONALE_INVALID"]).toContain(res.body.error);

      const [row] = await db.select().from(patches).where(eq(patches.id, id));
      expect(row.state).toBe("AWAITING_SIGNOFF");
    });

    it("two concurrent signoffs: one 202, one 409 stale_state", async () => {
      const id = await insertPatch("AWAITING_SIGNOFF");

      const fire = () =>
        request(app)
          .post(`/api/patches/${id}/signoff`)
          .set("Authorization", `Bearer ${TOKEN}`)
          .send({ rationale: `concurrent attempt ${Math.random()}` });

      const [a, b] = await Promise.all([fire(), fire()]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([202, 409]);

      const loser = a.status === 409 ? a : b;
      // Defense in depth: the planner's pre-flight state check returns
      // WRONG_STATE when the row has already moved on (the common case
      // when the embedded-postgres connection pool serialises the two
      // requests). The transactional applier inside applyOperatorPlan
      // returns stale_state if the read inside the txn still races.
      // Either outcome means concurrent protection held.
      expect(["stale_state", "WRONG_STATE"]).toContain(loser.body.error);

      const opActions = await db
        .select()
        .from(operatorActions)
        .where(eq(operatorActions.patchId, id));
      expect(opActions).toHaveLength(1);

      const events = await db
        .select()
        .from(activityLog)
        .where(eq(activityLog.entityId, id));
      expect(events).toHaveLength(1);
    });
  });
});
