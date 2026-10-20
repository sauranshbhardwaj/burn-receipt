import { createInterface } from "node:readline/promises";
import { CLAUDE_PLANS, type ClaudePlanId } from "@burn-receipt/core";

const PLAN_CHOICES = Object.values(CLAUDE_PLANS);

/** Prompts only make sense when a human is at the keyboard; piped/CI runs skip them. */
export const canPrompt = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

export async function askClaudePlan(): Promise<ClaudePlanId | null> {
  const menu = PLAN_CHOICES.map(
    (plan, i) => `  ${i + 1}) ${plan.label}${plan.monthlyUsd !== null ? ` — $${plan.monthlyUsd}/mo` : ""}`,
  ).join("\n");
  for (let attempt = 0; attempt < 3; attempt++) {
    const answer = await ask(`\nWhich Claude plan are you on? (asked once, remembered)\n${menu}\n> `);
    if (answer === "") return null;
    const choice = PLAN_CHOICES[Number(answer) - 1];
    if (choice) return choice.id;
    console.log(`  Please type a number from 1 to ${PLAN_CHOICES.length}, or press Enter to skip.`);
  }
  return null;
}

export async function askMonthlyPrice(planLabel: string): Promise<number | null> {
  const answer = await ask(`\nWhat do you pay per month for ${planLabel}? (USD, Enter to skip)\n> $`);
  const price = Number(answer.replace(/^\$/, ""));
  return answer !== "" && Number.isFinite(price) && price >= 0 && price <= 10_000 ? price : null;
}
