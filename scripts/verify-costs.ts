// Dev check: compares our API-equivalent cost against the totals Claude Code itself
// records in "cost-state" lines, for every session that has one.
import { claudeCodeProjectDirs, eventCost, loadClaudeCodeEvents } from "../packages/core/src/index.js";
import { readLines, findJsonlFiles } from "../packages/core/src/sources/jsonl.js";

const recorded = new Map<string, number>();
for (const dir of claudeCodeProjectDirs()) {
  for (const file of await findJsonlFiles(dir, new Date(0))) {
    for await (const line of readLines(file)) {
      if (!line.includes('"cost-state"')) continue;
      try {
        const rec = JSON.parse(line) as { type?: string; sessionId?: string; totalCostUSD?: number };
        // Later cost-state lines are cumulative, so the last one per session wins.
        if (rec.type === "cost-state" && rec.sessionId && typeof rec.totalCostUSD === "number") {
          recorded.set(rec.sessionId, rec.totalCostUSD);
        }
      } catch {}
    }
  }
}

const events = await loadClaudeCodeEvents({ since: new Date(0), until: new Date() });
const ours = new Map<string, number>();
const unpriced = new Set<string>();
for (const e of events) {
  const c = eventCost(e);
  if (!c) { unpriced.add(e.model); continue; }
  ours.set(e.sessionId, (ours.get(e.sessionId) ?? 0) + c.total);
}

let sumRecorded = 0, sumOurs = 0;
for (const [id, rec] of recorded) {
  const mine = ours.get(id) ?? 0;
  sumRecorded += rec; sumOurs += mine;
  const diff = rec === 0 ? 0 : ((mine - rec) / rec) * 100;
  console.log(`${id.slice(0, 8)}  recorded $${rec.toFixed(2).padStart(8)}  ours $${mine.toFixed(2).padStart(8)}  ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`);
}
console.log(`\nTOTAL recorded $${sumRecorded.toFixed(2)} vs ours $${sumOurs.toFixed(2)} (${(((sumOurs - sumRecorded) / sumRecorded) * 100).toFixed(1)}%) over ${recorded.size} sessions`);
console.log(`Unpriced models: ${[...unpriced].join(", ") || "none"}`);
