import { addTokens, emptyTokens, type Source, type TokenCounts, type UsageEvent } from "./types.js";

export type UsageSummary = {
  responses: number;
  sessions: number;
  tokens: TokenCounts;
  byModel: Map<string, TokenCounts>;
  bySource: Map<Source, TokenCounts>;
  subagentTokens: TokenCounts;
  toollessResponses: number;
  firstEvent: Date | null;
  lastEvent: Date | null;
};

function bucket<K>(map: Map<K, TokenCounts>, key: K): TokenCounts {
  let tokens = map.get(key);
  if (!tokens) {
    tokens = emptyTokens();
    map.set(key, tokens);
  }
  return tokens;
}

export function summarize(events: UsageEvent[]): UsageSummary {
  const summary: UsageSummary = {
    responses: events.length,
    sessions: 0,
    tokens: emptyTokens(),
    byModel: new Map(),
    bySource: new Map(),
    subagentTokens: emptyTokens(),
    toollessResponses: 0,
    firstEvent: null,
    lastEvent: null,
  };
  const sessions = new Set<string>();

  for (const event of events) {
    sessions.add(`${event.source}:${event.sessionId}`);
    addTokens(summary.tokens, event.tokens);
    addTokens(bucket(summary.byModel, event.model), event.tokens);
    addTokens(bucket(summary.bySource, event.source), event.tokens);
    if (event.isSubagent) addTokens(summary.subagentTokens, event.tokens);
    if (!event.usedTools) summary.toollessResponses += 1;
    if (!summary.firstEvent || event.timestamp < summary.firstEvent) summary.firstEvent = event.timestamp;
    if (!summary.lastEvent || event.timestamp > summary.lastEvent) summary.lastEvent = event.timestamp;
  }

  summary.sessions = sessions.size;
  return summary;
}
