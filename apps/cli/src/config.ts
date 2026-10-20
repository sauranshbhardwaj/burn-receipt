import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { CLAUDE_PLANS, type ClaudePlanId } from "@burn-receipt/core";

const configSchema = z.object({
  claudePlan: z.enum(Object.keys(CLAUDE_PLANS) as [ClaudePlanId, ...ClaudePlanId[]]).optional(),
  /** Monthly price the user typed for a ChatGPT plan we can't price (e.g. Pro Lite). */
  codexPlanPriceUsd: z.number().nonnegative().max(10_000).optional(),
});

export type Config = z.infer<typeof configSchema>;

export function configPath(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  const base = env.XDG_CONFIG_HOME?.trim() || join(home, ".config");
  return join(base, "burn-receipt", "config.json");
}

/** A missing or corrupt config is never fatal — we just ask again. */
export async function loadConfig(path: string = configPath()): Promise<Config> {
  try {
    const parsed = configSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export async function saveConfig(config: Config, path: string = configPath()): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  } catch {
    // Read-only home dirs (CI, sandboxes) shouldn't break the receipt; we'll just ask next time.
  }
}
