import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  describeLocalInstancePaths,
  expandHomePrefix,
  resolvePaperclipHomeDir,
  resolvePaperclipInstanceId,
} from "../config/home.js";

const ORIGINAL_ENV = { ...process.env };

describe("home path resolution", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("defaults to ~/.partyclip and default instance", () => {
    delete process.env.PARTYCLIP_HOME;
    delete process.env.PARTYCLIP_INSTANCE_ID;

    const paths = describeLocalInstancePaths();
    expect(paths.homeDir).toBe(path.resolve(os.homedir(), ".partyclip"));
    expect(paths.instanceId).toBe("default");
    expect(paths.configPath).toBe(path.resolve(os.homedir(), ".partyclip", "instances", "default", "config.json"));
  });

  it("supports PARTYCLIP_HOME and explicit instance ids", () => {
    process.env.PARTYCLIP_HOME = "~/partyclip-home";

    const home = resolvePaperclipHomeDir();
    expect(home).toBe(path.resolve(os.homedir(), "partyclip-home"));
    expect(resolvePaperclipInstanceId("dev_1")).toBe("dev_1");
  });

  it("rejects invalid instance ids", () => {
    expect(() => resolvePaperclipInstanceId("bad/id")).toThrow(/Invalid instance id/);
  });

  it("expands ~ prefixes", () => {
    expect(expandHomePrefix("~")).toBe(os.homedir());
    expect(expandHomePrefix("~/x/y")).toBe(path.resolve(os.homedir(), "x/y"));
  });
});
