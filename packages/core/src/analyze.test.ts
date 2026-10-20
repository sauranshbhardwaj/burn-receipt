import { describe, expect, it } from "vitest";
import { analyze, LINE_ITEM_ORDER } from "./analyze.js";
import { emptyTokens, type TokenCounts, type UsageEvent } from "./types.js";

const M = 1_000_000;
const T0 = new Date("2026-10-15T10:00:00Z").getTime();
const minutes = (n: number) => new Date(T0 + n * 60_000);

function ev(at: number, tokens: Partial<TokenCounts>, extra: Partial<UsageEvent> = {}): UsageEvent {
  return {
    source: "claude-code",
    sessionId: "s1",
    threadId: "s1",
    timestamp: minutes(at),
    // Sonnet 5.5: input $2, 5m write $2.50, 1h write $4, read $0.10, output $10 per MTok.
    model: "claude-sonnet-5-5",
    projectPath: null,
    isSubagent: false,
    usedTools: true,
    tokens: { ...emptyTokens(), ...tokens },
    speed: "standard",
    inferenceGeo: null,
    webSearches: 0,
    ...extra,
  };
}

const sumLines = (a: ReturnType<typeof analyze>) => LINE_ITEM_ORDER.reduce((sum, id) => sum + a.lineItems[id], 0);

describe("analyze", () => {
  it("treats the first cache write of each thread as start-up cost", () => {
    const a = analyze([
      ev(0, { cacheWrite5m: M }),
      ev(1, { cacheWrite5m: M }),
      ev(0, { cacheWrite5m: M }, { threadId: "s1:agent-1", isSubagent: true }),
    ]);
    expect(a.lineItems.startup).toBeCloseTo(5, 10);
    expect(a.lineItems.newContext).toBeCloseTo(2.5, 10);
    expect(a.subagentThreads).toBe(1);
    expect(a.subagentCost).toBeCloseTo(2.5, 10);
  });

  it("flags a 5-minute-cache write after a gap over 5 minutes as an idle reload", () => {
    const a = analyze([ev(0, { cacheWrite5m: 10 }), ev(4, { cacheWrite5m: M }), ev(10, { cacheWrite5m: M })]);
    expect(a.lineItems.newContext).toBeCloseTo(2.5, 10);
    expect(a.lineItems.idleReloads).toBeCloseTo(2.5, 10);
    expect(a.idleReloadCount).toBe(1);
    // Paid $2.50 to write what a warm cache would have served for $0.10.
    expect(a.avoidableIdleCost).toBeCloseTo(2.4, 10);
  });

  it("does not flag a 1-hour-cache write until the gap exceeds an hour", () => {
    const a = analyze([ev(0, { cacheWrite1h: 10 }), ev(30, { cacheWrite1h: M }), ev(91, { cacheWrite1h: M })]);
    expect(a.lineItems.newContext).toBeCloseTo(4, 10);
    expect(a.lineItems.idleReloads).toBeCloseTo(4, 10);
  });

  it("splits a mixed write so only the expired bucket counts as an idle reload", () => {
    const a = analyze([ev(0, { cacheWrite5m: 10 }), ev(20, { cacheWrite5m: M, cacheWrite1h: M })]);
    expect(a.lineItems.idleReloads).toBeCloseTo(2.5, 10);
    expect(a.lineItems.newContext).toBeCloseTo(4, 10);
  });

  it("splits output cost into thinking and writing by the reasoning share", () => {
    const a = analyze([ev(0, { output: M, reasoning: M / 4 })]);
    expect(a.lineItems.thinking).toBeCloseTo(2.5, 10);
    expect(a.lineItems.writing).toBeCloseTo(7.5, 10);
  });

  it("caps the thinking share at 100% if logs ever report more reasoning than output", () => {
    const a = analyze([ev(0, { output: 100, reasoning: 500 })]);
    expect(a.lineItems.writing).toBe(0);
  });

  it("keeps line items summing to the total across a realistic mix", () => {
    const a = analyze([
      ev(0, { input: 5000, cacheWrite5m: 40_000, output: 900, reasoning: 300 }),
      ev(2, { input: 20, cacheRead: 40_000, cacheWrite5m: 3000, output: 4000, reasoning: 1000 }, { webSearches: 2 }),
      ev(30, { input: 5, cacheWrite5m: 43_000, cacheWrite1h: 1000, output: 100 }, { speed: "fast", model: "claude-opus-5-5" }),
      ev(1, { cacheWrite1h: 9000, output: 50 }, { threadId: "s1:a", isSubagent: true }),
    ]);
    expect(sumLines(a)).toBeCloseTo(a.totalCost, 10);
    expect(a.totalCost).toBeGreaterThan(0);
  });

  it("counts unpriced models separately and leaves them out of the total", () => {
    const a = analyze([ev(0, { output: M }), ev(1, { output: M }, { model: "mystery-model" })]);
    expect(a.totalCost).toBeCloseTo(10, 10);
    expect(a.unpricedResponses).toBe(1);
    expect(a.unpricedModels).toEqual(["mystery-model"]);
  });

  it("finds the priciest session and the session with the most helper agents", () => {
    const a = analyze([
      ev(0, { output: M }, { sessionId: "big", threadId: "big" }),
      ev(0, { output: 10 }, { sessionId: "wide", threadId: "wide" }),
      ev(1, { output: 10 }, { sessionId: "wide", threadId: "wide:a1", isSubagent: true }),
      ev(1, { output: 10 }, { sessionId: "wide", threadId: "wide:a2", isSubagent: true }),
    ]);
    expect(a.priciestSession?.sessionId).toBe("big");
    expect(a.widestFanout?.sessionId).toBe("wide");
    expect(a.widestFanout?.subagents).toBe(2);
    expect(a.sessions).toBe(2);
  });

  it("handles an empty history", () => {
    const a = analyze([]);
    expect(a.totalCost).toBe(0);
    expect(a.priciestSession).toBeNull();
    expect(a.firstEvent).toBeNull();
  });

  it("orders out-of-order events within a thread before measuring gaps", () => {
    const a = analyze([ev(10, { cacheWrite5m: M }), ev(0, { cacheWrite5m: 10 })]);
    expect(a.lineItems.idleReloads).toBeCloseTo(2.5, 10);
  });
});
