// Dev check: renders edge-case receipts (sparse, maxed-out, huge numbers) to eyeball layout limits.
// Usage: npx tsx scripts/render-fixtures.ts <out-dir>
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReceiptData } from "../packages/core/src/index";
import { renderCardPng, renderReceiptPng } from "../apps/cli/src/render";

const base: ReceiptData = {
  version: 1, periodDays: 7, periodEnd: "2026-10-20T00:00:00.000Z",
  tools: [{ source: "codex", costUsd: 3.12, planLabel: "ChatGPT Pro Lite", planUsdForPeriod: null }],
  lines: [{ id: "rereading", usd: 1.9 }, { id: "writing", usd: 1.22 }],
  totalUsd: 3.12, paidUsd: null, avoidableUsd: 0, idleReloads: 0, helperAgents: 0, helperShare: 0,
  priciestSessionUsd: 0, priciestSessionHours: 0, widestFanout: 0, replies: 41, sessions: 1, totalTokens: 900_000,
  topModel: "gpt-6.1-sol", codexLimits: null, unpricedReplies: 12, pricesAsOf: "2026-10-20",
};

const fixtures: Record<string, ReceiptData> = {
  sparse: base,
  maxed: {
    ...base, periodDays: 365, periodEnd: "2026-10-20T00:00:00.000Z",
    tools: [
      { source: "claude-code", costUsd: 2_400_000, planLabel: "Claude API (pay as you go)", planUsdForPeriod: null },
      { source: "codex", costUsd: 999_999.99, planLabel: "ChatGPT Pro", planUsdForPeriod: 2400 },
    ],
    lines: [
      { id: "rereading", usd: 1_500_000 }, { id: "idleReloads", usd: 700_000 }, { id: "newContext", usd: 600_000 },
      { id: "writing", usd: 300_000 }, { id: "thinking", usd: 200_000 }, { id: "startup", usd: 99_999.99 },
      { id: "webSearch", usd: 0.01 },
    ],
    totalUsd: 3_399_999.99, paidUsd: null, avoidableUsd: 650_000, idleReloads: 123_456, helperAgents: 98_765,
    helperShare: 0.99, priciestSessionUsd: 450_000, priciestSessionHours: 8000, widestFanout: 12_345,
    codexLimits: { fiveHourUsedPercent: 100, weeklyUsedPercent: 100 },
  },
};

const outDir = process.argv[2] ?? ".";
for (const [name, data] of Object.entries(fixtures)) {
  await writeFile(join(outDir, `fixture-${name}.png`), await renderReceiptPng(data));
  await writeFile(join(outDir, `fixture-${name}-card.png`), await renderCardPng(data));
}
console.log("rendered", Object.keys(fixtures).join(", "));
