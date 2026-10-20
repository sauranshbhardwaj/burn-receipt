import { CARD_SIZE, cardTree } from "@burn-receipt/core";
import { EXAMPLE_RECEIPT } from "@/lib/example";
import { renderImage } from "@/lib/images";

export const alt = "An example Burn Receipt: where an AI coding plan's money really went";
export const size = CARD_SIZE;
export const contentType = "image/png";

// The site's own link preview. Labeled as an example so nobody mistakes the numbers for a real receipt.
export default function Image() {
  return renderImage(cardTree(EXAMPLE_RECEIPT, { title: "burn-receipt — example receipt (made-up numbers)" }), CARD_SIZE);
}
