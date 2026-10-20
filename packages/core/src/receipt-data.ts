import { z } from "zod";
import { analyze, LINE_ITEM_ORDER, type Analysis, type LineItemId } from "./analyze.js";
import { planCostForDays, type Plan } from "./plans.js";
import { PRICES_AS_OF } from "./pricing.js";
import type { CodexLimits } from "./sources/codex.js";
import type { DateRange, Source, UsageEvent } from "./types.js";

/**
 * Everything a receipt shows — and the only thing that ever leaves the user's machine when they
 * share. Numbers and enums only: no prompts, file paths, project names or session ids. The
 * schema is strict so the share API can reject anything else.
 */
const usd = z.number().finite().nonnegative().max(10_000_000);
const count = z.number().int().nonnegative().max(1_000_000_000);
const share = z.number().finite().min(0).max(1);
const percent = z.number().finite().min(0).max(1000);

export const receiptDataSchema = z
  .object({
    version: z.literal(1),
    periodDays: z.number().int().min(1).max(365),
    periodEnd: z.iso.datetime(),
    tools: z
      .array(
        z
          .object({
            source: z.enum(["claude-code", "codex"]),
            costUsd: usd,
            planLabel: z.string().regex(/^[A-Za-z0-9 ().$-]{1,40}$/).nullable(),
            planUsdForPeriod: usd.nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(2),
    lines: z.array(z.object({ id: z.enum(LINE_ITEM_ORDER as [LineItemId, ...LineItemId[]]), usd }).strict()).max(7),
    totalUsd: usd,
    paidUsd: usd.nullable(),
    avoidableUsd: usd,
    idleReloads: count,
    helperAgents: count,
    helperShare: share,
    priciestSessionUsd: usd,
    priciestSessionHours: z.number().finite().nonnegative().max(24 * 366),
    widestFanout: count,
    replies: count,
    sessions: count,
    totalTokens: z.number().int().nonnegative().max(1e15),
    topModel: z.string().regex(/^[a-z0-9.\-[\]]{1,40}$/).nullable(),
    codexLimits: z
      .object({ fiveHourUsedPercent: percent.nullable(), weeklyUsedPercent: percent.nullable() })
      .strict()
      .nullable(),
    unpricedReplies: count,
    pricesAsOf: z.iso.date(),
  })
  .strict();

export type ReceiptData = z.infer<typeof receiptDataSchema>;

export type ToolInput = { source: Source; events: UsageEvent[]; plan: Plan | null };

const FIVE_HOURS_MIN = 300;
const ONE_WEEK_MIN = 7 * 24 * 60;

/** A limit snapshot is only worth printing while its window hasn't reset yet. */
function liveLimits(limits: CodexLimits | null, now: Date): ReceiptData["codexLimits"] {
  if (!limits) return null;
  const live = (w: CodexLimits["primary"], minutes: number) =>
    w && w.windowMinutes === minutes && (!w.resetsAt || w.resetsAt > now) ? w.usedPercent : null;
  const result = {
    fiveHourUsedPercent: live(limits.primary, FIVE_HOURS_MIN) ?? live(limits.secondary, FIVE_HOURS_MIN),
    weeklyUsedPercent: live(limits.secondary, ONE_WEEK_MIN) ?? live(limits.primary, ONE_WEEK_MIN),
  };
  return result.fiveHourUsedPercent === null && result.weeklyUsedPercent === null ? null : result;
}

function topModel(a: Analysis): string | null {
  let best: [string, number] | null = null;
  for (const entry of a.costByModel) if (!best || entry[1] > best[1]) best = entry;
  return best ? best[0].replace(/\[[^\]]*\]$/, "").toLowerCase() : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildReceiptData(input: {
  range: DateRange;
  tools: ToolInput[];
  codexLimits?: CodexLimits | null;
  now?: Date;
}): ReceiptData {
  const days = Math.max(1, Math.round((input.range.until.getTime() - input.range.since.getTime()) / 86_400_000));
  const tools = input.tools.filter((tool) => tool.events.length > 0);
  const all = analyze(tools.flatMap((tool) => tool.events));

  const toolRows = tools.map((tool) => ({
    source: tool.source,
    costUsd: round2(analyze(tool.events).totalCost),
    planLabel: tool.plan?.label ?? null,
    planUsdForPeriod: tool.plan?.monthlyUsd != null ? round2(planCostForDays(tool.plan.monthlyUsd, days)) : null,
  }));
  // Only claim "you paid $X" when every tool on the receipt has a known price.
  const paid = toolRows.every((row) => row.planUsdForPeriod !== null)
    ? round2(toolRows.reduce((sum, row) => sum + (row.planUsdForPeriod ?? 0), 0))
    : null;

  const priciest = all.priciestSession;
  return {
    version: 1,
    periodDays: days,
    periodEnd: input.range.until.toISOString(),
    tools: toolRows,
    lines: LINE_ITEM_ORDER.map((id) => ({ id, usd: round2(all.lineItems[id]) })).filter((line) => line.usd > 0),
    totalUsd: round2(all.totalCost),
    paidUsd: paid,
    avoidableUsd: round2(all.avoidableIdleCost),
    idleReloads: all.idleReloadCount,
    helperAgents: all.subagentThreads,
    helperShare: all.totalCost > 0 ? Math.min(1, all.subagentCost / all.totalCost) : 0,
    priciestSessionUsd: round2(priciest?.cost ?? 0),
    priciestSessionHours: priciest ? round2((priciest.endedAt.getTime() - priciest.startedAt.getTime()) / 3_600_000) : 0,
    widestFanout: all.widestFanout?.subagents ?? 0,
    replies: all.responses,
    sessions: all.sessions,
    totalTokens: all.totalTokens,
    topModel: topModel(all),
    codexLimits: liveLimits(input.codexLimits ?? null, input.now ?? new Date()),
    unpricedReplies: all.unpricedResponses,
    pricesAsOf: PRICES_AS_OF,
  };
}
