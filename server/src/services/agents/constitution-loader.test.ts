import { describe, expect, it } from "vitest";
import { ConstitutionLoadError, parseConstitutionYaml } from "./constitution-loader.js";

const VALID = `
articles:
  - stable_id: CONST-K1-A1
    version: 1
    mutability: IMMUTABLE
    title: Purpose
    body: We exist to publish auditable policy.
  - stable_id: CONST-K1-A2
    mutability: AMENDABLE_SIMPLE
    title: Method
    body: We decide by structured pipeline.
`;

describe("parseConstitutionYaml", () => {
  it("parses and validates articles (version defaults to 1)", () => {
    const articles = parseConstitutionYaml(VALID);
    expect(articles.map((a) => a.stable_id)).toEqual(["CONST-K1-A1", "CONST-K1-A2"]);
    expect(articles[0]?.mutability).toBe("IMMUTABLE");
    expect(articles[1]?.version).toBe(1);
  });

  it("rejects a bad stable_id format", () => {
    const bad = VALID.replace("CONST-K1-A1", "ARTICLE-1");
    expect(() => parseConstitutionYaml(bad)).toThrow(ConstitutionLoadError);
  });

  it("rejects an unknown mutability", () => {
    const bad = VALID.replace("AMENDABLE_SIMPLE", "WHENEVER");
    expect(() => parseConstitutionYaml(bad)).toThrow(ConstitutionLoadError);
  });

  it("rejects duplicate stable_id@version", () => {
    const dup = `
articles:
  - stable_id: CONST-K1-A1
    version: 1
    mutability: IMMUTABLE
    title: A
    body: x
  - stable_id: CONST-K1-A1
    version: 1
    mutability: IMMUTABLE
    title: B
    body: y
`;
    expect(() => parseConstitutionYaml(dup)).toThrow(/Duplicate constitution article/);
  });

  it("rejects malformed YAML", () => {
    expect(() => parseConstitutionYaml("articles: [oops")).toThrow(ConstitutionLoadError);
  });
});
