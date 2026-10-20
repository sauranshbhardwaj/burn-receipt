import { describe, expect, it } from "vitest";
import type { ReceiptData } from "@burn-receipt/core";
import { redditShareUrl, shareHeadline, xShareUrl } from "./share-text";

const data: ReceiptData = {
  version: 1,
  periodDays: 30,
  periodEnd: "2026-10-20T00:00:00.000Z",
  tools: [
    { source: "claude-code", costUsd: 7200, planLabel: "Claude Max 20x", planUsdForPeriod: 197.26 },
    { source: "codex", costUsd: 56, planLabel: "ChatGPT Plus", planUsdForPeriod: 19.73 },
  ],
  lines: [{ id: "rereading", usd: 7256 }],
  totalUsd: 7256,
  paidUsd: 216.99,
  avoidableUsd: 1359,
  idleReloads: 561,
  helperAgents: 566,
  helperShare: 0.58,
  priciestSessionUsd: 2586,
  priciestSessionHours: 436,
  widestFanout: 258,
  replies: 60000,
  sessions: 27,
  totalTokens: 1e9,
  topModel: "claude-opus-5-5",
  codexLimits: null,
  unpricedReplies: 0,
  pricesAsOf: "2026-10-20",
};

describe("share text", () => {
  it("leads with value and avoidable spend", () => {
    expect(shareHeadline(data)).toBe(
      "My Claude Code + Codex plan burned $7,256 of API value this month — 33x what I paid ($217). $1,359 of it was avoidable.",
    );
  });

  it("falls back gracefully without a known plan price", () => {
    expect(shareHeadline({ ...data, paidUsd: null, avoidableUsd: 0, periodDays: 3 })).toBe(
      "My Claude Code + Codex usage was worth $7,256 at API prices in 3 days.",
    );
  });

  it("builds properly encoded share links", () => {
    const x = new URL(xShareUrl(data, "https://burnreceipt.dev/r/abc"));
    expect(x.hostname).toBe("x.com");
    expect(x.searchParams.get("url")).toBe("https://burnreceipt.dev/r/abc");
    expect(x.searchParams.get("text")).toContain("npx burn-receipt");
    const reddit = new URL(redditShareUrl(data, "https://burnreceipt.dev/r/abc"));
    expect(reddit.searchParams.get("title")).toContain("$7,256");
  });
});
