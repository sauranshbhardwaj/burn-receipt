import { z } from "zod";
import type { ReceiptData } from "@burn-receipt/core";

/** Overridable for local development of the web app. */
export const SHARE_API_URL = process.env.BURN_RECEIPT_API_URL?.trim() || "https://burnreceipt.dev";
const TIMEOUT_MS = 15_000;

const responseSchema = z.object({ url: z.url() });

export class ShareError extends Error {}

/** Uploads only the ReceiptData numbers (already stripped of anything identifying) and returns a link. */
export async function shareReceipt(data: ReceiptData, baseUrl: string = SHARE_API_URL): Promise<string> {
  let response: Response;
  try {
    response = await fetch(new URL("/api/receipts", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ShareError("Couldn't reach the share server. Check your connection and try again — your image is still saved locally.");
  }

  if (response.status === 429) throw new ShareError("Too many shares from your network right now. Try again in a few minutes.");
  if (!response.ok) throw new ShareError(`The share server said no (HTTP ${response.status}). Your image is still saved locally.`);

  const parsed = responseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new ShareError("The share server sent back something unexpected. Your image is still saved locally.");
  return parsed.data.url;
}
