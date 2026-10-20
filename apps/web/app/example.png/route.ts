import { RECEIPT_SIZE, receiptTree } from "@burn-receipt/core";
import { EXAMPLE_RECEIPT } from "@/lib/example";
import { renderImage } from "@/lib/images";

export async function GET() {
  return renderImage(receiptTree(EXAMPLE_RECEIPT), RECEIPT_SIZE);
}
