import { z } from "zod";
import { analyze, LINE_ITEM_ORDER, type Analysis, type LineItemId } from "./analyze";
import { PLAN_LABELS, planCostForDays, publicMonthlyPrice, type Plan } from "./plans";
import { canonicalModelId, PRICED_MODEL_IDS, PRICES_AS_OF } from "./pricing";
import type { CodexLimits } from "./sources/codex";
import type { DateRange, Source, UsageEvent } from "./types";

/**
 * Everything a receipt shows — and the only thing that ever leaves the user's machine when they
 * share. Numbers and enums only: no prompts, file paths, project names or session ids. The
 * schema is strict so the share API can reject anything else.
 */
const usd = z.number().finite().nonnegative().max(10_000_000);
const MAX_PLAUSIBLE_USD_PER_DAY = 5_000;
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
            planLabel: z.enum(PLAN_LABELS).nullable(),
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
    topModel: z.enum(PRICED_MODEL_IDS).nullable(),
    codexLimits: z
      .object({ fiveHourUsedPercent: percent.nullable(), weeklyUsedPercent: percent.nullable() })
      .strict()
      .nullable(),
    unpricedReplies: count,
    pricesAsOf: z.iso.date(),
  })
  .strict()
  .superRefine((data, ctx) => {
    // Receipts from the CLI always add up (amounts are rounded to cents, so allow rounding slack).
    // This turns away hand-crafted numbers sent straight to the share API.
    const slack = (total: number) => Math.max(0.05 * 7, total * 0.001);
    const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
    if (Math.abs(sum(data.lines.map((l) => l.usd)) - data.totalUsd) > slack(data.totalUsd)) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: "Line items must add up to the total." });
    }
    if (Math.abs(sum(data.tools.map((t) => t.costUsd)) - data.totalUsd) > slack(data.totalUsd)) {
      ctx.addIssue({ code: "custom", path: ["tools"], message: "Tool costs must add up to the total." });
    }
    if (data.avoidableUsd > data.totalUsd) {
      ctx.addIssue({ code: "custom", path: ["avoidableUsd"], message: "Avoidable spend can't exceed the total." });
    }
    if (new Set(data.lines.map((l) => l.id)).size !== data.lines.length) {
      ctx.addIssue({ code: "custom", path: ["lines"], message: "Each line item may appear once." });
    }
    if (new Set(data.tools.map((t) => t.source)).size !== data.tools.length) {
      ctx.addIssue({ code: "custom", path: ["tools"], message: "Each tool may appear once." });
    }
    if (data.priciestSessionUsd > data.totalUsd + slack(data.totalUsd)) {
      ctx.addIssue({ code: "custom", path: ["priciestSessionUsd"], message: "A session can't cost more than the total." });
    }
    // Far above the heaviest real usage we've seen (~$300/day); keeps fantasy numbers off the board.
    if (data.totalUsd > MAX_PLAUSIBLE_USD_PER_DAY * data.periodDays) {
      ctx.addIssue({ code: "custom", path: ["totalUsd"], message: "That's more than any real plan could burn." });
    }
    data.tools.forEach((tool, i) => {
      const monthly = tool.planLabel === null ? null : publicMonthlyPrice(tool.planLabel);
      if (monthly === null || tool.planUsdForPeriod === null) return;
      // A tool is billed for 1..periodDays days, depending on when its history starts.
      const min = planCostForDays(monthly, 1) - 0.01;
      const max = planCostForDays(monthly, data.periodDays) + 0.01;
      if (tool.planUsdForPeriod < min || tool.planUsdForPeriod > max) {
        ctx.addIssue({ code: "custom", path: ["tools", i, "planUsdForPeriod"], message: "Plan cost doesn't match the plan's price." });
      }
    });
    const planTotal = data.tools.reduce((sum, t) => sum + (t.planUsdForPeriod ?? 0), 0);
    if (data.paidUsd !== null && Math.abs(data.paidUsd - planTotal) > 0.05) {
      ctx.addIssue({ code: "custom", path: ["paidUsd"], message: "Paid must equal the plans' cost." });
    }
  });

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
  return best ? canonicalModelId(best[0]) : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * True when every plan on the receipt has a public price, so "x your money's worth" can't be
 * inflated by a typed-in price. Only these receipts compete on the value board.
 */
export function hasPublicPlanPrices(data: ReceiptData): boolean {
  return data.paidUsd !== null && data.tools.every((t) => t.planLabel !== null && publicMonthlyPrice(t.planLabel) !== null);
}
const DAY_MS = 86_400_000;

/** Whole days from the later of (range start, first usage) to the range end; at least 1. */
function coveredDays(range: DateRange, firstEvent: Date | null): number {
  const start = firstEvent && firstEvent > range.since ? firstEvent : range.since;
  return Math.min(365, Math.max(1, Math.ceil((range.until.getTime() - start.getTime()) / DAY_MS)));
}

export function buildReceiptData(input: {
  range: DateRange;
  tools: ToolInput[];
  codexLimits?: CodexLimits | null;
  now?: Date;
}): ReceiptData {
  const tools = input.tools.filter((tool) => tool.events.length > 0);
  const all = analyze(tools.flatMap((tool) => tool.events));
  // Only count days that have history: someone who started 3 weeks ago and asks for --days 365
  // didn't pay for a year of plan, so "you paid" must not say they did.
  const days = coveredDays(input.range, all.firstEvent);

  const toolRows = tools.map((tool) => {
    const toolAnalysis = analyze(tool.events);
    const monthly = tool.plan?.monthlyUsd;
    return {
      source: tool.source,
      costUsd: round2(toolAnalysis.totalCost),
      planLabel: tool.plan?.label ?? null,
      planUsdForPeriod:
        monthly != null ? round2(planCostForDays(monthly, coveredDays(input.range, toolAnalysis.firstEvent))) : null,
    };
  });
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
