import { describe, expect, it } from "vitest";
import type { ReceiptData } from "../receipt-data";
import { formatHours, formatMultiple, formatTokens, formatUsd, periodLabel } from "./format";

const period = (periodDays: number, periodEnd: string) => ({ periodDays, periodEnd }) as ReceiptData;

describe("format", () => {
  it("shows cents only for small amounts", () => {
    expect(formatUsd(7259.18)).toBe("$7,259");
    expect(formatUsd(46.03)).toBe("$46.03");
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("labels periods within a year and across New Year", () => {
    expect(periodLabel(period(7, "2026-10-20T05:00:00Z"))).toBe("Oct 13 – Oct 20, 2026");
    expect(periodLabel(period(365, "2026-10-20T05:00:00Z"))).toBe("Oct 20, 2025 – Oct 20, 2026");
  });

  it("formats multiples and durations readably", () => {
    expect(formatMultiple(33.45)).toBe("33x");
    expect(formatMultiple(8.94)).toBe("8.9x");
    expect(formatHours(0.2)).toBe("12 min");
    expect(formatHours(42.3)).toBe("42.3h");
    expect(formatHours(436)).toBe("18 days");
  });

  it("compacts token counts", () => {
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(900_000)).toBe("900K");
    expect(formatTokens(1_620_000_000)).toBe("1.6B");
    expect(formatTokens(250_000_000)).toBe("250M");
  });
});
