import { mkdtemp, mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ClaudeCodeEventCollector,
  claudeCodeProjectDirs,
  loadClaudeCodeEvents,
  parseClaudeCodeLine,
} from "./claude-code";

const RANGE = { since: new Date("2026-10-01T00:00:00Z"), until: new Date("2026-10-31T00:00:00Z") };

function assistantLine(overrides: {
  id?: string | null;
  requestId?: string;
  model?: string;
  timestamp?: string;
  contentType?: string;
  isSidechain?: boolean;
  usage?: Record<string, unknown>;
} = {}): string {
  const message: Record<string, unknown> = {
    model: overrides.model ?? "claude-sonnet-5-5",
    content: [{ type: overrides.contentType ?? "text" }],
    usage: overrides.usage ?? {
      input_tokens: 10,
      output_tokens: 200,
      cache_read_input_tokens: 5000,
      cache_creation_input_tokens: 3000,
      cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 2000 },
      output_tokens_details: { thinking_tokens: 50 },
    },
  };
  if (overrides.id !== null) message.id = overrides.id ?? "msg_1";
  return JSON.stringify({
    type: "assistant",
    timestamp: overrides.timestamp ?? "2026-10-15T12:00:00.000Z",
    sessionId: "session-a",
    cwd: "/Users/someone/secret-project",
    isSidechain: overrides.isSidechain ?? false,
    requestId: overrides.requestId ?? "req_1",
    uuid: Math.random().toString(36),
    message,
  });
}

describe("parseClaudeCodeLine", () => {
  it("normalizes usage including the cache TTL split and thinking tokens", () => {
    const parsed = parseClaudeCodeLine(assistantLine(), "/x/session.jsonl");
    expect(parsed?.event.tokens).toEqual({
      input: 10,
      output: 200,
      cacheRead: 5000,
      cacheWrite5m: 1000,
      cacheWrite1h: 2000,
      reasoning: 50,
    });
    expect(parsed?.event.model).toBe("claude-sonnet-5-5");
    expect(parsed?.dedupeKey).toBe("msg_1:req_1");
  });

  it("attributes cache writes to the 5m bucket when the TTL split is missing (older versions)", () => {
    const line = assistantLine({
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 700 },
    });
    const tokens = parseClaudeCodeLine(line, "/x/s.jsonl")?.event.tokens;
    expect(tokens?.cacheWrite5m).toBe(700);
    expect(tokens?.cacheWrite1h).toBe(0);
    expect(tokens?.cacheRead).toBe(0);
  });

  it.each([
    ["non-assistant records", JSON.stringify({ type: "user", message: { content: "hi" } })],
    ["truncated JSON", assistantLine().slice(0, 60)],
    ["synthetic messages", assistantLine({ model: "<synthetic>" })],
    ["invalid timestamps", assistantLine({ timestamp: "not-a-date" })],
    ["records missing usage", JSON.stringify({ type: "assistant", timestamp: "2026-10-15T00:00:00Z", sessionId: "s", message: { model: "m" } })],
    ["negative token counts", assistantLine({ usage: { input_tokens: -5, output_tokens: 1 } })],
  ])("ignores %s", (_label, line) => {
    expect(parseClaudeCodeLine(line, "/x/s.jsonl")).toBeNull();
  });

  it("marks subagent events via isSidechain or the subagents folder", () => {
    expect(parseClaudeCodeLine(assistantLine({ isSidechain: true }), "/x/s.jsonl")?.event.isSubagent).toBe(true);
    expect(parseClaudeCodeLine(assistantLine(), "/p/abc/subagents/agent-1.jsonl")?.event.isSubagent).toBe(true);
    expect(parseClaudeCodeLine(assistantLine(), "/p/abc/session.jsonl")?.event.isSubagent).toBe(false);
  });

  it("falls back to a per-record key when the message id is missing", () => {
    expect(parseClaudeCodeLine(assistantLine({ id: null }), "/x/s.jsonl")?.dedupeKey).toMatch(/^uuid:/);
  });
});

