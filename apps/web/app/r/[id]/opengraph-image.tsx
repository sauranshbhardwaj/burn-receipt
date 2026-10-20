import { CARD_SIZE, cardTree } from "@burn-receipt/core";
import { renderImage } from "@/lib/images";
import { getReceipt } from "@/lib/receipts";

export const alt = "A Burn Receipt: where an AI coding plan's money really went";
export const size = CARD_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getReceipt(id);
  if (!data) return new Response("Receipt not found", { status: 404 });
  return renderImage(cardTree(data), CARD_SIZE);
}
