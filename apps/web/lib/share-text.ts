import { formatDays, formatMultiple, formatUsd, toolsLabel, valueMultiple, type ReceiptData } from "@burn-receipt/core";

/** The one-liner that goes into the X / Reddit share — leads with the most striking true number. */
export function shareHeadline(data: ReceiptData): string {
  const multiple = valueMultiple(data);
  const period = data.periodDays === 7 ? "this week" : data.periodDays === 30 ? "this month" : `in ${formatDays(data.periodDays)}`;
  const parts = [
    multiple !== null && data.paidUsd !== null
      ? `My ${toolsLabel(data)} plan burned ${formatUsd(data.totalUsd)} of API value ${period} — ${formatMultiple(multiple)} what I paid (${formatUsd(data.paidUsd)}).`
      : `My ${toolsLabel(data)} usage was worth ${formatUsd(data.totalUsd)} at API prices ${period}.`,
  ];
  if (data.avoidableUsd >= 1) parts.push(`${formatUsd(data.avoidableUsd)} of it was avoidable.`);
  return parts.join(" ");
}

export function xShareUrl(data: ReceiptData, pageUrl: string): string {
  const text = `${shareHeadline(data)}\n\nGet your own receipt: npx burn-receipt`;
  return `https://x.com/intent/post?${new URLSearchParams({ text, url: pageUrl })}`;
}

export function redditShareUrl(data: ReceiptData, pageUrl: string): string {
  return `https://www.reddit.com/submit?${new URLSearchParams({ url: pageUrl, title: shareHeadline(data) })}`;
}
