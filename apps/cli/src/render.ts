import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import {
  CARD_SIZE,
  cardTree,
  RECEIPT_FONT_FAMILY,
  RECEIPT_SIZE,
  receiptTree,
  type ReceiptData,
  type ReceiptNode,
} from "@burn-receipt/core";

const here = dirname(fileURLToPath(import.meta.url));

/** Fonts ship next to the bundle (dist/fonts); in dev they live in the core package. */
function fontsDir(): string {
  const candidates = [join(here, "fonts"), join(here, "../../../packages/core/assets/fonts")];
  const found = candidates.find((dir) => existsSync(join(dir, "JetBrainsMono-Regular.ttf")));
  if (!found) throw new Error("Receipt fonts are missing from this install. Try reinstalling burn-receipt.");
  return found;
}

async function renderTreePng(tree: ReceiptNode, size: { width: number; height: number }): Promise<Buffer> {
  const dir = fontsDir();
  const [regular, bold] = await Promise.all([
    readFile(join(dir, "JetBrainsMono-Regular.ttf")),
    readFile(join(dir, "JetBrainsMono-Bold.ttf")),
  ]);
  // satori's types expect a ReactNode; our tree has the same {type, props} shape without React.
  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], {
    ...size,
    fonts: [
      { name: RECEIPT_FONT_FAMILY, data: regular, weight: 400, style: "normal" },
      { name: RECEIPT_FONT_FAMILY, data: bold, weight: 700, style: "normal" },
    ],
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: size.width } }).render().asPng();
}

/** The tall 4:5 receipt people post as an image. */
export const renderReceiptPng = (data: ReceiptData) => renderTreePng(receiptTree(data), RECEIPT_SIZE);

/** The 1200×630 link-preview card. */
export const renderCardPng = (data: ReceiptData) => renderTreePng(cardTree(data), CARD_SIZE);
