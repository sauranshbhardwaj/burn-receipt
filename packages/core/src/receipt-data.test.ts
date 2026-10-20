import { describe, expect, it } from "vitest";
import { CLAUDE_PLANS, codexPlanFromType } from "./plans";
import { buildReceiptData, receiptDataSchema } from "./receipt-data";
import { emptyTokens, type TokenCounts, type UsageEvent } from "./types";

const RANGE = { since: new Date("2026-10-13T00:00:00Z"), until: new Date("2026-10-20T00:00:00Z") };
const NOW = new Date("2026-10-20T00:00:00Z");

function ev(source: UsageEvent["source"], model: string, tokens: Partial<TokenCounts>, extra: Partial<UsageEvent> = {}): UsageEvent {
  return {
    source,
    sessionId: "session-secret-id",
    threadId: "session-secret-id",
    timestamp: new Date("2026-10-15T10:00:00Z"),
    model,
    projectPath: "/Users/someone/top-secret-startup",
    isSubagent: false,
    usedTools: true,
    tokens: { ...emptyTokens(), ...tokens },
    speed: "standard",
    inferenceGeo: null,
    webSearches: 0,
    ...extra,
  };
}

const claudeEvents = [
  ev("claude-code", "claude-opus-5-5[1m]", { output: 1_000_000, cacheWrite1h: 500_000 }),
  ev("claude-code", "claude-opus-5-5", { output: 10 }, { threadId: "sub", isSubagent: true }),
];
const codexEvents = [ev("codex", "gpt-6.1-sol", { input: 1_000_000, output: 100_000 })];

describe("buildReceiptData", () => {
  it("produces data that passes the strict share schema", () => {
    const data = buildReceiptData({
      range: RANGE,
      tools: [
        { source: "claude-code", events: claudeEvents, plan: CLAUDE_PLANS.max20x },
        { source: "codex", events: codexEvents, plan: codexPlanFromType("plus") },
      ],
      now: NOW,
    });
    expect(receiptDataSchema.safeParse(data).success).toBe(true);
    expect(data.periodDays).toBe(7);
    expect(data.tools.map((t) => t.source)).toEqual(["claude-code", "codex"]);
    expect(data.paidUsd).toBeCloseTo(46.03 + 4.6, 1);
    expect(data.topModel).toBe("claude-opus-5-5");
    expect(data.helperAgents).toBe(1);
  });

  it("never includes project paths, session ids or other identifying strings", () => {
    const data = buildReceiptData({
      range: RANGE,
      tools: [{ source: "claude-code", events: claudeEvents, plan: CLAUDE_PLANS.pro }],
      now: NOW,
    });
    const json = JSON.stringify(data);
    expect(json).not.toContain("top-secret-startup");
    expect(json).not.toContain("session-secret-id");
    expect(json).not.toContain("/Users/");
  });

  it("only claims a paid amount when every tool's plan price is known", () => {
    const data = buildReceiptData({
      range: RANGE,
      tools: [
        { source: "claude-code", events: claudeEvents, plan: CLAUDE_PLANS.max20x },
        { source: "codex", events: codexEvents, plan: codexPlanFromType("prolite") },
      ],
      now: NOW,
    });
    expect(data.paidUsd).toBeNull();
    expect(data.tools[1]?.planUsdForPeriod).toBeNull();
  });

  it("drops tools with no usage and line items worth $0", () => {
    const data = buildReceiptData({
      range: RANGE,
      tools: [
        { source: "claude-code", events: claudeEvents, plan: CLAUDE_PLANS.max20x },
        { source: "codex", events: [], plan: null },
      ],
      now: NOW,
    });
    expect(data.tools).toHaveLength(1);
    expect(data.lines.every((line) => line.usd > 0)).toBe(true);
    expect(data.lines.map((l) => l.id)).not.toContain("webSearch");
  });

  it("shows Codex limits only while their window has not reset", () => {
    const limits = {
      observedAt: new Date("2026-10-19T00:00:00Z"),
      planType: "plus",
      primary: { usedPercent: 8, windowMinutes: 300, resetsAt: new Date("2026-10-19T05:00:00Z") },
      secondary: { usedPercent: 23, windowMinutes: 10080, resetsAt: new Date("2026-10-25T00:00:00Z") },
    };
    const data = buildReceiptData({
      range: RANGE,
      tools: [{ source: "codex", events: codexEvents, plan: codexPlanFromType("plus") }],
      codexLimits: limits,
      now: NOW,
    });
    expect(data.codexLimits).toEqual({ fiveHourUsedPercent: null, weeklyUsedPercent: 23 });
  });
});

describe("receiptDataSchema", () => {
  const valid = () =>
    buildReceiptData({ range: RANGE, tools: [{ source: "codex", events: codexEvents, plan: null }], now: NOW });

  it("rejects unknown fields (so nothing extra can be smuggled into a share)", () => {
    expect(receiptDataSchema.safeParse({ ...valid(), prompt: "my secret prompt" }).success).toBe(false);
  });

  it("rejects free text in constrained string fields", () => {
    expect(receiptDataSchema.safeParse({ ...valid(), topModel: "<script>alert(1)</script>" }).success).toBe(false);
    const tools = [{ ...valid().tools[0], planLabel: "javascript:alert(1)<>" }];
    expect(receiptDataSchema.safeParse({ ...valid(), tools }).success).toBe(false);
  });

  it("rejects receipts whose numbers don't add up (hand-crafted shares)", () => {
    const good = valid();
    expect(receiptDataSchema.safeParse({ ...good, totalUsd: 9_999_999 }).success).toBe(false);
    expect(receiptDataSchema.safeParse({ ...good, avoidableUsd: good.totalUsd + 1 }).success).toBe(false);
    const doubled = { ...good, lines: [...good.lines, ...good.lines] };
    expect(receiptDataSchema.safeParse(doubled).success).toBe(false);
  });

  it("accepts rounding differences of a few cents", () => {
    const good = valid();
    expect(receiptDataSchema.safeParse({ ...good, totalUsd: good.totalUsd + 0.03 }).success).toBe(true);
  });

  it("rejects absurd or negative numbers", () => {
    expect(receiptDataSchema.safeParse({ ...valid(), totalUsd: -1 }).success).toBe(false);
    expect(receiptDataSchema.safeParse({ ...valid(), totalUsd: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(receiptDataSchema.safeParse({ ...valid(), helperShare: 1.5 }).success).toBe(false);
  });
});
