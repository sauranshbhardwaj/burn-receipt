import { eventCost, priceMultiplier, resolvePrice } from "./pricing";
import { totalTokens, type UsageEvent } from "./types";

const MINUTE_MS = 60_000;
/** Prompt cache lifetimes. A cache write after a gap longer than its TTL means the cache had expired. */
const CACHE_TTL_5M_MS = 5 * MINUTE_MS;
const CACHE_TTL_1H_MS = 60 * MINUTE_MS;

/** Receipt lines. Every dollar lands in exactly one, so the lines add up to the total like a real receipt. */
export type LineItemId = "startup" | "idleReloads" | "rereading" | "newContext" | "thinking" | "writing" | "webSearch";

export const LINE_ITEM_ORDER: readonly LineItemId[] = [
  "rereading",
  "newContext",
  "writing",
  "thinking",
  "startup",
  "idleReloads",
  "webSearch",
];

export type SessionStat = {
  sessionId: string;
  cost: number;
  responses: number;
  subagents: number;
  startedAt: Date;
  endedAt: Date;
};

export type Analysis = {
  totalCost: number;
  lineItems: Record<LineItemId, number>;
  /** What idle reloads cost beyond reading the same tokens from a warm cache. */
  avoidableIdleCost: number;
  idleReloadCount: number;
  subagentCost: number;
  subagentThreads: number;
  responses: number;
  sessions: number;
  totalTokens: number;
  costByModel: Map<string, number>;
  priciestSession: SessionStat | null;
  /** Session with the most helper agents spawned. */
  widestFanout: SessionStat | null;
  unpricedResponses: number;
  unpricedModels: string[];
  firstEvent: Date | null;
  lastEvent: Date | null;
};

const emptyLineItems = (): Record<LineItemId, number> => ({
  startup: 0,
  idleReloads: 0,
  rereading: 0,
  newContext: 0,
  thinking: 0,
  writing: 0,
  webSearch: 0,
});

function groupByThread(events: UsageEvent[]): Map<string, UsageEvent[]> {
  const threads = new Map<string, UsageEvent[]>();
  for (const event of events) {
    const key = `${event.source}:${event.threadId}`;
    const list = threads.get(key);
    if (list) list.push(event);
    else threads.set(key, [event]);
  }
  for (const list of threads.values()) list.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  return threads;
}

export function analyze(events: UsageEvent[]): Analysis {
  const analysis: Analysis = {
    totalCost: 0,
    lineItems: emptyLineItems(),
    avoidableIdleCost: 0,
    idleReloadCount: 0,
    subagentCost: 0,
    subagentThreads: 0,
    responses: events.length,
    sessions: 0,
    totalTokens: 0,
    costByModel: new Map(),
    priciestSession: null,
    widestFanout: null,
    unpricedResponses: 0,
    unpricedModels: [],
    firstEvent: null,
    lastEvent: null,
  };
  const unpriced = new Set<string>();
  const sessions = new Map<string, SessionStat>();

  for (const thread of groupByThread(events).values()) {
    const first = thread[0];
    if (first?.isSubagent) analysis.subagentThreads += 1;

    thread.forEach((event, index) => {
      analysis.totalTokens += totalTokens(event.tokens);
      if (!analysis.firstEvent || event.timestamp < analysis.firstEvent) analysis.firstEvent = event.timestamp;
      if (!analysis.lastEvent || event.timestamp > analysis.lastEvent) analysis.lastEvent = event.timestamp;

      const sessionKey = `${event.source}:${event.sessionId}`;
      let session = sessions.get(sessionKey);
      if (!session) {
        session = { sessionId: event.sessionId, cost: 0, responses: 0, subagents: 0, startedAt: event.timestamp, endedAt: event.timestamp };
        sessions.set(sessionKey, session);
      }
      session.responses += 1;
      if (event.timestamp < session.startedAt) session.startedAt = event.timestamp;
      if (event.timestamp > session.endedAt) session.endedAt = event.timestamp;
      if (index === 0 && event.isSubagent) session.subagents += 1;

      const cost = eventCost(event);
      const price = resolvePrice(event.model, event.tokens);
      if (!cost || !price) {
        analysis.unpricedResponses += 1;
        unpriced.add(event.model);
        return;
      }

      analysis.totalCost += cost.total;
      session.cost += cost.total;
      if (event.isSubagent) analysis.subagentCost += cost.total;
      analysis.costByModel.set(event.model, (analysis.costByModel.get(event.model) ?? 0) + cost.total);

      const items = analysis.lineItems;
      items.rereading += cost.cacheRead;
      items.newContext += cost.input;
      items.webSearch += cost.webSearch;

      // Thinking is billed as output; split output cost by the reasoning share.
      const thinkingShare = event.tokens.output > 0 ? Math.min(1, event.tokens.reasoning / event.tokens.output) : 0;
      items.thinking += cost.output * thinkingShare;
      items.writing += cost.output * (1 - thinkingShare);

      if (cost.cacheWrite === 0) return;
      const previous = index > 0 ? thread[index - 1] : undefined;
      if (!previous) {
        // The first write of a thread is the fixed cost of loading system prompt, tools and CLAUDE.md.
        items.startup += cost.cacheWrite;
        return;
      }

      const gapMs = event.timestamp.getTime() - previous.timestamp.getTime();
      const expired5m = gapMs > CACHE_TTL_5M_MS ? event.tokens.cacheWrite5m : 0;
      const expired1h = gapMs > CACHE_TTL_1H_MS ? event.tokens.cacheWrite1h : 0;
      // Price each bucket at its own rate: 1h writes cost more per token than 5m writes.
      const perToken = priceMultiplier(event) / 1_000_000;
      const idleWriteCost = (expired5m * price.cacheWrite5m + expired1h * price.cacheWrite1h) * perToken;

      items.idleReloads += idleWriteCost;
      items.newContext += cost.cacheWrite - idleWriteCost;
      if (idleWriteCost > 0) {
        analysis.idleReloadCount += 1;
        // Had the cache still been warm, the same tokens would have been billed as cheap reads.
        const warmReadCost = (expired5m + expired1h) * price.cacheRead * perToken;
        analysis.avoidableIdleCost += Math.max(0, idleWriteCost - warmReadCost);
      }
    });
  }

  analysis.sessions = sessions.size;
  analysis.unpricedModels = [...unpriced].sort();
  for (const session of sessions.values()) {
    if (!analysis.priciestSession || session.cost > analysis.priciestSession.cost) analysis.priciestSession = session;
    if (session.subagents > 0 && (!analysis.widestFanout || session.subagents > analysis.widestFanout.subagents)) {
      analysis.widestFanout = session;
    }
  }
  return analysis;
}
