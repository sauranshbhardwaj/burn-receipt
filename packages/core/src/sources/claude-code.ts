import { homedir } from "node:os";
import { basename, join, sep } from "node:path";
import { z } from "zod";
import { findJsonlFiles, readLines, safeJsonParse } from "./jsonl.js";
import type { DateRange, UsageEvent } from "../types.js";

const count = z.number().nonnegative().nullish().transform((n) => n ?? 0);

const assistantRecordSchema = z.object({
  type: z.literal("assistant"),
  timestamp: z.string(),
  sessionId: z.string(),
  cwd: z.string().nullish(),
  isSidechain: z.boolean().nullish(),
  requestId: z.string().nullish(),
  uuid: z.string().nullish(),
  message: z.object({
    id: z.string().nullish(),
    model: z.string(),
    content: z.array(z.object({ type: z.string() })).nullish(),
    usage: z.object({
      input_tokens: count,
      output_tokens: count,
      cache_read_input_tokens: count,
      cache_creation_input_tokens: count,
      cache_creation: z
        .object({
          ephemeral_5m_input_tokens: count,
          ephemeral_1h_input_tokens: count,
        })
        .nullish(),
      output_tokens_details: z.object({ thinking_tokens: count }).nullish(),
      server_tool_use: z.object({ web_search_requests: count }).nullish(),
      speed: z.string().nullish(),
      inference_geo: z.string().nullish(),
    }),
  }),
});

type ParsedLine = { dedupeKey: string; event: UsageEvent };

/** Claude Code writes this placeholder model for locally generated messages that cost nothing. */
const SYNTHETIC_MODEL = "<synthetic>";

export function parseClaudeCodeLine(line: string, filePath: string): ParsedLine | null {
  // Cheap pre-filter: most lines are attachments, snapshots, etc. Skipping them before
  // JSON.parse is the difference between seconds and minutes on multi-GB histories.
  if (!line.includes('"assistant"')) return null;

  const parsed = assistantRecordSchema.safeParse(safeJsonParse(line));
  if (!parsed.success) return null;
  const record = parsed.data;
  if (record.message.model === SYNTHETIC_MODEL) return null;

  const timestamp = new Date(record.timestamp);
  if (Number.isNaN(timestamp.getTime())) return null;

  const usage = record.message.usage;
  const cacheWriteTotal = usage.cache_creation_input_tokens;
  // Older Claude Code versions report only the total cache write, without the TTL split.
  // Those versions only used the 5-minute cache, so attribute it all there.
  const split = usage.cache_creation;
  const cacheWrite1h = split ? split.ephemeral_1h_input_tokens : 0;
  const cacheWrite5m = split ? split.ephemeral_5m_input_tokens : cacheWriteTotal;

  const usedTools = (record.message.content ?? []).some((block) => block.type === "tool_use");
  const inSubagentFile = filePath.includes(`${sep}subagents${sep}`);

  // One API response is logged as several records (one per content block), each repeating
  // the same usage. Without de-duplication, totals come out ~2x too high.
  const dedupeKey = record.message.id
    ? `${record.message.id}:${record.requestId ?? ""}`
    : `uuid:${record.uuid ?? line}`;

  return {
    dedupeKey,
    event: {
      source: "claude-code",
      sessionId: record.sessionId,
      threadId: inSubagentFile ? `${record.sessionId}:${basename(filePath, ".jsonl")}` : record.sessionId,
      timestamp,
      model: record.message.model,
      projectPath: record.cwd ?? null,
      isSubagent: record.isSidechain === true || inSubagentFile,
      usedTools,
      tokens: {
        input: usage.input_tokens,
        output: usage.output_tokens,
        cacheRead: usage.cache_read_input_tokens,
        cacheWrite5m,
        cacheWrite1h,
        reasoning: usage.output_tokens_details?.thinking_tokens ?? 0,
      },
      speed: usage.speed === "fast" ? "fast" : "standard",
      inferenceGeo: usage.inference_geo ?? null,
      webSearches: usage.server_tool_use?.web_search_requests ?? 0,
    },
  };
}

/** Merges duplicate records of the same API response and drops events outside the range. */
export class ClaudeCodeEventCollector {
  readonly #events = new Map<string, UsageEvent>();

  constructor(private readonly range: DateRange) {}

  add(parsed: ParsedLine): void {
    const { timestamp } = parsed.event;
    if (timestamp < this.range.since || timestamp > this.range.until) return;

    const existing = this.#events.get(parsed.dedupeKey);
    if (!existing) {
      this.#events.set(parsed.dedupeKey, parsed.event);
      return;
    }
    // Each duplicate carries a different content block, so tool use may appear on any of them.
    existing.usedTools ||= parsed.event.usedTools;
    if (timestamp < existing.timestamp) existing.timestamp = timestamp;
  }

  events(): UsageEvent[] {
    return [...this.#events.values()];
  }
}

export function claudeCodeProjectDirs(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string[] {
  const fromEnv = (env.CLAUDE_CONFIG_DIR ?? "")
    .split(",")
    .map((dir) => dir.trim())
    .filter(Boolean)
    .map((dir) => join(dir, "projects"));
  const defaults = [join(home, ".claude", "projects"), join(home, ".config", "claude", "projects")];
  return [...new Set([...fromEnv, ...defaults])];
}

export async function loadClaudeCodeEvents(
  range: DateRange,
  dirs: string[] = claudeCodeProjectDirs(),
): Promise<UsageEvent[]> {
  const collector = new ClaudeCodeEventCollector(range);
  for (const dir of dirs) {
    for (const file of await findJsonlFiles(dir, range.since)) {
      for await (const line of readLines(file)) {
        const parsed = parseClaudeCodeLine(line, file);
        if (parsed) collector.add(parsed);
      }
    }
  }
  return collector.events();
}
