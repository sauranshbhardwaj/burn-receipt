import type { ReceiptData } from "../receipt-data";
import {
  formatCount,
  formatHours,
  formatMultiple,
  formatPercent,
  formatTokens,
  formatUsd,
  LINE_TEXT,
  periodLabel,
  plansLabel,
  toolsLabel,
  valueMultiple,
} from "./format";

/**
 * A tiny element tree in the shape satori (and next/og) understands, built without React so
 * the CLI doesn't need it. The same tree renders the PNG locally and the preview card on the web.
 */
export type ReceiptNode = { type: string; props: { style?: Style; children?: Child | Child[] } };
type Child = ReceiptNode | string | null;
type Style = Record<string, string | number>;

const h = (type: string, style: Style, ...children: Child[]): ReceiptNode => ({
  type,
  props: { style: { display: "flex", ...style }, children: children.filter((c) => c !== null) },
});

export const RECEIPT_FONT_FAMILY = "JetBrains Mono";
export const RECEIPT_SIZE = { width: 1080, height: 1350 } as const;
export const CARD_SIZE = { width: 1200, height: 630 } as const;
const PAGE_MARGIN = 36;
/** How many callouts fit the 4:5 canvas without clipping, given how many line items are shown. */
const maxCallouts = (lineCount: number) => (lineCount >= 7 ? 2 : 3);
/** At or below this many lines + callouts, the receipt gets a stats block to fill the space. */
const SPARSE_CONTENT = 5;

const C = {
  page: "#07090d",
  window: "#0d1117",
  bar: "#161b22",
  border: "#262c36",
  text: "#e6edf3",
  muted: "#7d8590",
  dim: "#3d444d",
  green: "#3fb950",
  amber: "#f0b429",
  red: "#ff6b5e",
  blue: "#58a6ff",
  track: "#1c2129",
};

function titleBar(title: string): ReceiptNode {
  const dot = (color: string) => h("div", { width: 18, height: 18, borderRadius: 9, background: color, marginRight: 10 });
  return h(
    "div",
    { alignItems: "center", padding: "18px 26px", background: C.bar, borderBottom: `2px solid ${C.border}` },
    dot("#ff5f57"),
    dot("#febc2e"),
    dot("#28c840"),
    h("div", { marginLeft: 18, color: C.muted, fontSize: 22 }, title),
  );
}

/** Deterministic pseudo-barcode from the receipt's numbers, so each receipt looks unique. */
function barcode(seed: number, width: number): ReceiptNode {
  const bars: ReceiptNode[] = [];
  let x = Math.floor(seed * 1000) % 2147483647 || 7;
  let used = 0;
  while (used < width) {
    x = (x * 48271) % 2147483647;
    const barWidth = 2 + (x % 5);
    const gap = 2 + ((x >> 3) % 4);
    bars.push(h("div", { width: barWidth, height: 44, background: C.dim, marginRight: gap }));
    used += barWidth + gap;
  }
  return h("div", { overflow: "hidden", width }, ...bars);
}

/** Bar scaled to the biggest line; idle reloads in red because they're the avoidable part. */
function costBar(line: ReceiptData["lines"][number], maxUsd: number, width: number): ReceiptNode {
  return h(
    "div",
    { width, height: 14, background: C.track, marginRight: 22, borderRadius: 3 },
    h("div", {
      width: Math.max(4, Math.round((line.usd / maxUsd) * width)),
      height: 14,
      borderRadius: 3,
      background: line.id === "idleReloads" ? C.red : C.amber,
    }),
  );
}

function divider(style: "dashed" | "double", marginTop: number): ReceiptNode {
  // A "double" border is drawn as two solid lines: next/og's bundled satori can't parse `double`.
  const border: Style =
    style === "double"
      ? { height: 6, borderTop: `2px solid ${C.dim}`, borderBottom: `2px solid ${C.dim}` }
      : { borderTop: `2px dashed ${C.dim}` };
  return h("div", { width: "100%", ...border, marginTop, marginBottom: 18 });
}

function callout(mark: string, color: string, headline: string, detail: string): ReceiptNode {
  return h(
    "div",
    { flexDirection: "column", marginTop: 14 },
    h("div", { fontSize: 27, fontWeight: 700, color }, `${mark} ${headline}`),
    h("div", { fontSize: 19, color: C.muted, marginLeft: 34, marginTop: 2 }, detail),
  );
}

/** JetBrains Mono glyphs are 0.6em wide, so text width is predictable without measuring. */
const MONO_ADVANCE = 0.6;
const textWidth = (text: string, fontSize: number) => Math.ceil(text.length * fontSize * MONO_ADVANCE);

