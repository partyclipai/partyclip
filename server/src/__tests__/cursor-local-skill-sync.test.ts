import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listCursorSkills,
  syncCursorSkills,
} from "@partyclipai/adapter-cursor-local/server";

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function createSkillDir(root: string, name: string) {
  const skillDir = path.join(root, name);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, "SKILL.md"), `---\nname: ${name}\n---\n`, "utf8");
  return skillDir;
}

describe("cursor local skill sync", () => {
  const partyclipKey = "partyclipai/partyclip/partyclip";
  const cleanupDirs = new Set<string>();

  afterEach(async () => {
    await Promise.all(Array.from(cleanupDirs).map((dir) => fs.rm(dir, { recursive: true, force: true })));
    cleanupDirs.clear();
  });

  it("reports configured Paperclip skills and installs them into the Cursor skills home", async () => {
    const home = await makeTempDir("partyclip-cursor-skill-sync-");
    cleanupDirs.add(home);

    const ctx = {
      agentId: "agent-1",
      companyId: "company-1",
      adapterType: "cursor",
      config: {
        env: {
          HOME: home,
        },
        partyclipSkillSync: {
          desiredSkills: [partyclipKey],
        },
      },
    } as const;

    const before = await listCursorSkills(ctx);
    expect(before.mode).toBe("persistent");
    expect(before.desiredSkills).toContain(partyclipKey);
    expect(before.entries.find((entry) => entry.key === partyclipKey)?.required).toBe(true);
    expect(before.entries.find((entry) => entry.key === partyclipKey)?.state).toBe("missing");

    const after = await syncCursorSkills(ctx, [partyclipKey]);
    expect(after.entries.find((entry) => entry.key === partyclipKey)?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".cursor", "skills", "partyclip"))).isSymbolicLink()).toBe(true);
  });

  it("recognizes company-library runtime skills supplied outside the bundled Paperclip directory", async () => {
    const home = await makeTempDir("partyclip-cursor-runtime-skills-home-");
    const runtimeSkills = await makeTempDir("partyclip-cursor-runtime-skills-src-");
    cleanupDirs.add(home);
    cleanupDirs.add(runtimeSkills);

    const partyclipDir = await createSkillDir(runtimeSkills, "partyclip");
    const asciiHeartDir = await createSkillDir(runtimeSkills, "ascii-heart");

    const ctx = {
      agentId: "agent-3",
      companyId: "company-1",
      adapterType: "cursor",
      config: {
        env: {
          HOME: home,
        },
        partyclipRuntimeSkills: [
          {
            key: "partyclip",
            runtimeName: "partyclip",
            source: partyclipDir,
            required: true,
            requiredReason: "Bundled Paperclip skills are always available for local adapters.",
          },
          {
            key: "ascii-heart",
            runtimeName: "ascii-heart",
            source: asciiHeartDir,
          },
        ],
        partyclipSkillSync: {
          desiredSkills: ["ascii-heart"],
        },
      },
    } as const;

    const before = await listCursorSkills(ctx);
    expect(before.warnings).toEqual([]);
    expect(before.desiredSkills).toEqual(["partyclip", "ascii-heart"]);
    expect(before.entries.find((entry) => entry.key === "ascii-heart")?.state).toBe("missing");

    const after = await syncCursorSkills(ctx, ["ascii-heart"]);
    expect(after.warnings).toEqual([]);
    expect(after.entries.find((entry) => entry.key === "ascii-heart")?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".cursor", "skills", "ascii-heart"))).isSymbolicLink()).toBe(true);
  });

  it("keeps required bundled Paperclip skills installed even when the desired set is emptied", async () => {
    const home = await makeTempDir("partyclip-cursor-skill-prune-");
    cleanupDirs.add(home);

    const configuredCtx = {
      agentId: "agent-2",
      companyId: "company-1",
      adapterType: "cursor",
      config: {
        env: {
          HOME: home,
        },
        partyclipSkillSync: {
          desiredSkills: [partyclipKey],
        },
      },
    } as const;

    await syncCursorSkills(configuredCtx, [partyclipKey]);

    const clearedCtx = {
      ...configuredCtx,
      config: {
        env: {
          HOME: home,
        },
        partyclipSkillSync: {
          desiredSkills: [],
        },
      },
    } as const;

    const after = await syncCursorSkills(clearedCtx, []);
    expect(after.desiredSkills).toContain(partyclipKey);
    expect(after.entries.find((entry) => entry.key === partyclipKey)?.state).toBe("installed");
    expect((await fs.lstat(path.join(home, ".cursor", "skills", "partyclip"))).isSymbolicLink()).toBe(true);
  });
});
