import { parseArgs } from "node:util";
import { CLAUDE_PLANS, isClaudePlanId, type ClaudePlanId } from "@burn-receipt/core";

export type Options = {
  days: number;
  claudePlan: ClaudePlanId | null;
  codexPlanPriceUsd: number | null;
  out: string | null;
  image: boolean;
  share: boolean;
  json: boolean;
  help: boolean;
};

export class UsageError extends Error {}

export const HELP = `burn-receipt — see where your AI coding plan really burned, as a receipt.

Usage: npx burn-receipt [options]

Options:
  --days <n>               How many days back to look (default 7, max 365)
  --claude-plan <plan>     ${Object.keys(CLAUDE_PLANS).join(" | ")} (remembered after the first run)
  --codex-plan-price <usd> Monthly price of your ChatGPT plan, if we can't detect it
  --out <file.png>         Where to save the receipt image
  --no-image               Print the receipt only, don't save an image
  --share                  Upload the receipt's numbers (never your chats) and get a share link
  --json                   Print the receipt data as JSON
  -h, --help               Show this help

Everything is read locally from ~/.claude and ~/.codex. Nothing leaves your machine unless you --share.`;

export function parseOptions(argv: string[]): Options {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      allowNegative: true,
      options: {
        days: { type: "string", default: "7" },
        "claude-plan": { type: "string" },
        "codex-plan-price": { type: "string" },
        out: { type: "string" },
        image: { type: "boolean", default: true },
        share: { type: "boolean", default: false },
        json: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }

  const days = Number(values.days);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new UsageError(`--days must be a whole number between 1 and 365 (got "${values.days}").`);
  }

  const plan = values["claude-plan"];
  if (plan !== undefined && !isClaudePlanId(plan)) {
    throw new UsageError(`--claude-plan must be one of: ${Object.keys(CLAUDE_PLANS).join(", ")} (got "${plan}").`);
  }

  const rawPrice = values["codex-plan-price"];
  const price = rawPrice === undefined ? null : Number(rawPrice.replace(/^\$/, ""));
  if (price !== null && (!Number.isFinite(price) || price < 0 || price > 10_000)) {
    throw new UsageError(`--codex-plan-price must be a monthly price in USD, like 100 (got "${rawPrice}").`);
  }

  const out = values.out ?? null;
  if (out !== null && !out.toLowerCase().endsWith(".png")) {
    throw new UsageError(`--out must end in .png (got "${out}").`);
  }

  return {
    days,
    claudePlan: plan ?? null,
    codexPlanPriceUsd: price,
    out,
    image: values.image ?? true,
    share: values.share ?? false,
    json: values.json ?? false,
    help: values.help ?? false,
  };
}
