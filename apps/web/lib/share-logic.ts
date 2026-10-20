import { createHmac, randomBytes } from "node:crypto";
import { receiptDataSchema, valueMultiple, type ReceiptData } from "@burn-receipt/core";

/** Matches the CHECK constraint on receipts.id. */
export const RECEIPT_ID_PATTERN = /^[A-Za-z0-9_-]{10}$/;
export const RATE_LIMIT = { max: 20, windowMs: 60 * 60 * 1000 } as const;
/** Real receipts are ~1.5KB; anything much bigger is not from our CLI. */
export const MAX_BODY_BYTES = 8 * 1024;

export function newReceiptId(): string {
  // 10 base64url chars = 60 bits: unguessable enough that receipts can't be enumerated.
  return randomBytes(8).toString("base64url").slice(0, 10);
}

export function hashIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex");
}

/** First hop of x-forwarded-for is the client on Vercel; fall back to a shared bucket. */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || "unknown";
}

export type StoredReceipt = {
  id: string;
  data: ReceiptData;
  totalUsd: number;
  valueMultiple: number | null;
  avoidableUsd: number;
  ipHash: string;
};

/** Storage boundary, so the share flow can be tested without a database. */
export type ReceiptStore = {
  countSince(ipHash: string, since: Date): Promise<number>;
  insert(receipt: StoredReceipt): Promise<void>;
};

export type ShareResult =
  | { status: 201; body: { url: string; id: string } }
  | { status: 400 | 413 | 429 | 500; body: { error: string } };

export async function createShare(input: {
  rawBody: string;
  ip: string;
  secret: string;
  siteUrl: string;
  store: ReceiptStore;
  now?: Date;
}): Promise<ShareResult> {
  if (Buffer.byteLength(input.rawBody, "utf8") > MAX_BODY_BYTES) {
    return { status: 413, body: { error: "Receipt is too large." } };
  }

  let json: unknown;
  try {
    json = JSON.parse(input.rawBody);
  } catch {
    return { status: 400, body: { error: "Body must be JSON." } };
  }
  const parsed = receiptDataSchema.safeParse(json);
  if (!parsed.success) {
    return { status: 400, body: { error: "That doesn't look like a receipt from burn-receipt. Try updating: npx burn-receipt@latest" } };
  }

  const ipHash = hashIp(input.ip, input.secret);
  const now = input.now ?? new Date();
  try {
    const recent = await input.store.countSince(ipHash, new Date(now.getTime() - RATE_LIMIT.windowMs));
    if (recent >= RATE_LIMIT.max) {
      return { status: 429, body: { error: "Too many shares from your network. Try again in an hour." } };
    }

    const data = parsed.data;
    const id = newReceiptId();
    const multiple = valueMultiple(data);
    await input.store.insert({
      id,
      data,
      totalUsd: data.totalUsd,
      valueMultiple: multiple === null ? null : Math.round(multiple * 100) / 100,
      avoidableUsd: data.avoidableUsd,
      ipHash,
    });
    return { status: 201, body: { id, url: new URL(`/r/${id}`, input.siteUrl).toString() } };
  } catch {
    return { status: 500, body: { error: "Couldn't save your receipt. Please try again." } };
  }
}
