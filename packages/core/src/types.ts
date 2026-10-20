export type Source = "claude-code" | "codex";

export type TokenCounts = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  /** Thinking/reasoning tokens. Already included in `output`; tracked separately for the receipt. */
  reasoning: number;
};

/** One billed model response, normalized across tools. */
export type UsageEvent = {
  source: Source;
  sessionId: string;
  timestamp: Date;
  model: string;
  /** Working directory of the session. Never rendered on a shared receipt. */
  projectPath: string | null;
  isSubagent: boolean;
  usedTools: boolean;
  tokens: TokenCounts;
  /** "fast" doubles the price on models that support fast mode. */
  speed: "standard" | "fast";
  /** "us" (US-only inference) adds a 1.1x multiplier; anything else is standard routing. */
  inferenceGeo: string | null;
  webSearches: number;
};

export type DateRange = { since: Date; until: Date };

export const emptyTokens = (): TokenCounts => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite5m: 0,
  cacheWrite1h: 0,
  reasoning: 0,
});

export function addTokens(target: TokenCounts, add: TokenCounts): void {
  target.input += add.input;
  target.output += add.output;
  target.cacheRead += add.cacheRead;
  target.cacheWrite5m += add.cacheWrite5m;
  target.cacheWrite1h += add.cacheWrite1h;
  target.reasoning += add.reasoning;
}

export function totalTokens(t: TokenCounts): number {
  return t.input + t.output + t.cacheRead + t.cacheWrite5m + t.cacheWrite1h;
}
