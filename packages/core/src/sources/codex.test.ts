import { describe, expect, it } from "vitest";
import { codexSessionDirs, parseCodexFile } from "./codex.js";

const RANGE = { since: new Date("2026-10-01T00:00:00Z"), until: new Date("2026-10-31T00:00:00Z") };

const meta = (source: unknown = "vscode") =>
  JSON.stringify({ type: "session_meta", payload: { id: "sess-1", cwd: "/secret/app", source } });
const turn = (model: string) => JSON.stringify({ type: "turn_context", payload: { model, effort: "high" } });

function tokenCount(
  total: { input: number; cached?: number; output: number; reasoning?: number; write?: number } | null,
  timestamp = "2026-10-15T12:00:00.000Z",
  rateLimits: unknown = undefined,
): string {
  const usage = total && {
    input_tokens: total.input,
    cached_input_tokens: total.cached ?? 0,
    cache_write_input_tokens: total.write ?? 0,
    output_tokens: total.output,
    reasoning_output_tokens: total.reasoning ?? 0,
    total_tokens: total.input + total.output,
  };
  return JSON.stringify({
    type: "event_msg",
    timestamp,
    payload: { type: "token_count", info: usage ? { total_token_usage: usage } : null, rate_limits: rateLimits },
  });
}

describe("parseCodexFile", () => {
  it("turns running totals into per-call usage and ignores repeated totals", async () => {
    const { events } = await parseCodexFile(
      [
        meta(),
        turn("gpt-6.1-sol"),
        tokenCount({ input: 1000, cached: 0, output: 100 }),
        tokenCount({ input: 1000, cached: 0, output: 100 }), // repeat: no new call
        tokenCount({ input: 3500, cached: 2000, output: 150, reasoning: 30 }),
      ],
      RANGE,
    );
    expect(events).toHaveLength(2);
    expect(events[1]?.tokens).toEqual({
      input: 500,
      cacheRead: 2000,
      cacheWrite5m: 0,
      cacheWrite1h: 0,
      output: 50,
      reasoning: 30,
    });
    expect(events[1]?.model).toBe("gpt-6.1-sol");
    expect(events[1]?.projectPath).toBe("/secret/app");
  });

  it("does not re-count the parent's running total at the start of a forked session", async () => {
    const forkStart = JSON.stringify({
      type: "event_msg",
      timestamp: "2026-10-15T12:00:00.000Z",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: { input_tokens: 7_000_000, cached_input_tokens: 0, output_tokens: 50_000 },
          last_token_usage: { input_tokens: 190_000, cached_input_tokens: 0, output_tokens: 600 },
        },
      },
    });
    const { events } = await parseCodexFile([meta(), turn("gpt-6.1-sol"), forkStart], RANGE);
    expect(events[0]?.tokens.input).toBe(190_000);
    expect(events[0]?.tokens.output).toBe(600);
  });

  it("uses the latest model from turn_context for each call", async () => {
    const { events } = await parseCodexFile(
      [meta(), turn("gpt-6-sol"), tokenCount({ input: 10, output: 1 }), turn("gpt-6.1-sol"), tokenCount({ input: 20, output: 2 })],
      RANGE,
    );
    expect(events.map((e) => e.model)).toEqual(["gpt-6-sol", "gpt-6.1-sol"]);
  });

  it("splits cache writes out of input without letting any bucket go negative", async () => {
    const { events } = await parseCodexFile(
      [meta(), turn("gpt-6.1-sol"), tokenCount({ input: 1000, cached: 700, write: 600, output: 5 })],
      RANGE,
    );
    expect(events[0]?.tokens).toMatchObject({ cacheRead: 700, cacheWrite5m: 300, input: 0 });
  });

  it("recovers when the running total restarts lower", async () => {
    const { events } = await parseCodexFile(
      [meta(), turn("gpt-5.5"), tokenCount({ input: 5000, output: 500 }), tokenCount({ input: 300, output: 30 })],
      RANGE,
    );
    expect(events).toHaveLength(2);
    expect(events[1]?.tokens.input).toBe(300);
  });

  it("marks helper sessions (object source with subagent) as subagents", async () => {
    const { events } = await parseCodexFile(
      [meta({ subagent: { other: "guardian" } }), turn("codex-auto-review"), tokenCount({ input: 10, output: 1 })],
      RANGE,
    );
    expect(events[0]?.isSubagent).toBe(true);
  });

  it("skips calls before session_meta/turn_context, outside the range, or with null info", async () => {
    const { events } = await parseCodexFile(
      [
        tokenCount({ input: 10, output: 1 }),
        meta(),
        turn("gpt-5.5"),
        tokenCount(null),
        tokenCount({ input: 20, output: 2 }, "2026-09-01T00:00:00Z"),
        tokenCount({ input: 30, output: 3 }),
        "{not json",
      ],
      RANGE,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.tokens.input).toBe(10);
  });

  it("keeps the most recent rate-limit snapshot, even from calls outside the range", async () => {
    const limits = (used: number) => ({
      plan_type: "plus",
      primary: { used_percent: used, window_minutes: 300, resets_at: 1792464034 },
      secondary: { used_percent: 22, window_minutes: 10080, resets_at: 1792890198 },
    });
    const { latestLimits } = await parseCodexFile(
      [
        meta(),
        turn("gpt-5.5"),
        tokenCount({ input: 1, output: 1 }, "2026-10-15T12:00:00Z", limits(3)),
        tokenCount({ input: 2, output: 2 }, "2026-10-16T12:00:00Z", limits(9)),
      ],
      RANGE,
    );
    expect(latestLimits?.planType).toBe("plus");
    expect(latestLimits?.primary?.usedPercent).toBe(9);
    expect(latestLimits?.secondary?.windowMinutes).toBe(10080);
    expect(latestLimits?.secondary?.resetsAt?.getTime()).toBe(1792890198 * 1000);
  });
});

describe("codexSessionDirs", () => {
  it("honors CODEX_HOME and includes archived sessions", () => {
    expect(codexSessionDirs({ CODEX_HOME: "/c" }, "/h")).toEqual(["/c/sessions", "/c/archived_sessions"]);
    expect(codexSessionDirs({}, "/h")).toEqual(["/h/.codex/sessions", "/h/.codex/archived_sessions"]);
  });
});
