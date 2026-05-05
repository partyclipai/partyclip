import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  bootstrapDevRunnerWorktreeEnv,
  isLinkedGitWorktreeCheckout,
  resolveWorktreeEnvFilePath,
} from "../dev-runner-worktree.ts";

const tempRoots = new Set<string>();

afterEach(() => {
  for (const root of tempRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  tempRoots.clear();
});

function createTempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.add(root);
  return root;
}

describe("dev-runner worktree env bootstrap", () => {
  it("detects linked git worktrees from .git files", () => {
    const root = createTempRoot("partyclip-dev-runner-worktree-");
    fs.writeFileSync(path.join(root, ".git"), "gitdir: /tmp/partyclip/.git/worktrees/feature\n", "utf8");

    expect(isLinkedGitWorktreeCheckout(root)).toBe(true);
  });

  it("loads repo-local Paperclip env for initialized worktrees without overriding explicit env", () => {
    const root = createTempRoot("partyclip-dev-runner-worktree-env-");
    fs.mkdirSync(path.join(root, ".partyclip"), { recursive: true });
    fs.writeFileSync(path.join(root, ".git"), "gitdir: /tmp/partyclip/.git/worktrees/feature\n", "utf8");
    fs.writeFileSync(
      resolveWorktreeEnvFilePath(root),
      [
        "PARTYCLIP_HOME=/tmp/partyclip-worktrees",
        "PARTYCLIP_INSTANCE_ID=feature-worktree",
        "PARTYCLIP_IN_WORKTREE=true",
        "PARTYCLIP_WORKTREE_NAME=feature-worktree",
        "PARTYCLIP_OPTIONAL= # comment-only value",
        "",
      ].join("\n"),
      "utf8",
    );

    const env: NodeJS.ProcessEnv = {
      PARTYCLIP_INSTANCE_ID: "already-set",
    };
    const result = bootstrapDevRunnerWorktreeEnv(root, env);

    expect(result).toEqual({
      envPath: resolveWorktreeEnvFilePath(root),
      missingEnv: false,
    });
    expect(env.PARTYCLIP_HOME).toBe("/tmp/partyclip-worktrees");
    expect(env.PARTYCLIP_INSTANCE_ID).toBe("already-set");
    expect(env.PARTYCLIP_IN_WORKTREE).toBe("true");
    expect(env.PARTYCLIP_OPTIONAL).toBe("");
  });

  it("reports uninitialized linked worktrees so dev runner can fail fast", () => {
    const root = createTempRoot("partyclip-dev-runner-worktree-missing-");
    fs.writeFileSync(path.join(root, ".git"), "gitdir: /tmp/partyclip/.git/worktrees/feature\n", "utf8");

    expect(bootstrapDevRunnerWorktreeEnv(root, {})).toEqual({
      envPath: resolveWorktreeEnvFilePath(root),
      missingEnv: true,
    });
  });
});
