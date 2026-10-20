import type { TokenCounts, UsageEvent } from "./types";

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
const OPENAI_LONG_CONTEXT_OVER = 272_000;

const p = (input: number, cacheWrite5m: number, cacheWrite1h: number, cacheRead: number, output: number): ModelPrice => ({
  input,
  cacheWrite5m,
  cacheWrite1h,
  cacheRead,
  output,
});

/** OpenAI has one cache-write rate (no TTL split); models without one bill writes as normal input. */
const openai = (input: number, cachedInput: number, cacheWrite: number | null, output: number): ModelPrice =>
  p(input, cacheWrite ?? input, cacheWrite ?? input, cachedInput, output);

/** Some models bill a whole request at a higher tier once its prompt passes a size threshold. */
type PriceEntry = { base: ModelPrice; longPrompt?: { over: number; price: ModelPrice } };

/**
 * Keyed by model-id prefix so dated snapshot ids (e.g. "claude-sonnet-4-5-20250929") resolve too.
 * Anthropic: https://platform.claude.com/docs/en/about-claude/pricing (fetched 2026-10-20).
 * OpenAI: https://developers.openai.com/api/docs/pricing (fetched 2026-10-20). gpt-5.6-sol is
 * promotional pricing "at least through November 21, 2026".
 */
const PRICES: Record<string, PriceEntry> = {
  "claude-fable-5-1": { base: p(10, 12.5, 20, 0.25, 50) },
  "claude-mythos-5-1": { base: p(10, 12.5, 20, 0.25, 50) },
  "claude-fable-5": { base: p(10, 12.5, 20, 1, 50) },
  "claude-mythos-5": { base: p(10, 12.5, 20, 1, 50) },
  "claude-opus-5-5": { base: p(4, 5, 8, 0.2, 20) },
  "claude-opus-5": { base: p(5, 6.25, 10, 0.5, 25) },
  "claude-opus-4-8": { base: p(5, 6.25, 10, 0.5, 25) },
  "claude-opus-4-7": { base: p(5, 6.25, 10, 0.5, 25) },
  "claude-opus-4-6": { base: p(5, 6.25, 10, 0.5, 25) },
  "claude-opus-4-5": { base: p(5, 6.25, 10, 0.5, 25) },
  "claude-opus-4-1": { base: p(15, 18.75, 30, 1.5, 75) },
  "claude-opus-4": { base: p(15, 18.75, 30, 1.5, 75) },
  "claude-sonnet-5-5": { base: p(2, 2.5, 4, 0.1, 10) },
  "claude-sonnet-5": { base: p(2, 2.5, 4, 0.2, 10) },
  "claude-sonnet-4-6": { base: p(3, 3.75, 6, 0.3, 15) },
  "claude-sonnet-4-5": { base: p(3, 3.75, 6, 0.3, 15) },
  "claude-sonnet-4": { base: p(3, 3.75, 6, 0.3, 15) },
  "claude-haiku-5-5": {
    base: p(0.1, 0.125, 0.2, 0.01, 0.5),
    longPrompt: { over: 100_000, price: p(0.5, 0.625, 1, 0.05, 2.5) },
  },
  "claude-haiku-4-5": { base: p(1, 1.25, 2, 0.1, 5) },
  "claude-3-5-haiku": { base: p(0.8, 1, 1.6, 0.08, 4) },

  "gpt-6.1-sol": {
    base: openai(2, 0.1, 2.5, 10),
    longPrompt: { over: OPENAI_LONG_CONTEXT_OVER, price: openai(4, 0.2, 5, 15) },
  },
  "gpt-6-sol": {
    base: openai(2, 0.2, 2.5, 10),
    longPrompt: { over: OPENAI_LONG_CONTEXT_OVER, price: openai(4, 0.4, 5, 15) },
  },
  "gpt-6-luna": {
    base: openai(0.1, 0.01, 0.125, 0.5),
    longPrompt: { over: OPENAI_LONG_CONTEXT_OVER, price: openai(0.2, 0.02, 0.25, 0.75) },
  },
  "gpt-5.6-sol": {
    base: openai(4, 0.4, 5, 20),
    longPrompt: { over: OPENAI_LONG_CONTEXT_OVER, price: openai(8, 0.8, 10, 30) },
  },
  "gpt-5.5": {
    base: openai(5, 0.5, null, 30),
    longPrompt: { over: OPENAI_LONG_CONTEXT_OVER, price: openai(10, 1, null, 45) },
  },
  "gpt-5.3-codex": { base: openai(1.75, 0.175, null, 14) },
};

// Longest prefix first, so "claude-opus-5-5" wins over "claude-opus-5".
const PRICE_KEYS = Object.keys(PRICES).sort((a, b) => b.length - a.length);

function promptLength(t: TokenCounts): number {
  return t.input + t.cacheRead + t.cacheWrite5m + t.cacheWrite1h;
}

/** Returns null for models we don't have a price for — better an honest gap than a guess. */
export function resolvePrice(rawModel: string, tokens?: TokenCounts): ModelPrice | null {
  // Claude Code tags 1M-context selections like "claude-opus-5[1m]"; the price is the same.
  const model = rawModel.replace(/\[[^\]]*\]$/, "");
  const key = PRICE_KEYS.find((prefix) => model === prefix || model.startsWith(`${prefix}-`));
  const entry = key ? PRICES[key] : undefined;
  if (!entry) return null;
  if (entry.longPrompt && tokens && promptLength(tokens) > entry.longPrompt.over) return entry.longPrompt.price;
  return entry.base;
}

export type CostBreakdown = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  webSearch: number;
  total: number;
};

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
