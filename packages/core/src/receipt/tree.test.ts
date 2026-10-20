import { describe, expect, it } from "vitest";
import type { ReceiptData } from "../receipt-data";
import { cardTree, type ReceiptNode } from "./tree";

const data: ReceiptData = {
  version: 1,
  periodDays: 27,
  periodEnd: "2026-10-20T00:00:00.000Z",
  tools: [{ source: "claude-code", costUsd: 450, planLabel: "Claude Max 20x", planUsdForPeriod: 177.53 }],
  lines: [{ id: "rereading", usd: 450 }],
  totalUsd: 450,
  paidUsd: 177.53,
  avoidableUsd: 65,
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
  codexLimits: null,
  unpricedReplies: 0,
  pricesAsOf: "2026-10-20",
};

function textOf(node: ReceiptNode | string | null): string {
  if (node === null) return "";
  if (typeof node === "string") return node;
  const { children } = node.props;
  const list = children === undefined ? [] : Array.isArray(children) ? children : [children];
  return list.map(textOf).join(" ");
}

describe("cardTree", () => {
  it("names the tools and period in the title bar by default", () => {
    expect(textOf(cardTree(data))).toContain("burn-receipt — Claude Code — last 27 days");
  });

  it("uses a custom title when given one", () => {
    const text = textOf(cardTree(data, { title: "burn-receipt — example receipt (made-up numbers)" }));
    expect(text).toContain("example receipt (made-up numbers)");
    expect(text).not.toContain("last 27 days");
  });
});