/** Small facts that fill the space on light-usage receipts instead of leaving a void. */
function statsBlock(data: ReceiptData): ReceiptNode {
  const rows: [string, string][] = [
    ["replies", formatCount(data.replies)],
    ["sessions", formatCount(data.sessions)],
    ["tokens", formatTokens(data.totalTokens)],
  ];
  if (data.topModel) rows.push(["top model", data.topModel]);
  return h(
    "div",
    { flexDirection: "column", marginTop: 22, padding: "16px 20px", border: `2px solid ${C.border}`, borderRadius: 10 },
    ...rows.map(([label, value]) =>
      h("div", { justifyContent: "space-between", fontSize: 22, marginBottom: 6 }, h("div", { color: C.muted }, label), h("div", { color: C.text }, value)),
    ),
  );
}

function footnotes(data: ReceiptData): ReceiptNode[] {
  const notes: string[] = [];
  if (data.paidUsd === null) notes.push("add --claude-plan or --codex-plan-price to see your money's worth");
  if (data.unpricedReplies > 0) notes.push(`${formatCount(data.unpricedReplies)} replies from models without a public price weren't counted`);
  return notes.map((note) => h("div", { fontSize: 19, color: C.muted, marginTop: 12 }, `· ${note}`));
}

export function receiptTree(data: ReceiptData): ReceiptNode {
  const multiple = valueMultiple(data);
  const plans = plansLabel(data);
  const maxLine = Math.max(...data.lines.map((l) => l.usd), 0.01);
  const sortedLines = [...data.lines].sort((a, b) => b.usd - a.usd);
  // Size the amount column to the longest amount so "$1,500,000" never collides with its bar.
  const amountWidth = Math.max(140, ...sortedLines.map((l) => textWidth(formatUsd(l.usd), 26) + 8));
  const barWidth = Math.max(70, 150 - (amountWidth - 140));

  const lineRows = sortedLines.map((line) =>
    h(
      "div",
      { flexDirection: "column", marginBottom: 12 },
      h(
        "div",
        { alignItems: "center", justifyContent: "space-between" },
        h("div", { fontSize: 26, color: C.text }, LINE_TEXT[line.id].label),
        h(
          "div",
          { alignItems: "center" },
          costBar(line, maxLine, barWidth),
          h("div", { fontSize: 26, fontWeight: 700, color: C.text, width: amountWidth, justifyContent: "flex-end" }, formatUsd(line.usd)),
        ),
      ),
      h("div", { fontSize: 18, color: C.muted, marginTop: 2 }, LINE_TEXT[line.id].hint),
    ),
  );

  const callouts: ReceiptNode[] = [];
  if (data.avoidableUsd >= 1) {
    callouts.push(
      callout("!", C.red, `${formatUsd(data.avoidableUsd)} was avoidable`, `${formatCount(data.idleReloads)} reloads after pauses — /clear before you step away`),
    );
  }
  if (data.helperAgents > 0) {
    callouts.push(
      callout(
        "»",
        C.blue,
        `${formatCount(data.helperAgents)} helper agents · ${formatPercent(data.helperShare)} of the bill`,
        data.widestFanout > 1 ? `biggest swarm: ${formatCount(data.widestFanout)} in one session` : "agents your agent spawned on its own",
      ),
    );
  }
  if (data.priciestSessionUsd > 0) {
    callouts.push(
      callout("»", C.blue, `priciest session ${formatUsd(data.priciestSessionUsd)}`, `ran for ${formatHours(data.priciestSessionHours)}`),
    );
  }
  if (data.codexLimits?.weeklyUsedPercent != null) {
    callouts.push(callout("»", C.blue, `Codex weekly limit ${Math.round(data.codexLimits.weeklyUsedPercent)}% used`, "as of your last Codex session"));
  }

  return h(
    "div",
    {
      width: RECEIPT_SIZE.width,
      height: RECEIPT_SIZE.height,
      background: C.page,
      alignItems: "center",
      justifyContent: "center",
      fontFamily: RECEIPT_FONT_FAMILY,
    },
    h(
      "div",
      {
        flexDirection: "column",
        width: RECEIPT_SIZE.width - 2 * PAGE_MARGIN,
        height: RECEIPT_SIZE.height - 2 * PAGE_MARGIN,
        background: C.window,
        border: `2px solid ${C.border}`,
        borderRadius: 18,
        overflow: "hidden",
      },
      titleBar(`burn-receipt — last ${data.periodDays} days`),
      h(
        "div",
        { flexDirection: "column", padding: "26px 44px 0 44px", flexGrow: 1 },
        h("div", { fontSize: 22, color: C.green }, `$ npx burn-receipt --days ${data.periodDays}`),
        h("div", { fontSize: 48, fontWeight: 700, color: C.amber, marginTop: 16, letterSpacing: 4 }, "BURN RECEIPT"),
        h("div", { fontSize: 21, color: C.muted, marginTop: 4 }, `${toolsLabel(data)}  ·  ${periodLabel(data)}`),
        divider("dashed", 18),
        ...lineRows,
        divider("double", 6),
        h(
          "div",
          { justifyContent: "space-between", alignItems: "baseline" },
          h("div", { fontSize: 32, fontWeight: 700, color: C.text }, "TOTAL (API value)"),
          h("div", { fontSize: 44, fontWeight: 700, color: C.amber }, formatUsd(data.totalUsd)),
        ),
        data.paidUsd !== null
          ? h(
              "div",
              { justifyContent: "space-between", alignItems: "baseline", marginTop: 6 },
              h("div", { fontSize: 23, color: C.muted }, `YOU PAID${plans ? ` (${plans})` : ""}`),
              h("div", { fontSize: 28, color: C.text }, formatUsd(data.paidUsd)),
            )
          : null,
        multiple !== null
          ? h("div", { fontSize: 38, fontWeight: 700, color: C.green, marginTop: 12 }, `> ${formatMultiple(multiple)} your money's worth`)
          : null,
        ...callouts.slice(0, maxCallouts(sortedLines.length)),
        // Light receipts have room to spare: show the stats rather than a big empty window.
        sortedLines.length + callouts.length <= SPARSE_CONTENT ? statsBlock(data) : null,
        ...(sortedLines.length + callouts.length <= SPARSE_CONTENT + 2 ? footnotes(data) : []),
      ),
      h(
        "div",
        { flexDirection: "column", alignItems: "center", padding: "0 44px 26px 44px" },
        barcode(data.totalUsd + data.replies, 600),
        h("div", { fontSize: 17, color: C.muted, marginTop: 10 }, `API-equivalent estimate at list prices as of ${data.pricesAsOf} · not a bill`),
        h("div", { fontSize: 22, color: C.green, marginTop: 6 }, "get yours → npx burn-receipt"),
      ),
    ),
  );
}

