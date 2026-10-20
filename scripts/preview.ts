import { writeFile } from "node:fs/promises";
import { buildReceiptData, CLAUDE_PLANS, codexPlanFromType, loadClaudeCodeEvents, loadCodexEvents } from "../packages/core/src/index.js";
import { renderReceiptPng } from "../apps/cli/src/render.js";
const days = Number(process.argv[2] ?? 30);
const until = new Date(); const since = new Date(until.getTime() - days * 86_400_000);
const [claude, codex] = await Promise.all([loadClaudeCodeEvents({ since, until }), loadCodexEvents({ since, until })]);
const data = buildReceiptData({ range: { since, until }, tools: [
  { source: "claude-code", events: claude, plan: CLAUDE_PLANS.max20x },
  { source: "codex", events: codex.events, plan: codexPlanFromType("plus") },
], codexLimits: codex.latestLimits });
await writeFile(process.argv[3]!, await renderReceiptPng(data));
console.log(JSON.stringify(data, null, 1).slice(0, 600));
