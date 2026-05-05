import { z } from "zod";

export const CONSTITUTION_MUTABILITY = [
  "IMMUTABLE",
  "AMENDABLE_SIMPLE",
  "AMENDABLE_SUPERMAJORITY",
  "AMENDABLE_REFERENDUM",
] as const;

export type ConstitutionMutability = (typeof CONSTITUTION_MUTABILITY)[number];

export const constitutionMutabilitySchema = z.enum(CONSTITUTION_MUTABILITY);

// Stable IDs follow CONST-K{book}-A{article}[.{sub}]* — never change once assigned.
export const constitutionStableIdSchema = z
  .string()
  .regex(/^CONST-K\d+-A\d+(\.\d+)*$/, "stable_id must match CONST-K<n>-A<n>[.<n>]+");

export const constitutionArticleSchema = z.object({
  stable_id: constitutionStableIdSchema,
  version: z.number().int().positive().default(1),
  mutability: constitutionMutabilitySchema,
  title: z.string().trim().min(1),
  body: z.string().min(1),
});

export type ConstitutionArticleInput = z.infer<typeof constitutionArticleSchema>;

export class ImmutableArticleError extends Error {
  constructor(public readonly stableId: string) {
    super(`ConstitutionArticle ${stableId} is IMMUTABLE and cannot be mutated`);
    this.name = "ImmutableArticleError";
  }
}

export function assertMutationAllowed(article: { stable_id: string; mutability: ConstitutionMutability }): void {
  if (article.mutability === "IMMUTABLE") {
    throw new ImmutableArticleError(article.stable_id);
  }
}
