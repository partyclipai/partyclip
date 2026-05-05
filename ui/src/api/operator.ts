import { getOperatorToken } from "@/lib/operator-token";

const BASE = "/api";

export type PatchState =
  | "DRAFTING"
  | "CRITIQUE"
  | "RISK_ASSESS"
  | "EXECUTOR"
  | "BIAS_MIRROR"
  | "AWAITING_SIGNOFF"
  | "PUBLISHED"
  | "REPEALED"
  | "KILLED";

export type PatchClassification = "REGULAR" | "CROSS_CUTTING" | "CONSTITUTIONAL";

export interface PatchSummary {
  id: string;
  title: string;
  classification: PatchClassification;
  state: PatchState;
  costTotal: string;
  publishedAt: string | null;
  pausedAt: string | null;
  killedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  startedAt: string | null;
  finishedAt: string | null;
  outputArtifactId: string | null;
}

export interface PatchDetail extends PatchSummary {
  body: string;
  citations: ReadonlyArray<{ stable_id: string; relevance: string }>;
  pipelineId: string | null;
  stageRuns: ReadonlyArray<StageRunRow>;
}

export interface BiasFinding {
  id: string;
  reportId: string;
  category: string;
  severity: string;
  quote: string;
  explanation: string;
  suggestion: string;
}

export interface BiasReport {
  id: string;
  stageRunId: string;
  overallDecision: string;
  createdAt: string;
  findings: BiasFinding[];
}

export class OperatorApiError extends Error {
  constructor(
    public status: number,
    public errorCode: string,
    public details: unknown,
  ) {
    super(`${status} ${errorCode}`);
    this.name = "OperatorApiError";
  }
}

export class MissingOperatorTokenError extends Error {
  constructor() {
    super("operator token not set");
    this.name = "MissingOperatorTokenError";
  }
}

async function operatorRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getOperatorToken();
  if (!token) throw new MissingOperatorTokenError();

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    // No credentials: this surface uses bearer auth only, not the cookie session.
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const code = (body as { error?: string }).error ?? `http_${res.status}`;
    throw new OperatorApiError(res.status, code, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const OPERATOR_ACTION_PATHS = [
  "intercept",
  "signoff",
  "kill",
  "repeal",
  "reinstate",
  "override-bias",
  "override-vote",
] as const;

export type OperatorActionPath = (typeof OPERATOR_ACTION_PATHS)[number];

export interface ActionResponse {
  ok: true;
  action: string;
  patchId: string;
  transition: { from: PatchState; to: PatchState } | null;
}

export interface ListPatchesParams {
  state?: PatchState[];
  classification?: PatchClassification[];
  limit?: number;
}

function buildQuery(params: ListPatchesParams): string {
  const sp = new URLSearchParams();
  // The server accepts a single value per filter today; if multiple states
  // are selected we fan out client-side. Keep this single-valued for now and
  // note the limitation in the UI.
  if (params.state && params.state.length === 1) sp.set("state", params.state[0]);
  if (params.classification && params.classification.length === 1) {
    sp.set("classification", params.classification[0]);
  }
  if (params.limit != null) sp.set("limit", String(params.limit));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function fanOut<T>(values: T[] | undefined, fetchOne: (v: T | undefined) => Promise<PatchSummary[]>): Promise<PatchSummary[]> {
  if (!values || values.length <= 1) return fetchOne(values?.[0]);
  const lists = await Promise.all(values.map((v) => fetchOne(v)));
  const seen = new Set<string>();
  const merged: PatchSummary[] = [];
  for (const list of lists) {
    for (const p of list) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      merged.push(p);
    }
  }
  merged.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return merged;
}

export const operatorApi = {
  async listPatches(params: ListPatchesParams = {}): Promise<PatchSummary[]> {
    const states = params.state;
    const classes = params.classification;
    return fanOut(states, async (state) => {
      const list = await fanOut(classes, async (classification) => {
        const single: ListPatchesParams = {
          ...(state ? { state: [state] } : {}),
          ...(classification ? { classification: [classification] } : {}),
          ...(params.limit ? { limit: params.limit } : {}),
        };
        const data = await operatorRequest<{ patches: PatchSummary[] }>(
          `/patches${buildQuery(single)}`,
        );
        return data.patches;
      });
      return list;
    });
  },

  async getPatch(id: string): Promise<PatchDetail> {
    const data = await operatorRequest<{ patch: PatchDetail }>(`/patches/${id}`);
    return data.patch;
  },

  async getBiasReports(id: string): Promise<BiasReport[]> {
    const data = await operatorRequest<{ reports: BiasReport[] }>(
      `/patches/${id}/bias-reports`,
    );
    return data.reports;
  },

  async runAction(
    id: string,
    action: OperatorActionPath,
    rationale: string,
  ): Promise<ActionResponse> {
    return operatorRequest<ActionResponse>(`/patches/${id}/${action}`, {
      method: "POST",
      body: JSON.stringify({ rationale }),
    });
  },
};

export const RATIONALE_MIN = 8;
export const RATIONALE_MAX = 4000;