/** Number of line items the 1200×630 preview card has room for. */
const CARD_LINES = 4;

/** The link-preview card (Open Graph / X): the headline numbers big, top costs on the right. */
export function cardTree(data: ReceiptData): ReceiptNode {
  const multiple = valueMultiple(data);
  const topLines = [...data.lines].sort((a, b) => b.usd - a.usd).slice(0, CARD_LINES);
  const maxLine = Math.max(...topLines.map((l) => l.usd), 0.01);

  return h(
    "div",
    {
      width: CARD_SIZE.width,
      height: CARD_SIZE.height,
      background: C.page,
      alignItems: "center",
      justifyContent: "center",
      fontFamily: RECEIPT_FONT_FAMILY,
    },
    h(
      "div",
      {
        flexDirection: "column",
        width: CARD_SIZE.width - 48,
        height: CARD_SIZE.height - 48,
        background: C.window,
        border: `2px solid ${C.border}`,
        borderRadius: 18,
        overflow: "hidden",
      },
      titleBar(`burn-receipt — ${toolsLabel(data)} — last ${data.periodDays} days`),
      h(
        "div",
        { flexGrow: 1, padding: "28px 40px 0 40px" },
        h(
          "div",
          { flexDirection: "column", width: 520 },
          h("div", { fontSize: 30, fontWeight: 700, color: C.amber, letterSpacing: 3 }, "BURN RECEIPT"),
          // Shrink very large totals so they never spill into the right column.
          h("div", { fontSize: Math.min(92, Math.floor(510 / (formatUsd(data.totalUsd).length * MONO_ADVANCE))), fontWeight: 700, color: C.amber, marginTop: 10 }, formatUsd(data.totalUsd)),
          h(
            "div",
            { fontSize: 28, color: C.text, marginTop: 2 },
            data.paidUsd !== null ? `of AI for ${formatUsd(data.paidUsd)}` : "of AI, at API prices",
          ),
          multiple !== null
            ? h("div", { fontSize: 32, fontWeight: 700, color: C.green, marginTop: 22 }, `> ${formatMultiple(multiple)} your money's worth`)
            : null,
          data.avoidableUsd >= 1
            ? h("div", { fontSize: 28, fontWeight: 700, color: C.red, marginTop: 14 }, `! ${formatUsd(data.avoidableUsd)} was avoidable`)
            : null,
        ),
        h(
          "div",
          { flexDirection: "column", flexGrow: 1, marginLeft: 30, paddingTop: 14 },
          h("div", { fontSize: 20, color: C.muted, marginBottom: 18 }, "WHERE IT WENT"),
          ...topLines.map((line) =>
            h(
              "div",
              { flexDirection: "column", marginBottom: 20 },
              h(
                "div",
                { justifyContent: "space-between" },
                h("div", { fontSize: 23, color: C.text }, LINE_TEXT[line.id].label),
                h("div", { fontSize: 23, fontWeight: 700, color: C.text }, formatUsd(line.usd)),
              ),
              h("div", { marginTop: 8 }, costBar(line, maxLine, 520)),
            ),
          ),
        ),
      ),
      h(
        "div",
        { justifyContent: "space-between", alignItems: "center", padding: "0 40px 24px 40px" },
        h("div", { fontSize: 22, color: C.green }, "get yours → npx burn-receipt"),
        h("div", { fontSize: 17, color: C.muted }, `API-equivalent estimate · prices as of ${data.pricesAsOf}`),
      ),
    ),
  );
}
