#!/usr/bin/env node
import { parseArgs } from "node:util";
import { loadClaudeCodeEvents, summarize, totalTokens, type TokenCounts } from "@burn-receipt/core";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 7;

function readArgs() {
  try {
    return parseArgs({
      options: { days: { type: "string", default: String(DEFAULT_DAYS) } },
    }).values;
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}\nUsage: burn-receipt [--days 7]`);
    process.exit(1);
  }
}

const values = readArgs();

const days = Number(values.days);
if (!Number.isInteger(days) || days < 1 || days > 365) {
  console.error(`--days must be a whole number between 1 and 365 (got "${values.days}").`);
  process.exit(1);
}

const until = new Date();
const since = new Date(until.getTime() - days * DAY_MS);

const fmt = (n: number) => n.toLocaleString("en-US");
const row = (label: string, t: TokenCounts) =>
  `  ${label.padEnd(24)} ${fmt(totalTokens(t)).padStart(16)}   (out ${fmt(t.output)}, cache read ${fmt(t.cacheRead)}, cache write ${fmt(t.cacheWrite5m + t.cacheWrite1h)})`;

const events = await loadClaudeCodeEvents({ since, until });
if (events.length === 0) {
  console.log(`No Claude Code usage found in the last ${days} days.`);
  process.exit(0);
}

const summary = summarize(events);
console.log(`Claude Code — last ${days} days`);
console.log(`  ${fmt(summary.responses)} responses across ${fmt(summary.sessions)} sessions\n`);
console.log(row("TOTAL", summary.tokens));
for (const [model, tokens] of [...summary.byModel].sort((a, b) => totalTokens(b[1]) - totalTokens(a[1]))) {
  console.log(row(model, tokens));
}
const subagentShare = totalTokens(summary.subagentTokens) / Math.max(1, totalTokens(summary.tokens));
console.log(`\n  Subagents: ${(subagentShare * 100).toFixed(1)}% of all tokens`);
console.log(`  Responses with no tool use: ${fmt(summary.toollessResponses)}`);
