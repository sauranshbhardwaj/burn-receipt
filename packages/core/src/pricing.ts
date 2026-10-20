import type { TokenCounts, UsageEvent } from "./types.js";

/** USD per million tokens. */
export type ModelPrice = {
  input: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
};

/** Prices change; the receipt prints this date so nobody mistakes an estimate for a bill. */
export const PRICES_AS_OF = "2026-10-20";

const MILLION = 1_000_000;
const FAST_MODE_MULTIPLIER = 2;
const US_ONLY_INFERENCE_MULTIPLIER = 1.1;
const WEB_SEARCH_USD = 10 / 1000;

/** Haiku 5.5 is the one model billed by prompt length: over this, a request pays the higher tier. */
const HAIKU_LONG_PROMPT_THRESHOLD = 100_000;

const p = (input: number, cacheWrite5m: number, cacheWrite1h: number, cacheRead: number, output: number): ModelPrice => ({
  input,
  cacheWrite5m,
  cacheWrite1h,
  cacheRead,
  output,
});

/**
 * Anthropic first-party API rates, keyed by model-id prefix so dated snapshot ids
 * (e.g. "claude-sonnet-4-5-20250929") resolve too.
 * Source: https://platform.claude.com/docs/en/about-claude/pricing (fetched 2026-10-20).
 */
const CLAUDE_PRICES: Record<string, ModelPrice> = {
  "claude-fable-5-1": p(10, 12.5, 20, 0.25, 50),
  "claude-mythos-5-1": p(10, 12.5, 20, 0.25, 50),
  "claude-fable-5": p(10, 12.5, 20, 1, 50),
  "claude-mythos-5": p(10, 12.5, 20, 1, 50),
  "claude-opus-5-5": p(4, 5, 8, 0.2, 20),
  "claude-opus-5": p(5, 6.25, 10, 0.5, 25),
  "claude-opus-4-8": p(5, 6.25, 10, 0.5, 25),
  "claude-opus-4-7": p(5, 6.25, 10, 0.5, 25),
  "claude-opus-4-6": p(5, 6.25, 10, 0.5, 25),
  "claude-opus-4-5": p(5, 6.25, 10, 0.5, 25),
  "claude-opus-4-1": p(15, 18.75, 30, 1.5, 75),
  "claude-opus-4": p(15, 18.75, 30, 1.5, 75),
  "claude-sonnet-5-5": p(2, 2.5, 4, 0.1, 10),
  "claude-sonnet-5": p(2, 2.5, 4, 0.2, 10),
  "claude-sonnet-4-6": p(3, 3.75, 6, 0.3, 15),
  "claude-sonnet-4-5": p(3, 3.75, 6, 0.3, 15),
  "claude-sonnet-4": p(3, 3.75, 6, 0.3, 15),
  "claude-haiku-5-5": p(0.1, 0.125, 0.2, 0.01, 0.5),
  "claude-haiku-4-5": p(1, 1.25, 2, 0.1, 5),
  "claude-3-5-haiku": p(0.8, 1, 1.6, 0.08, 4),
};

const HAIKU_5_5_LONG_PROMPT = p(0.5, 0.625, 1, 0.05, 2.5);

// Longest prefix first, so "claude-opus-5-5" wins over "claude-opus-5".
const PRICE_KEYS = Object.keys(CLAUDE_PRICES).sort((a, b) => b.length - a.length);

/** Returns null for models we don't have a price for — better an honest gap than a guess. */
export function resolvePrice(rawModel: string, tokens?: TokenCounts): ModelPrice | null {
  // Claude Code tags 1M-context selections like "claude-opus-5[1m]"; the price is the same.
  const model = rawModel.replace(/\[[^\]]*\]$/, "");
  const key = PRICE_KEYS.find((prefix) => model === prefix || model.startsWith(`${prefix}-`));
  if (!key) return null;
  if (key === "claude-haiku-5-5" && tokens && promptLength(tokens) > HAIKU_LONG_PROMPT_THRESHOLD) {
    return HAIKU_5_5_LONG_PROMPT;
  }
  return CLAUDE_PRICES[key] ?? null;
}

function promptLength(t: TokenCounts): number {
  return t.input + t.cacheRead + t.cacheWrite5m + t.cacheWrite1h;
}

export type CostBreakdown = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  webSearch: number;
  total: number;
};

export const emptyCost = (): CostBreakdown => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, webSearch: 0, total: 0 });

export function addCost(target: CostBreakdown, add: CostBreakdown): void {
  target.input += add.input;
  target.output += add.output;
  target.cacheRead += add.cacheRead;
  target.cacheWrite += add.cacheWrite;
  target.webSearch += add.webSearch;
  target.total += add.total;
}

/** Fast mode and US-only inference multiply every token category (caching multipliers stack on top). */
export function priceMultiplier(event: Pick<UsageEvent, "speed" | "inferenceGeo">): number {
  return (event.speed === "fast" ? FAST_MODE_MULTIPLIER : 1) * (event.inferenceGeo === "us" ? US_ONLY_INFERENCE_MULTIPLIER : 1);
}

/** API-equivalent cost of one response, or null if the model is unpriced. */
export function eventCost(event: UsageEvent): CostBreakdown | null {
  const price = resolvePrice(event.model, event.tokens);
  if (!price) return null;

  const multiplier = priceMultiplier(event);
  const rate = (tokens: number, perMillion: number) => (tokens / MILLION) * perMillion * multiplier;

  const t = event.tokens;
  const cost: CostBreakdown = {
    input: rate(t.input, price.input),
    output: rate(t.output, price.output),
    cacheRead: rate(t.cacheRead, price.cacheRead),
    cacheWrite: rate(t.cacheWrite5m, price.cacheWrite5m) + rate(t.cacheWrite1h, price.cacheWrite1h),
    webSearch: event.webSearches * WEB_SEARCH_USD,
    total: 0,
  };
  cost.total = cost.input + cost.output + cost.cacheRead + cost.cacheWrite + cost.webSearch;
  return cost;
}
