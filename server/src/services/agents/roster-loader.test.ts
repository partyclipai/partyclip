import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadRosterFromDirectory,
  parseRosterYaml,
  RosterLoadError,
} from "./roster-loader.js";

const VALID_ROSTER = `
agents:
  - id: architect
    role: Architect
    activation_mode: TRIGGER_ONLY
    triggers: ["patch.drafting.requested"]
    persona_ref: personas/architect.md
    model: claude-opus-4-8
  - id: critic
    role: Critic
    activation_mode: TRIGGER_ONLY
    triggers: ["patch.critique.requested"]
    persona_ref: personas/critic.md
    model: claude-sonnet-4-6
`;

describe("parseRosterYaml", () => {
  it("parses and validates a well-formed roster", () => {
    const agents = parseRosterYaml(VALID_ROSTER);
    expect(agents.map((a) => a.role)).toEqual(["Architect", "Critic"]);
    expect(agents[0]?.persona_ref).toBe("personas/architect.md");
    expect(agents[0]?.model).toBe("claude-opus-4-8");
  });

  it("rejects an invalid agent entry (bad role) with a RosterLoadError", () => {
    const bad = VALID_ROSTER.replace("role: Architect", "role: NotARole");
    expect(() => parseRosterYaml(bad)).toThrow(RosterLoadError);
  });

  it("rejects a roster with a duplicate role", () => {
    const dup = `
agents:
  - id: a1
    role: Architect
    activation_mode: TRIGGER_ONLY
    triggers: ["x.y"]
    persona_ref: personas/a1.md
    model: m
  - id: a2
    role: Architect
    activation_mode: TRIGGER_ONLY
    triggers: ["x.z"]
    persona_ref: personas/a2.md
    model: m
`;
    expect(() => parseRosterYaml(dup)).toThrow(/Duplicate agent role/);
  });

  it("rejects malformed YAML", () => {
    expect(() => parseRosterYaml("agents: [unclosed")).toThrow(RosterLoadError);
  });
});

describe("loadRosterFromDirectory", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "partyclip-roster-"));
    await fs.mkdir(path.join(dir, "personas"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("loads the roster and resolves each persona file to text", async () => {
    await fs.writeFile(path.join(dir, "regular.yaml"), VALID_ROSTER, "utf8");
    await fs.writeFile(path.join(dir, "personas", "architect.md"), "You design patches.", "utf8");
    await fs.writeFile(path.join(dir, "personas", "critic.md"), "You critique patches.", "utf8");

    const roster = await loadRosterFromDirectory(dir);
    expect(roster).toHaveLength(2);
    expect(roster[0]?.config.role).toBe("Architect");
    expect(roster[0]?.persona).toBe("You design patches.");
    expect(roster[1]?.persona).toBe("You critique patches.");
  });

  it("throws if a persona file is missing", async () => {
    await fs.writeFile(path.join(dir, "regular.yaml"), VALID_ROSTER, "utf8");
    await fs.writeFile(path.join(dir, "personas", "architect.md"), "x", "utf8");
    // critic.md intentionally missing
    await expect(loadRosterFromDirectory(dir)).rejects.toThrow(/Failed to read persona/);
  });

  it("rejects a persona_ref that escapes the content directory (path traversal)", async () => {
    const evil = `
agents:
  - id: evil
    role: Architect
    activation_mode: TRIGGER_ONLY
    triggers: ["x.y"]
    persona_ref: ../../etc/passwd
    model: m
`;
    await fs.writeFile(path.join(dir, "regular.yaml"), evil, "utf8");
    await expect(loadRosterFromDirectory(dir)).rejects.toThrow(/escapes the content directory/);
  });

  it("throws if regular.yaml is absent", async () => {
    await expect(loadRosterFromDirectory(dir)).rejects.toThrow(/Failed to read roster file/);
  });
});
