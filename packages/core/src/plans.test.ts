import { describe, expect, it } from "vitest";
import { codexPlanFromType, isClaudePlanId, planCostForDays } from "./plans";

describe("plans", () => {
  it("pro-rates a monthly price to a period", () => {
    expect(planCostForDays(200, 365)).toBeCloseTo(2400, 10);
    expect(planCostForDays(200, 7)).toBeCloseTo(46.03, 2);
  });

  it("maps Codex plan types, keeping unconfirmed prices null", () => {
    expect(codexPlanFromType("plus")?.monthlyUsd).toBe(20);
    expect(codexPlanFromType("prolite")?.monthlyUsd).toBeNull();
    // Unknown plan types never echo the raw value onto a receipt.
    expect(codexPlanFromType("enterprise_acme_corp")).toEqual({ id: "other", label: "ChatGPT (other plan)", monthlyUsd: null });
    expect(codexPlanFromType(null)).toBeNull();
  });

  it("validates Claude plan ids", () => {
    expect(isClaudePlanId("max20x")).toBe(true);
    expect(isClaudePlanId("max100x")).toBe(false);
    expect(isClaudePlanId("toString")).toBe(false);
  });
});
