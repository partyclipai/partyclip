import { z } from "zod";
import { PATCH_CLASSIFICATIONS, PATCH_STATES, isLegalTransition, type PatchState, type TransitionKind } from "../types/patch.js";

export const patchStateSchema = z.enum(PATCH_STATES);
export const patchClassificationSchema = z.enum(PATCH_CLASSIFICATIONS);

export const patchCitationRelevanceSchema = z.enum(["supporting", "tension", "opposing"]);

export const patchCitationSchema = z.object({
  stable_id: z.string().trim().min(1),
  relevance: patchCitationRelevanceSchema,
});
export type PatchCitation = z.infer<typeof patchCitationSchema>;

export const createPatchInputSchema = z.object({
  title: z.string().trim().min(1).max(500),
  classification: patchClassificationSchema.default("REGULAR"),
  body: z.string().default(""),
  citations: z.array(patchCitationSchema).default([]),
  pipelineId: z.string().trim().min(1).optional(),
});
export type CreatePatchInput = z.infer<typeof createPatchInputSchema>;

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: PatchState,
    public readonly to: PatchState,
    public readonly kind: TransitionKind,
  ) {
    super(`Illegal patch transition: ${from} -> ${to} (${kind})`);
    this.name = "IllegalTransitionError";
  }
}

export function assertLegalTransition(
  from: PatchState,
  to: PatchState,
  kind: TransitionKind = "forward",
): void {
  if (!isLegalTransition(from, to, kind)) {
    throw new IllegalTransitionError(from, to, kind);
  }
}
