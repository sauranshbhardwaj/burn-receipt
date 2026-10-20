import { createHmac, randomBytes } from "node:crypto";
import { isIPv6 } from "node:net";
import { hasPublicPlanPrices, receiptDataSchema, valueMultiple, type ReceiptData } from "@burn-receipt/core";

/** Matches the CHECK constraint on receipts.id. */
export const RECEIPT_ID_PATTERN = /^[A-Za-z0-9_-]{10}$/;
export const RATE_LIMIT = { max: 20, windowMs: 60 * 60 * 1000 } as const;
/** Real receipts are ~1.5KB; anything much bigger is not from our CLI. */
export const MAX_BODY_BYTES = 8 * 1024;

export function newReceiptId(): string {
  // 10 base64url chars = 60 bits: unguessable enough that receipts can't be enumerated.
  return randomBytes(8).toString("base64url").slice(0, 10);
}

/**
 * Who a rate limit applies to. One IPv6 connection typically controls a whole /64 (2^64
 * addresses), so limiting per full address would be no limit at all — group by /64 instead.
 */
export function rateLimitKey(ip: string): string {
  if (!isIPv6(ip)) return ip;
  const [head = "", tail = ""] = ip.toLowerCase().split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const groups = ip.includes("::")
    ? [...headParts, ...Array<string>(8 - headParts.length - tailParts.length).fill("0"), ...tailParts]
    : headParts;
  return `${groups.slice(0, 4).map((g) => g.padStart(4, "0")).join(":")}::/64`;
}

export function hashIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(rateLimitKey(ip)).digest("hex");
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
  /** Atomically checks the sharer's recent count and inserts; false when over the limit. */
  insertIfUnderLimit(receipt: StoredReceipt, limit: typeof RATE_LIMIT): Promise<boolean>;
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
  try {
    const data = parsed.data;
    const id = newReceiptId();
    const multiple = valueMultiple(data);
    const inserted = await input.store.insertIfUnderLimit(
      {
        id,
        data,
        totalUsd: data.totalUsd,
        // Typed-in plan prices can't be verified, so those receipts don't compete on value.
        valueMultiple: multiple !== null && hasPublicPlanPrices(data) ? Math.round(multiple * 100) / 100 : null,
        avoidableUsd: data.avoidableUsd,
        ipHash,
      },
      RATE_LIMIT,
    );
    if (!inserted) {
      return { status: 429, body: { error: "Too many shares from your network. Try again in an hour." } };
    }
    return { status: 201, body: { id, url: new URL(`/r/${id}`, input.siteUrl).toString() } };
  } catch {
    return { status: 500, body: { error: "Couldn't save your receipt. Please try again." } };
  }
}
