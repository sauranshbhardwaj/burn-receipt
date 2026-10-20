import {
  formatCount,
  formatDays,
  formatHours,
  formatMultiple,
  formatPercent,
  formatUsd,
  LINE_TEXT,
  periodLabel,
  plansLabel,
  toolsLabel,
  valueMultiple,
  type ReceiptData,
} from "@burn-receipt/core";

const WIDTH = 46;

// Always at least one space, so a long plan name never runs into the amount.
const row = (label: string, value: string) =>
  `  ${label}${" ".repeat(Math.max(1, WIDTH - label.length - value.length))}${value}`;

/** The terminal version of the receipt. Same wording as the image, no colors so it pastes cleanly. */
export function formatTextReceipt(data: ReceiptData): string {
  const out: string[] = [];
  out.push("", `  BURN RECEIPT — ${toolsLabel(data)}`, `  ${periodLabel(data)} (last ${formatDays(data.periodDays)})`, `  ${"-".repeat(WIDTH)}`);
  for (const line of [...data.lines].sort((a, b) => b.usd - a.usd)) {
    out.push(row(LINE_TEXT[line.id].label, formatUsd(line.usd)));
  }
  out.push(`  ${"=".repeat(WIDTH)}`, row("TOTAL (API value)", formatUsd(data.totalUsd)));

  const multiple = valueMultiple(data);
  if (data.paidUsd !== null) out.push(row(`YOU PAID (${plansLabel(data) ?? "plans"})`, formatUsd(data.paidUsd)));
  if (multiple !== null) out.push("", `  > ${formatMultiple(multiple)} your money's worth`);

  if (data.avoidableUsd >= 1) {
    out.push(`  ! ${formatUsd(data.avoidableUsd)} was avoidable (${formatCount(data.idleReloads)} reloads after 5+ min pauses)`);
  }
  if (data.helperAgents > 0) {
    out.push(`  » ${formatCount(data.helperAgents)} helper agents, ${formatPercent(data.helperShare)} of the bill`);
  }
  if (data.priciestSessionUsd > 0) {
    out.push(`  » Priciest session: ${formatUsd(data.priciestSessionUsd)} over ${formatHours(data.priciestSessionHours)}`);
  }
  if (data.codexLimits?.weeklyUsedPercent != null) {
    out.push(`  » Codex weekly limit: ${Math.round(data.codexLimits.weeklyUsedPercent)}% used`);
  }
  if (data.unpricedReplies > 0) {
    out.push(`  · ${formatCount(data.unpricedReplies)} replies from models without a public price weren't counted`);
  }
  out.push("", `  API-equivalent estimate at list prices as of ${data.pricesAsOf}. Not a bill.`, "");
  return out.join("\n");
}
