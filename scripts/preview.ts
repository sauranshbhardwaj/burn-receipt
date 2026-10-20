// Dev check: renders the receipt and the link-preview card from real local data.
// Usage: npx tsx scripts/preview.ts <days> <out-dir>
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildReceiptData, CLAUDE_PLANS, codexPlanFromType, loadClaudeCodeEvents, loadCodexEvents } from "../packages/core/src/index.js";
import { renderCardPng, renderReceiptPng } from "../apps/cli/src/render.js";

const days = Number(process.argv[2] ?? 30);
const outDir = process.argv[3] ?? ".";
const until = new Date();
const since = new Date(until.getTime() - days * 86_400_000);
const [claude, codex] = await Promise.all([loadClaudeCodeEvents({ since, until }), loadCodexEvents({ since, until })]);
const data = buildReceiptData({
  range: { since, until },
  tools: [
    { source: "claude-code", events: claude, plan: CLAUDE_PLANS.max20x },
    { source: "codex", events: codex.events, plan: codexPlanFromType("plus") },
  ],
  codexLimits: codex.latestLimits,
});
await writeFile(join(outDir, "receipt.png"), await renderReceiptPng(data));
await writeFile(join(outDir, "card.png"), await renderCardPng(data));
console.log(`wrote receipt.png and card.png to ${outDir}`);
