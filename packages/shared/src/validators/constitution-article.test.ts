import { describe, expect, it } from "vitest";
import {
  ImmutableArticleError,
  assertMutationAllowed,
  constitutionArticleSchema,
  constitutionStableIdSchema,
} from "./constitution-article.js";

describe("constitution stable id format", () => {
  it("accepts canonical and nested forms", () => {
    expect(constitutionStableIdSchema.safeParse("CONST-K1-A1").success).toBe(true);
    expect(constitutionStableIdSchema.safeParse("CONST-K1-A2.1").success).toBe(true);
    expect(constitutionStableIdSchema.safeParse("CONST-K12-A3.4.5").success).toBe(true);
  });

  it("rejects malformed ids", () => {
    for (const id of ["", "K1-A1", "const-k1-a1", "CONST-A1", "CONST-K1-A", "CONST-K1-A1-extra"]) {
      expect(constitutionStableIdSchema.safeParse(id).success).toBe(false);
    }
  });
});

describe("constitution article mutation guard", () => {
  it("blocks mutation of IMMUTABLE articles", () => {
    expect(() =>
      assertMutationAllowed({ stable_id: "CONST-K1-A1", mutability: "IMMUTABLE" }),
    ).toThrow(ImmutableArticleError);
  });

  it("permits mutation of amendable articles", () => {
    for (const mutability of ["AMENDABLE_SIMPLE", "AMENDABLE_SUPERMAJORITY", "AMENDABLE_REFERENDUM"] as const) {
      expect(() => assertMutationAllowed({ stable_id: "CONST-K1-A2", mutability })).not.toThrow();
    }
  });
});

describe("constitution article schema", () => {
  it("requires mutability and a valid stable id", () => {
    const parsed = constitutionArticleSchema.safeParse({
      stable_id: "CONST-K1-A1",
      mutability: "IMMUTABLE",
      title: "Founding article",
      body: "We hold these truths.",
    });
    expect(parsed.success).toBe(true);
  });
});
