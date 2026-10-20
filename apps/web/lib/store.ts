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
  async insertIfUnderLimit(receipt, limit) {
    // One Postgres function does count + insert under a per-sharer lock (see the migration).
    const { data, error } = await db().rpc("insert_receipt_rate_limited", {
      p_id: receipt.id,
      p_data: receipt.data,
      p_total_usd: receipt.totalUsd,
      p_value_multiple: receipt.valueMultiple,
      p_avoidable_usd: receipt.avoidableUsd,
      p_ip_hash: receipt.ipHash,
      p_max_per_window: limit.max,
      p_window: `${Math.round(limit.windowMs / 1000)} seconds`,
    });
    if (error) throw error;
    return data === true;
  },
};

/** Takes a receipt off its page, its images and the boards. */
export async function hideReceipt(id: string): Promise<boolean> {
  if (!RECEIPT_ID_PATTERN.test(id)) return false;
  const { data, error } = await db().from("receipts").update({ hidden: true }).eq("id", id).select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

/** Re-validates on the way out too: rows written by an older schema version just don't render. */
function parseRow(row: { id: string; data: unknown }): { id: string; data: ReceiptData } | null {
  const parsed = receiptDataSchema.safeParse(row.data);
  return parsed.success ? { id: row.id, data: parsed.data } : null;
}

export async function fetchReceipt(id: string): Promise<ReceiptData | null> {
  if (!RECEIPT_ID_PATTERN.test(id)) return null;
  const { data, error } = await db().from("receipts").select("id, data").eq("id", id).eq("hidden", false).maybeSingle();
  if (error) throw error;
  return data ? (parseRow(data)?.data ?? null) : null;
}

export type BoardEntry = { id: string; data: ReceiptData };

export async function fetchBoard(order: "value_multiple" | "avoidable_usd" | "created_at", limit: number): Promise<BoardEntry[]> {
  const query = db()
    .from("receipts")
    .select("id, data")
    .eq("hidden", false)
    .order(order, { ascending: false, nullsFirst: false })
    .limit(limit);
  // Receipts with typed-in plan prices have no verifiable multiple and stay off the value board.
  const { data, error } = await (order === "value_multiple" ? query.not("value_multiple", "is", null) : query);
  if (error) throw error;
  return (data ?? []).map(parseRow).filter((row): row is BoardEntry => row !== null);
}
