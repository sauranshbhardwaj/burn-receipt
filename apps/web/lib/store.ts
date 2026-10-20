import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { receiptDataSchema, type ReceiptData } from "@burn-receipt/core";
import { env } from "./env";
import { RECEIPT_ID_PATTERN, type ReceiptStore } from "./share-logic";

let client: SupabaseClient | null = null;

/** Service-role client: server-only, bypasses RLS (the table has no public policies). */
function db(): SupabaseClient {
  if (!client) {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();
    client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  }
  return client;
}

export const supabaseReceiptStore: ReceiptStore = {
  async countSince(ipHash, since) {
    const { count, error } = await db()
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since.toISOString());
    if (error) throw error;
    return count ?? 0;
  },
  async insert(receipt) {
    const { error } = await db().from("receipts").insert({
      id: receipt.id,
      data: receipt.data,
      total_usd: receipt.totalUsd,
      value_multiple: receipt.valueMultiple,
      avoidable_usd: receipt.avoidableUsd,
      ip_hash: receipt.ipHash,
    });
    if (error) throw error;
  },
};

/** Re-validates on the way out too: rows written by an older schema version just don't render. */
function parseRow(row: { id: string; data: unknown }): { id: string; data: ReceiptData } | null {
  const parsed = receiptDataSchema.safeParse(row.data);
  return parsed.success ? { id: row.id, data: parsed.data } : null;
}

export async function fetchReceipt(id: string): Promise<ReceiptData | null> {
  if (!RECEIPT_ID_PATTERN.test(id)) return null;
  const { data, error } = await db().from("receipts").select("id, data").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? (parseRow(data)?.data ?? null) : null;
}

export type BoardEntry = { id: string; data: ReceiptData };

export async function fetchBoard(order: "value_multiple" | "avoidable_usd" | "created_at", limit: number): Promise<BoardEntry[]> {
  const { data, error } = await db()
    .from("receipts")
    .select("id, data")
    .order(order, { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(parseRow).filter((row): row is BoardEntry => row !== null);
}
