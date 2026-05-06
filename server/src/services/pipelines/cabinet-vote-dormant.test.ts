import { describe, expect, it } from "vitest";
import { parsePipelineYaml } from "./loader.js";

/**
 * Stage 8 acceptance: the cabinet-vote stage definition must parse
 * (schema-ready) but is *not activated* in Phase 1. We do not run a
 * pipeline that includes it — a deployment that activates Cabinet
 * Vote in v0.2 just needs to flip the `applies_to` and add the stage.
 *
 * See plans/.../soft-lantern.md Stage 8.
 */
describe("cabinet vote (dormant)", () => {
  it("recognizes cabinet_vote as a valid stage id", () => {
    const pipeline = parsePipelineYaml(`
id: constitutional
name: "Constitutional patch pipeline (dormant in Phase 1)"
applies_to: [CONSTITUTIONAL]
max_cost_per_patch: 100
stages:
  - { id: drafting, agent_role: Architect }
  - { id: critique, agent_role: Critic, decision: binary, on_reject: { goto: drafting, with_reason: true } }
  - { id: cabinet_vote, agent_role: Head, on_reject: { goto: drafting, with_reason: true } }
  - { id: risk_assess, agent_role: Legal, on_reject: { goto: drafting, with_reason: true } }
  - { id: executor, agent_role: Executor }
  - { id: bias_mirror, agent_role: BiasMirror, on_block: { goto: drafting, with_reason: true } }
  - { id: awaiting_signoff, gate: operator }
`);
    expect(pipeline.stages.find((s) => s.id === "cabinet_vote")).toBeDefined();
    expect(pipeline.applies_to).toEqual(["CONSTITUTIONAL"]);
  });
});
