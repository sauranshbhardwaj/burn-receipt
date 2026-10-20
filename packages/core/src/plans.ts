/** Subscription plans, priced per month in USD. `null` = no fixed price we can state honestly. */
export type Plan = { id: string; label: string; monthlyUsd: number | null };

/** Source: Anthropic plan pages as cited by third-party comparisons checked 2026-10-10. */
export const CLAUDE_PLANS = {
  pro: { id: "pro", label: "Claude Pro", monthlyUsd: 20 },
  max5x: { id: "max5x", label: "Claude Max 5x", monthlyUsd: 100 },
  max20x: { id: "max20x", label: "Claude Max 20x", monthlyUsd: 200 },
  api: { id: "api", label: "Claude API (pay as you go)", monthlyUsd: null },
} as const satisfies Record<string, Plan>;

export type ClaudePlanId = keyof typeof CLAUDE_PLANS;

// Object.hasOwn, not `in`: `"toString" in obj` is true via the prototype.
export const isClaudePlanId = (value: string): value is ClaudePlanId => Object.hasOwn(CLAUDE_PLANS, value);

/**
 * Codex logs the ChatGPT plan as `plan_type`. "prolite" has no confirmed public price (only a
 * leaked $100 checkout string), so it stays null and the user is asked instead.
 */
const CODEX_PLAN_TYPES: Record<string, Plan> = {
  free: { id: "free", label: "ChatGPT Free", monthlyUsd: 0 },
  go: { id: "go", label: "ChatGPT Go", monthlyUsd: 8 },
  plus: { id: "plus", label: "ChatGPT Plus", monthlyUsd: 20 },
  prolite: { id: "prolite", label: "ChatGPT Pro Lite", monthlyUsd: null },
  pro: { id: "pro", label: "ChatGPT Pro", monthlyUsd: 200 },
};

/** Plans we don't recognize share one generic label, so a raw plan_type never reaches a receipt. */
const OTHER_CODEX_PLAN: Plan = { id: "other", label: "ChatGPT (other plan)", monthlyUsd: null };

export function codexPlanFromType(planType: string | null): Plan | null {
  if (!planType) return null;
  return (Object.hasOwn(CODEX_PLAN_TYPES, planType) ? CODEX_PLAN_TYPES[planType] : undefined) ?? OTHER_CODEX_PLAN;
}

const ALL_PLANS: Plan[] = [...Object.values(CLAUDE_PLANS), ...Object.values(CODEX_PLAN_TYPES), OTHER_CODEX_PLAN];

/** The only plan labels a shared receipt may carry. */
export const PLAN_LABELS = ALL_PLANS.map((plan) => plan.label) as [string, ...string[]];

/** Public monthly price for a plan label; null when the price is user-supplied or unknown. */
export function publicMonthlyPrice(label: string): number | null {
  return ALL_PLANS.find((plan) => plan.label === label)?.monthlyUsd ?? null;
}

const DAYS_PER_YEAR = 365;
const MONTHS_PER_YEAR = 12;

/** What a monthly plan costs, pro-rated to the receipt's period. */
export function planCostForDays(monthlyUsd: number, days: number): number {
  return (monthlyUsd * MONTHS_PER_YEAR * days) / DAYS_PER_YEAR;
}
