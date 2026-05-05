import fs from "node:fs";
import { partyclipConfigSchema, type PartyclipConfig } from "@partyclipai/shared";
import { resolvePaperclipConfigPath } from "./paths.js";

export function readConfigFile(): PartyclipConfig | null {
  const configPath = resolvePaperclipConfigPath();

  if (!fs.existsSync(configPath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return partyclipConfigSchema.parse(raw);
  } catch {
    return null;
  }
}
