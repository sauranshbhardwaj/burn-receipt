import { describe, expect, it } from "vitest";
import { canonicalModelId, eventCost, resolvePrice } from "./pricing";
import { emptyTokens, type TokenCounts, type UsageEvent } from "./types";

function event(model: string, tokens: Partial<TokenCounts>, extra: Partial<UsageEvent> = {}): UsageEvent {
  return {
    source: "claude-code",
    sessionId: "s",
    threadId: "s",
    timestamp: new Date("2026-10-15T00:00:00Z"),
    model,
    projectPath: null,
    isSubagent: false,
    usedTools: true,
    tokens: { ...emptyTokens(), ...tokens },
    speed: "standard",
    inferenceGeo: "global",
    webSearches: 0,
    ...extra,
  };
}

const M = 1_000_000;

describe("resolvePrice", () => {
  it("prefers the most specific prefix", () => {
    expect(resolvePrice("claude-opus-5-5")?.input).toBe(4);
    expect(resolvePrice("claude-opus-5")?.input).toBe(5);
    expect(resolvePrice("claude-fable-5-1")?.cacheRead).toBe(0.25);
    expect(resolvePrice("claude-fable-5")?.cacheRead).toBe(1);
  });

  it("resolves dated snapshots and 1M-context tags", () => {
    expect(resolvePrice("claude-sonnet-4-5-20250929")?.input).toBe(3);
    expect(resolvePrice("claude-haiku-4-5-20251001")?.output).toBe(5);
    expect(resolvePrice("claude-opus-5[1m]")?.input).toBe(5);
    expect(resolvePrice("claude-opus-5-5[1m]")?.input).toBe(4);
  });

  it("does not match a different model that merely shares characters", () => {
    expect(resolvePrice("claude-opus-50")).toBeNull();
    expect(resolvePrice("gpt-6.1-solar")).toBeNull();
    expect(resolvePrice("codex-auto-review")).toBeNull();
    expect(resolvePrice("")).toBeNull();
  });

  it("prices OpenAI models, billing writes as input where no write rate exists", () => {
    expect(resolvePrice("gpt-6.1-sol")).toMatchObject({ input: 2, cacheRead: 0.1, cacheWrite5m: 2.5, output: 10 });
    expect(resolvePrice("gpt-5.5")).toMatchObject({ input: 5, cacheWrite5m: 5, cacheWrite1h: 5 });
    expect(resolvePrice("gpt-6-sol")?.cacheRead).toBe(0.2);
  });

  it("switches OpenAI models to long-context prices strictly above 272k prompt tokens", () => {
    expect(resolvePrice("gpt-5.5", 272_000)?.output).toBe(30);
    expect(resolvePrice("gpt-5.5", 272_001)?.output).toBe(45);
  });

  it("switches Haiku 5.5 to long-prompt prices strictly above 100k prompt tokens", () => {
    expect(resolvePrice("claude-haiku-5-5", 100_000)?.input).toBe(0.1);
    expect(resolvePrice("claude-haiku-5-5", 100_001)?.input).toBe(0.5);
  });
});

describe("canonicalModelId", () => {
  it("maps logged names to price-table ids and never echoes custom suffixes", () => {
    expect(canonicalModelId("claude-opus-5-5[1m]")).toBe("claude-opus-5-5");
    expect(canonicalModelId("claude-sonnet-4-5-20250929")).toBe("claude-sonnet-4-5");
    expect(canonicalModelId("claude-opus-5-5-acme-internal-prod")).toBe("claude-opus-5-5");
    expect(canonicalModelId("codex-auto-review")).toBeNull();
  });
});

describe("eventCost", () => {
  it("prices every token category at its own rate", () => {
    const cost = eventCost(
      event("claude-opus-5-5", { input: M, output: M, cacheRead: M, cacheWrite5m: M, cacheWrite1h: M }),
    );
    expect(cost).toMatchObject({ input: 4, output: 20, cacheRead: 0.2, cacheWrite: 13 });
    expect(cost?.total).toBeCloseTo(37.2, 10);
  });

  it("does not double-count reasoning tokens (they are already inside output)", () => {
    expect(eventCost(event("claude-sonnet-5-5", { output: M, reasoning: M }))?.total).toBe(10);
  });

  it("applies fast mode (2x) and US-only inference (1.1x) multiplicatively", () => {
    const fastUs = eventCost(event("claude-opus-5-5", { output: M }, { speed: "fast", inferenceGeo: "us" }));
    expect(fastUs?.total).toBeCloseTo(20 * 2 * 1.1, 10);
  });

  it("adds $10 per 1,000 web searches without applying token multipliers", () => {
    const cost = eventCost(event("claude-sonnet-5-5", {}, { webSearches: 3, speed: "fast" }));
    expect(cost?.webSearch).toBeCloseTo(0.03, 10);
    expect(cost?.total).toBeCloseTo(0.03, 10);
  });

  it("picks the price tier from the request's own prompt size when an event merges calls", () => {
    // 380k tokens merged across calls, but the last request's prompt was only 65k: standard tier.
    const merged = event("gpt-5.5", { input: 380_000 }, { promptTokens: 65_000 });
    expect(eventCost(merged)?.input).toBeCloseTo(0.38 * 5, 10);
    expect(eventCost(event("gpt-5.5", { input: 380_000 }))?.input).toBeCloseTo(0.38 * 10, 10);
  });

  it("returns null for unknown models instead of guessing", () => {
    expect(eventCost(event("some-future-model", { output: M }))).toBeNull();
  });
});
