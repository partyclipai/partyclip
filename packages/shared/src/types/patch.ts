export const PATCH_STATES = [
  "DRAFTING",
  "CRITIQUE",
  "RISK_ASSESS",
  "EXECUTOR",
  "BIAS_MIRROR",
  "AWAITING_SIGNOFF",
  "PUBLISHED",
  "REPEALED",
  "KILLED",
] as const;

export type PatchState = (typeof PATCH_STATES)[number];

export const PATCH_CLASSIFICATIONS = ["REGULAR", "CROSS_CUTTING", "CONSTITUTIONAL"] as const;
export type PatchClassification = (typeof PATCH_CLASSIFICATIONS)[number];

// Per docs/handoff/04_PIPELINE.md. Normal forward edges plus rejection edges
// from any post-DRAFTING stage back to DRAFTING. Operator interventions
// (KILL/REPEAL) and BUDGET_EXCEEDED can transition into terminal states from
// any non-terminal state and are validated separately at the call site.
const FORWARD: Record<PatchState, PatchState[]> = {
  DRAFTING: ["CRITIQUE"],
  CRITIQUE: ["RISK_ASSESS", "DRAFTING"],
  RISK_ASSESS: ["EXECUTOR", "DRAFTING"],
  EXECUTOR: ["BIAS_MIRROR", "DRAFTING"],
  BIAS_MIRROR: ["AWAITING_SIGNOFF", "DRAFTING"],
  AWAITING_SIGNOFF: ["PUBLISHED"],
  PUBLISHED: ["REPEALED"],
  REPEALED: [],
  KILLED: [],
};

export const TERMINAL_STATES: ReadonlySet<PatchState> = new Set(["REPEALED", "KILLED"]);

export const KILLABLE_FROM: ReadonlySet<PatchState> = new Set([
  "DRAFTING",
  "CRITIQUE",
  "RISK_ASSESS",
  "EXECUTOR",
  "BIAS_MIRROR",
  "AWAITING_SIGNOFF",
]);

export type TransitionKind = "forward" | "reject" | "kill" | "repeal";

export function isLegalTransition(
  from: PatchState,
  to: PatchState,
  kind: TransitionKind = "forward",
): boolean {
  if (kind === "kill") return KILLABLE_FROM.has(from) && to === "KILLED";
  if (kind === "repeal") return from === "PUBLISHED" && to === "REPEALED";
  if (kind === "reject") return to === "DRAFTING" && FORWARD[from]?.includes("DRAFTING") === true;
  return FORWARD[from]?.includes(to) === true;
}
