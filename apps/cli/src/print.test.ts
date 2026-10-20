import { describe, expect, it } from "vitest";
import type { ReceiptData } from "@burn-receipt/core";
import { formatTextReceipt } from "./print.js";

const base: ReceiptData = {
  version: 1,
  periodDays: 7,
  periodEnd: "2026-10-20T00:00:00.000Z",
  tools: [
    { source: "claude-code", costUsd: 400, planLabel: "Claude Max 20x", planUsdForPeriod: 46.03 },
    { source: "codex", costUsd: 50, planLabel: "ChatGPT Plus", planUsdForPeriod: 4.6 },
  ],
  lines: [
    { id: "writing", usd: 50 },
    { id: "rereading", usd: 400 },
  ],
  totalUsd: 450,
  paidUsd: 50.63,
  avoidableUsd: 65.63,
  idleReloads: 34,
  helperAgents: 63,
  helperShare: 0.27,
  priciestSessionUsd: 166,
  priciestSessionHours: 42.3,
  widestFanout: 15,
  replies: 3000,
  sessions: 9,
  totalTokens: 1_000_000,
  topModel: "claude-opus-5-5",
  codexLimits: { fiveHourUsedPercent: null, weeklyUsedPercent: 23 },
  unpricedReplies: 0,
  pricesAsOf: "2026-10-20",
};

describe("formatTextReceipt", () => {
  const text = formatTextReceipt(base);

  it("sorts lines by cost and shows the headline numbers", () => {
    expect(text.indexOf("Re-reading the chat")).toBeLessThan(text.indexOf("Writing code & replies"));
    expect(text).toContain("8.9x your money's worth");
    expect(text).toContain("$65.63 was avoidable");
    expect(text).toContain("Codex weekly limit: 23% used");
  });

  it("never lets a long label run into its amount", () => {
    const paidLine = text.split("\n").find((l) => l.includes("YOU PAID"));
    expect(paidLine).toMatch(/\) +\$50\.63$/);
  });

  it("omits value and plan lines when the plan price is unknown", () => {
    const unknown = formatTextReceipt({ ...base, paidUsd: null });
    expect(unknown).not.toContain("YOU PAID");
    expect(unknown).not.toContain("money's worth");
  });

  it("mentions replies that couldn't be priced", () => {
    expect(formatTextReceipt({ ...base, unpricedReplies: 436 })).toContain("436 replies from models without a public price");
  });
});
