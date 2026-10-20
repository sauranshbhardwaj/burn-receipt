import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { findJsonlFiles, readLines, safeJsonParse } from "./jsonl";
import type { DateRange, UsageEvent } from "../types";

const count = z.number().nonnegative().nullish().transform((n) => n ?? 0);

const tokenUsageSchema = z.object({
  input_tokens: count,
  cached_input_tokens: count,
  cache_write_input_tokens: count,
  output_tokens: count,
  reasoning_output_tokens: count,
});
type TokenUsage = z.infer<typeof tokenUsageSchema>;

const windowSchema = z.object({
  used_percent: z.number(),
  window_minutes: z.number(),
  resets_at: z.number().nullish(),
});

const lineSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("session_meta"),
    payload: z.object({ id: z.string(), cwd: z.string().nullish(), source: z.unknown() }),
  }),
  z.object({ type: z.literal("turn_context"), payload: z.object({ model: z.string() }) }),
  z.object({
    type: z.literal("event_msg"),
    timestamp: z.string(),
    payload: z.object({
      type: z.string(),
      info: z
        .object({ total_token_usage: tokenUsageSchema.nullish(), last_token_usage: tokenUsageSchema.nullish() })
        .nullish(),
      rate_limits: z
        .object({
          plan_type: z.string().nullish(),
          primary: windowSchema.nullish(),
          secondary: windowSchema.nullish(),
        })
        .nullish(),
    }),
  }),
]);

export type RateLimitWindow = { usedPercent: number; windowMinutes: number; resetsAt: Date | null };

/** The most recent rate-limit snapshot Codex saw — the closest thing to "how much of my limit is gone". */
export type CodexLimits = {
  observedAt: Date;
  planType: string | null;
  primary: RateLimitWindow | null;
  secondary: RateLimitWindow | null;
};

export type CodexLoadResult = { events: UsageEvent[]; latestLimits: CodexLimits | null };

const toWindow = (w: z.infer<typeof windowSchema> | null | undefined): RateLimitWindow | null =>
  w ? { usedPercent: w.used_percent, windowMinutes: w.window_minutes, resetsAt: w.resets_at ? new Date(w.resets_at * 1000) : null } : null;

const subtract = (a: TokenUsage, b: TokenUsage): TokenUsage => ({
  input_tokens: a.input_tokens - b.input_tokens,
  cached_input_tokens: a.cached_input_tokens - b.cached_input_tokens,
  cache_write_input_tokens: a.cache_write_input_tokens - b.cache_write_input_tokens,
  output_tokens: a.output_tokens - b.output_tokens,
  reasoning_output_tokens: a.reasoning_output_tokens - b.reasoning_output_tokens,
});

const isEmpty = (u: TokenUsage) => u.input_tokens === 0 && u.output_tokens === 0;
const hasNegative = (u: TokenUsage) => Object.values(u).some((n) => n < 0);

/** Codex source is a string for user sessions and an object like {subagent: {...}} for helpers. */
function isSubagentSource(source: unknown): boolean {
  return typeof source === "object" && source !== null && "subagent" in source;
}

/**
 * Parses one Codex rollout file. Codex logs a running total after each model call and sometimes
 * repeats it unchanged, so each billed call is the *difference* between consecutive totals —
 * repeats produce a zero difference and drop out naturally.
 */
export async function parseCodexFile(
  lines: AsyncIterable<string> | Iterable<string>,
  range: DateRange,
): Promise<CodexLoadResult> {
  const events: UsageEvent[] = [];
  let latestLimits: CodexLimits | null = null;
  let sessionId: string | null = null;
  let projectPath: string | null = null;
  let isSubagent = false;
  let model: string | null = null;
  let previousTotal: TokenUsage | null = null;

  for await (const line of lines) {
    const parsed = lineSchema.safeParse(safeJsonParse(line));
    if (!parsed.success) continue;
    const record = parsed.data;

    if (record.type === "session_meta") {
      sessionId = record.payload.id;
      projectPath = record.payload.cwd ?? null;
      isSubagent = isSubagentSource(record.payload.source);
      continue;
    }
    if (record.type === "turn_context") {
      model = record.payload.model;
      continue;
    }
    if (record.payload.type !== "token_count") continue;

    const timestamp = new Date(record.timestamp);
    if (Number.isNaN(timestamp.getTime())) continue;

    const limits = record.payload.rate_limits;
    if (limits && (!latestLimits || timestamp > latestLimits.observedAt)) {
      latestLimits = {
        observedAt: timestamp,
        planType: limits.plan_type ?? null,
        primary: toWindow(limits.primary),
        secondary: toWindow(limits.secondary),
      };
    }

    const total = record.payload.info?.total_token_usage;
    const last = record.payload.info?.last_token_usage;
    if (!total) continue;
    let call = previousTotal ? subtract(total, previousTotal) : (last ?? total);
    // A running total that goes backwards means the counter restarted (e.g. a resumed process).
    if (hasNegative(call)) call = last ?? total;
    previousTotal = total;

    if (isEmpty(call) || !sessionId || !model) continue;
    if (timestamp < range.since || timestamp > range.until) continue;

    // OpenAI counts cached and cache-written tokens inside input_tokens; split them out so each
    // is priced once. Reasoning tokens are likewise already inside output_tokens.
    const cacheRead = Math.min(call.cached_input_tokens, call.input_tokens);
    const cacheWrite = Math.min(call.cache_write_input_tokens, call.input_tokens - cacheRead);
    events.push({
      source: "codex",
      sessionId,
      threadId: sessionId,
      timestamp,
      model,
      projectPath,
      isSubagent,
      usedTools: true,
      tokens: {
        input: call.input_tokens - cacheRead - cacheWrite,
        output: call.output_tokens,
        cacheRead,
        cacheWrite5m: cacheWrite,
        cacheWrite1h: 0,
        reasoning: Math.min(call.reasoning_output_tokens, call.output_tokens),
      },
      speed: "standard",
      inferenceGeo: null,
      webSearches: 0,
      // When a running-total delta spans several calls, the price tier follows the last call.
      ...(last ? { promptTokens: last.input_tokens } : {}),
    });
  }

  return { events, latestLimits };
}

export function codexSessionDirs(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string[] {
  const root = env.CODEX_HOME?.trim() || join(home, ".codex");
  return [join(root, "sessions"), join(root, "archived_sessions")];
}

export async function loadCodexEvents(range: DateRange, dirs: string[] = codexSessionDirs()): Promise<CodexLoadResult> {
  const events: UsageEvent[] = [];
  let latestLimits: CodexLimits | null = null;
  for (const dir of dirs) {
    for (const file of await findJsonlFiles(dir, range.since)) {
      const result = await parseCodexFile(readLines(file), range);
      events.push(...result.events);
      if (result.latestLimits && (!latestLimits || result.latestLimits.observedAt > latestLimits.observedAt)) {
        latestLimits = result.latestLimits;
      }
    }
  }
  return { events, latestLimits };
}
