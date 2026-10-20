import { RECEIPT_SIZE, receiptTree } from "@burn-receipt/core";
import { renderImage } from "@/lib/images";
import { getReceipt } from "@/lib/receipts";

/** The full 4:5 receipt image — what people download or embed. */
export async function GET(_request: Request, ctx: RouteContext<"/r/[id]/receipt.png">) {
  const { id } = await ctx.params;
  const data = await getReceipt(id);
  if (!data) return new Response("Receipt not found", { status: 404 });
  return renderImage(receiptTree(data), RECEIPT_SIZE);
}
