import type { LineItemId } from "../analyze";
import type { ReceiptData } from "../receipt-data";

/** One wording for the terminal, the image and the web page. */
export const LINE_TEXT: Record<LineItemId, { label: string; hint: string }> = {
  rereading: { label: "Re-reading the chat", hint: "every turn re-sends the whole conversation" },
  newContext: { label: "New context", hint: "files, tool output and your messages" },
  writing: { label: "Writing code & replies", hint: "what it actually produced" },
  thinking: { label: "Thinking", hint: "hidden reasoning before it answers" },
  startup: { label: "Start-up costs", hint: "system prompt, tools & CLAUDE.md, per chat and per helper" },
  idleReloads: { label: "Reloads after pauses", hint: "memory expired after a 5+ min pause, reloaded at full price" },
  webSearch: { label: "Web searches", hint: "$10 per 1,000 searches" },
};

const TOOL_NAMES = { "claude-code": "Claude Code", codex: "Codex" } as const;

/** "$7,193" for big amounts, "$46.03" for small ones — cents only where they matter. */
export function formatUsd(amount: number): string {
  const digits = amount >= 100 ? 0 : 2;
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatPercent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours / 24)} days`;
}

/** "Claude Code + Codex" */
export function toolsLabel(data: ReceiptData): string {
  return data.tools.map((t) => TOOL_NAMES[t.source]).join(" + ");
}

/** "Claude Max 20x + ChatGPT Plus", or null when no plan is known. */
export function plansLabel(data: ReceiptData): string | null {
  const labels = data.tools.map((t) => t.planLabel).filter((l): l is string => l !== null);
  return labels.length > 0 ? labels.join(" + ") : null;
}

/** "Oct 13 – Oct 20, 2026", in UTC so the CLI image and the web image always agree. */
export function periodLabel(data: ReceiptData): string {
  const end = new Date(data.periodEnd);
  const start = new Date(end.getTime() - data.periodDays * 86_400_000);
  const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${day(start)} – ${day(end)}, ${end.getUTCFullYear()}`;
}

/** How many times over the plan paid for itself, e.g. 32.7. Null when we don't know what was paid. */
export function valueMultiple(data: ReceiptData): number | null {
  if (data.paidUsd === null || data.paidUsd <= 0) return null;
  return data.totalUsd / data.paidUsd;
}

export function formatMultiple(multiple: number): string {
  return multiple >= 10 ? `${Math.round(multiple)}x` : `${multiple.toFixed(1)}x`;
}
