#!/usr/bin/env node
import { parseArgs } from "node:util";
import { analyze, LINE_ITEM_ORDER, loadClaudeCodeEvents, PRICES_AS_OF, type LineItemId } from "@burn-receipt/core";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 7;

const LINE_LABELS: Record<LineItemId, string> = {
  rereading: "Re-reading the chat",
  newContext: "New context (files, tools)",
  writing: "Writing code & replies",
  thinking: "Thinking",
  startup: "Start-up (prompt, tools, CLAUDE.md)",
  idleReloads: "Reloads after pauses",
  webSearch: "Web searches",
};

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

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (part: number, whole: number) => `${whole > 0 ? Math.round((part / whole) * 100) : 0}%`;

const events = await loadClaudeCodeEvents({ since, until });
if (events.length === 0) {
  console.log(`No Claude Code usage found in the last ${days} days.`);
  process.exit(0);
}

const a = analyze(events);
const width = 44;
const line = (label: string, value: string) => `${label.padEnd(width - value.length)}${value}`;

console.log(`\nBURN RECEIPT — last ${days} days`);
console.log("-".repeat(width));
for (const id of LINE_ITEM_ORDER) {
  if (a.lineItems[id] >= 0.005) console.log(line(LINE_LABELS[id], usd(a.lineItems[id])));
}
console.log("-".repeat(width));
console.log(line("TOTAL (API-equivalent)", usd(a.totalCost)));
console.log("");
console.log(`Helper agents: ${a.subagentThreads} spawned, ${pct(a.subagentCost, a.totalCost)} of the bill`);
console.log(`Avoidable: ${usd(a.avoidableIdleCost)} from ${a.idleReloadCount} reloads after pauses`);
if (a.priciestSession) {
  const hours = (a.priciestSession.endedAt.getTime() - a.priciestSession.startedAt.getTime()) / 3_600_000;
  console.log(`Priciest session: ${usd(a.priciestSession.cost)} over ${hours.toFixed(1)}h`);
}
if (a.widestFanout) console.log(`Biggest fan-out: ${a.widestFanout.subagents} helper agents in one session`);
if (a.unpricedResponses > 0) console.log(`Not priced: ${a.unpricedResponses} replies from ${a.unpricedModels.join(", ")}`);
console.log(`\n${a.responses.toLocaleString()} replies, ${a.sessions} sessions. Prices as of ${PRICES_AS_OF}.`);
