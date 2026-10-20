import type { ReceiptData } from "@burn-receipt/core";

/** Made-up but realistic numbers for the homepage example. Clearly labeled as an example there. */
export const EXAMPLE_RECEIPT: ReceiptData = {
  version: 1,
  periodDays: 30,
  periodEnd: "2026-10-20T00:00:00.000Z",
  tools: [
    { source: "claude-code", costUsd: 2830, planLabel: "Claude Max 5x", planUsdForPeriod: 98.63 },
    { source: "codex", costUsd: 312, planLabel: "ChatGPT Plus", planUsdForPeriod: 19.73 },
  ],
  lines: [
    { id: "rereading", usd: 1504 },
    { id: "idleReloads", usd: 611 },
    { id: "newContext", usd: 498 },
    { id: "writing", usd: 287 },
    { id: "thinking", usd: 142 },
    { id: "startup", usd: 100 },
  ],
  totalUsd: 3142,
  paidUsd: 118.36,
  avoidableUsd: 584,
  idleReloads: 233,
  helperAgents: 141,
  helperShare: 0.41,
  priciestSessionUsd: 688,
  priciestSessionHours: 9.5,
  widestFanout: 37,
  replies: 21480,
  sessions: 46,
  totalTokens: 1_620_000_000,
  topModel: "claude-opus-5-5",
  codexLimits: null,
  unpricedReplies: 0,
  pricesAsOf: "2026-10-20",
};
