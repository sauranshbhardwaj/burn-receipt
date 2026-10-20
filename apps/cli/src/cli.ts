#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildReceiptData,
  CLAUDE_PLANS,
  codexPlanFromType,
  loadClaudeCodeEvents,
  loadCodexEvents,
  type Plan,
} from "@burn-receipt/core";
import { HELP, parseOptions, UsageError, type Options } from "./args.js";
import { loadConfig, saveConfig, type Config } from "./config.js";
import { formatTextReceipt } from "./print.js";
import { askClaudePlan, askMonthlyPrice, canPrompt } from "./prompt.js";
import { renderReceiptPng } from "./render.js";
import { shareReceipt, ShareError } from "./share.js";

const DAY_MS = 86_400_000;

async function resolveClaudePlan(options: Options, config: Config): Promise<Plan | null> {
  const id = options.claudePlan ?? config.claudePlan ?? (canPrompt() && !options.json ? await askClaudePlan() : null);
  if (!id) return null;
  if (id !== config.claudePlan) await saveConfig({ ...config, claudePlan: id });
  config.claudePlan = id;
  return CLAUDE_PLANS[id];
}

async function resolveCodexPlan(planType: string | null, options: Options, config: Config): Promise<Plan | null> {
  const detected = codexPlanFromType(planType);
  if (!detected || detected.monthlyUsd !== null) return detected;
  // Plans without a confirmed public price (e.g. Pro Lite): use what the user told us.
  const price =
    options.codexPlanPriceUsd ??
    config.codexPlanPriceUsd ??
    (canPrompt() && !options.json ? await askMonthlyPrice(detected.label) : null);
  if (price === null) return detected;
  if (price !== config.codexPlanPriceUsd) await saveConfig({ ...config, codexPlanPriceUsd: price });
  return { ...detected, monthlyUsd: price };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }

  const until = new Date();
  const range = { since: new Date(until.getTime() - options.days * DAY_MS), until };
  const [claudeEvents, codex] = await Promise.all([loadClaudeCodeEvents(range), loadCodexEvents(range)]);

  if (claudeEvents.length === 0 && codex.events.length === 0) {
    console.log(
      `No Claude Code or Codex usage found in the last ${options.days} days.\n` +
        "We look in ~/.claude/projects and ~/.codex/sessions (or $CLAUDE_CONFIG_DIR / $CODEX_HOME).\n" +
        "Try a longer window, e.g. npx burn-receipt --days 30",
    );
    return;
  }

  const config = await loadConfig();
  const data = buildReceiptData({
    range,
    tools: [
      { source: "claude-code", events: claudeEvents, plan: claudeEvents.length > 0 ? await resolveClaudePlan(options, config) : null },
      {
        source: "codex",
        events: codex.events,
        plan: codex.events.length > 0 ? await resolveCodexPlan(codex.latestLimits?.planType ?? null, options, config) : null,
      },
    ],
    codexLimits: codex.latestLimits,
  });

  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(formatTextReceipt(data));
  }

  if (options.image) {
    const path = resolve(options.out ?? `burn-receipt-${until.toISOString().slice(0, 10)}.png`);
    await writeFile(path, await renderReceiptPng(data));
    if (!options.json) console.log(`  Saved your receipt image → ${path}`);
  }

  if (options.share) {
    try {
      const url = await shareReceipt(data);
      console.log(`  Share link → ${url}\n  (only the numbers above were uploaded — never your chats or project names)`);
    } catch (error) {
      console.error(`  ${error instanceof ShareError ? error.message : "Sharing failed unexpectedly."}`);
      process.exitCode = 1;
    }
  } else if (!options.json) {
    console.log("  Want a link with a preview card for X/Reddit? Run again with --share");
  }
}

main().catch((error: unknown) => {
  if (error instanceof UsageError) {
    console.error(`${error.message}\n\n${HELP}`);
  } else {
    console.error(`Something went wrong: ${error instanceof Error ? error.message : String(error)}`);
    if (process.env.DEBUG) console.error(error);
    console.error("If this keeps happening, please open an issue with the message above.");
  }
  process.exitCode = 1;
});
