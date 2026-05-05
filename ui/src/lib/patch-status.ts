import type {
  OperatorActionPath,
  PatchClassification,
  PatchState,
} from "@/api/operator";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost";

// Map onto existing badge variants — no new tokens. The mapping is centralised
// here so list and detail views stay consistent. PUBLISHED reads as the
// "primary success" (default), terminal-bad states as destructive, terminal
// neutrals as ghost, and active pipeline states as secondary so the operator
// eye is drawn to AWAITING_SIGNOFF (outline = needs attention).
const STATE_VARIANT: Record<PatchState, BadgeVariant> = {
  DRAFTING: "secondary",
  CRITIQUE: "secondary",
  RISK_ASSESS: "secondary",
  EXECUTOR: "secondary",
  BIAS_MIRROR: "secondary",
  AWAITING_SIGNOFF: "outline",
  PUBLISHED: "default",
  REPEALED: "ghost",
  KILLED: "destructive",
};

const CLASSIFICATION_VARIANT: Record<PatchClassification, BadgeVariant> = {
  REGULAR: "ghost",
  CROSS_CUTTING: "secondary",
  CONSTITUTIONAL: "outline",
};

export function patchStateVariant(state: PatchState): BadgeVariant {
  return STATE_VARIANT[state];
}

export function patchClassificationVariant(c: PatchClassification): BadgeVariant {
  return CLASSIFICATION_VARIANT[c];
}

export const PATCH_STATES: ReadonlyArray<PatchState> = [
  "DRAFTING",
  "CRITIQUE",
  "RISK_ASSESS",
  "EXECUTOR",
  "BIAS_MIRROR",
  "AWAITING_SIGNOFF",
  "PUBLISHED",
  "REPEALED",
  "KILLED",
];

export const PATCH_CLASSIFICATIONS: ReadonlyArray<PatchClassification> = [
  "REGULAR",
  "CROSS_CUTTING",
  "CONSTITUTIONAL",
];

// Mirrors server-side planner rules. Server is authoritative — UI uses this
// only to decide which buttons to render. A 409 is still possible if state
// changed under the operator.
export function availableActions(state: PatchState): OperatorActionPath[] {
  switch (state) {
    case "DRAFTING":
    case "CRITIQUE":
    case "RISK_ASSESS":
    case "EXECUTOR":
      return ["intercept", "kill"];
    case "BIAS_MIRROR":
      return ["intercept", "kill", "override-bias"];
    case "AWAITING_SIGNOFF":
      return ["signoff", "intercept", "kill", "override-vote"];
    case "PUBLISHED":
      return ["repeal"];
    case "REPEALED":
      return ["reinstate"];
    case "KILLED":
      return [];
  }
}

export function actionLabel(action: OperatorActionPath): string {
  switch (action) {
    case "intercept": return "Intercept";
    case "signoff": return "Sign off";
    case "kill": return "Kill";
    case "repeal": return "Repeal";
    case "reinstate": return "Reinstate";
    case "override-bias": return "Override bias";
    case "override-vote": return "Override vote";
  }
}

export function actionTone(action: OperatorActionPath): "default" | "destructive" {
  return action === "kill" || action === "repeal" ? "destructive" : "default";
}

export function formatCost(cost: string | number | null | undefined): string {
  if (cost == null) return "$0.00";
  const n = typeof cost === "string" ? Number(cost) : cost;
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diffMs = Date.now() - t;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}