describe("ClaudeCodeEventCollector", () => {
  it("counts one API response once even when logged as several content-block records", () => {
    const collector = new ClaudeCodeEventCollector(RANGE);
    for (const type of ["thinking", "text", "tool_use"]) {
      const parsed = parseClaudeCodeLine(assistantLine({ contentType: type }), "/x/s.jsonl");
      if (parsed) collector.add(parsed);
    }
    const events = collector.events();
    expect(events).toHaveLength(1);
    expect(events[0]?.tokens.output).toBe(200);
    // tool_use appeared on only one of the duplicates — the merged event must keep it.
    expect(events[0]?.usedTools).toBe(true);
  });

  it("keeps the final (largest) usage of a streamed reply, whichever copy carries it", () => {
    const collector = new ClaudeCodeEventCollector(RANGE);
    const usage = (output: number) => ({ input_tokens: 5, output_tokens: output, cache_read_input_tokens: 100 });
    for (const [output, type] of [[1, "thinking"], [500, "tool_use"], [120, "text"]] as const) {
      const parsed = parseClaudeCodeLine(assistantLine({ contentType: type, usage: usage(output) }), "/x/s.jsonl");
      if (parsed) collector.add(parsed);
    }
    const [event] = collector.events();
    expect(event?.tokens.output).toBe(500);
    expect(event?.tokens.cacheRead).toBe(100);
    expect(event?.usedTools).toBe(true);
  });

  it("keeps distinct responses separate", () => {
    const collector = new ClaudeCodeEventCollector(RANGE);
    for (const id of ["msg_1", "msg_2"]) {
      const parsed = parseClaudeCodeLine(assistantLine({ id }), "/x/s.jsonl");
      if (parsed) collector.add(parsed);
    }
    expect(collector.events()).toHaveLength(2);
  });

  it("drops events outside the date range, inclusive at both ends", () => {
    const collector = new ClaudeCodeEventCollector(RANGE);
    const stamps = ["2026-09-30T23:59:59Z", "2026-10-01T00:00:00Z", "2026-10-31T00:00:00Z", "2026-11-01T00:00:00Z"];
    stamps.forEach((timestamp, i) => {
      const parsed = parseClaudeCodeLine(assistantLine({ id: `m${i}`, timestamp }), "/x/s.jsonl");
      if (parsed) collector.add(parsed);
    });
    expect(collector.events().map((e) => e.timestamp.toISOString())).toEqual([
      "2026-10-01T00:00:00.000Z",
      "2026-10-31T00:00:00.000Z",
    ]);
  });
});

describe("claudeCodeProjectDirs", () => {
  it("includes CLAUDE_CONFIG_DIR entries first and de-duplicates", () => {
    const dirs = claudeCodeProjectDirs({ CLAUDE_CONFIG_DIR: "/a, /home/u/.claude" }, "/home/u");
    expect(dirs).toEqual(["/a/projects", "/home/u/.claude/projects", "/home/u/.config/claude/projects"]);
  });

  it("uses only the defaults when the env var is unset", () => {
    expect(claudeCodeProjectDirs({}, "/h")).toEqual(["/h/.claude/projects", "/h/.config/claude/projects"]);
  });
});

describe("loadClaudeCodeEvents", () => {
  let root: string;
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("reads nested session files, merges duplicates across files, and skips stale files", async () => {
    root = await mkdtemp(join(tmpdir(), "burn-receipt-"));
    const project = join(root, "-Users-someone-app");
    await mkdir(join(project, "abc", "subagents"), { recursive: true });

    await writeFile(join(project, "abc.jsonl"), [assistantLine(), "garbage{", assistantLine({ contentType: "tool_use" })].join("\n"));
    await writeFile(join(project, "abc", "subagents", "agent-1.jsonl"), assistantLine({ id: "msg_sub", isSidechain: true }));
    const stale = join(project, "old.jsonl");
    await writeFile(stale, assistantLine({ id: "msg_old" }));
    await utimes(stale, new Date("2026-01-01"), new Date("2026-01-01"));

    const events = await loadClaudeCodeEvents(RANGE, [root, join(root, "does-not-exist")]);
    expect(events).toHaveLength(2);
    expect(events.filter((e) => e.isSubagent)).toHaveLength(1);
  });
});
