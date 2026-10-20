import { describe, expect, it } from "vitest";
import type { ReceiptData } from "@burn-receipt/core";
import { clientIp, createShare, hashIp, MAX_BODY_BYTES, newReceiptId, RATE_LIMIT, rateLimitKey, RECEIPT_ID_PATTERN, type ReceiptStore, type StoredReceipt } from "./share-logic";

const receipt: ReceiptData = {
  version: 1,
  periodDays: 7,
  periodEnd: "2026-10-20T00:00:00.000Z",
  tools: [{ source: "claude-code", costUsd: 450, planLabel: "Claude Max 20x", planUsdForPeriod: 46.03 }],
  lines: [{ id: "rereading", usd: 450 }],
  totalUsd: 450,
  paidUsd: 46.03,
  avoidableUsd: 65.63,
  idleReloads: 34,
  helperAgents: 63,
  helperShare: 0.27,
  priciestSessionUsd: 166,
  priciestSessionHours: 42.3,
  widestFanout: 15,
  replies: 3000,
  sessions: 9,
  totalTokens: 1_000_000,
  topModel: "claude-opus-5-5",
  codexLimits: null,
  unpricedReplies: 0,
  pricesAsOf: "2026-10-20",
};

function memoryStore(existing = 0, failing = false) {
  const inserted: StoredReceipt[] = [];
  const store: ReceiptStore = {
    insertIfUnderLimit: async (r, limit) => {
      if (failing) throw new Error("db down");
      if (existing + inserted.length >= limit.max) return false;
      inserted.push(r);
      return true;
    },
  };
  return { store, inserted };
}

const call = (rawBody: string, store: ReceiptStore) =>
  createShare({ rawBody, ip: "203.0.113.7", secret: "test-secret-0123456789", siteUrl: "https://burnreceipt.dev", store });

describe("createShare", () => {
  it("stores a valid receipt and returns its share URL", async () => {
    const { store, inserted } = memoryStore();
    const result = await call(JSON.stringify(receipt), store);
    expect(result.status).toBe(201);
    if (result.status !== 201) return;
    expect(result.body.url).toBe(`https://burnreceipt.dev/r/${result.body.id}`);
    expect(inserted[0]?.valueMultiple).toBeCloseTo(9.78, 2);
    expect(inserted[0]?.ipHash).not.toContain("203.0.113.7");
  });

  it.each([
    ["not JSON", "{oops"],
    ["a non-receipt object", JSON.stringify({ hello: "world" })],
    ["a receipt with an extra field", JSON.stringify({ ...receipt, prompt: "secret" })],
    ["a receipt with negative money", JSON.stringify({ ...receipt, totalUsd: -5 })],
  ])("rejects %s with 400", async (_label, body) => {
    expect((await call(body, memoryStore().store)).status).toBe(400);
  });

  it("rejects oversized bodies before parsing", async () => {
    expect((await call("x".repeat(MAX_BODY_BYTES + 1), memoryStore().store)).status).toBe(413);
  });

  it("keeps receipts with typed-in plan prices off the value board", async () => {
    const { store, inserted } = memoryStore();
    const typedIn: ReceiptData = {
      ...receipt,
      tools: [{ source: "codex", costUsd: 450, planLabel: "ChatGPT Pro Lite", planUsdForPeriod: 1 }],
      paidUsd: 1,
    };
    expect((await call(JSON.stringify(typedIn), store)).status).toBe(201);
    expect(inserted[0]?.valueMultiple).toBeNull();
  });

  it("rate limits per hashed IP", async () => {
    const { store, inserted } = memoryStore(RATE_LIMIT.max);
    expect((await call(JSON.stringify(receipt), store)).status).toBe(429);
    expect(inserted).toHaveLength(0);
  });

  it("returns a friendly 500 when the database fails", async () => {
    const result = await call(JSON.stringify(receipt), memoryStore(0, true).store);
    expect(result).toEqual({ status: 500, body: { error: "Couldn't save your receipt. Please try again." } });
  });
});

describe("helpers", () => {
  it("makes ids that match the DB constraint", () => {
    for (let i = 0; i < 200; i++) expect(newReceiptId()).toMatch(RECEIPT_ID_PATTERN);
  });

  it("hashes IPs deterministically per secret", () => {
    expect(hashIp("1.2.3.4", "a")).toBe(hashIp("1.2.3.4", "a"));
    expect(hashIp("1.2.3.4", "a")).not.toBe(hashIp("1.2.3.4", "b"));
  });

  it("groups IPv6 sharers by /64 so rotating addresses doesn't dodge the limit", () => {
    expect(rateLimitKey("2001:db8:abcd:12:1:2:3:4")).toBe("2001:0db8:abcd:0012::/64");
    expect(rateLimitKey("2001:db8:abcd:12::99")).toBe("2001:0db8:abcd:0012::/64");
    expect(rateLimitKey("2001:db8::1")).toBe("2001:0db8:0000:0000::/64");
    expect(hashIp("2001:db8:abcd:12::1", "s")).toBe(hashIp("2001:db8:abcd:12:ffff::2", "s"));
    expect(rateLimitKey("203.0.113.7")).toBe("203.0.113.7");
    expect(rateLimitKey("unknown")).toBe("unknown");
  });

  it("takes the first x-forwarded-for hop", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
