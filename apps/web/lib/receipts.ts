import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { fetchBoard, fetchReceipt, type BoardEntry } from "./store";

/** A receipt never changes after it's created, so it can stay cached for as long as Next allows. */
export async function getReceipt(id: string) {
  "use cache";
  cacheTag(`receipt:${id}`);
  const receipt = await fetchReceipt(id);
  // Don't remember "not found" for long: it's cheap to re-check and could change.
  if (receipt) cacheLife("max");
  else cacheLife("seconds");
  return receipt;
}

/** The public boards refresh every few minutes; nobody needs them to the second. */
export async function getBoards(): Promise<{ topValue: BoardEntry[]; mostAvoidable: BoardEntry[]; latest: BoardEntry[] }> {
  "use cache";
  cacheLife("minutes");
  cacheTag("boards");
  const [topValue, mostAvoidable, latest] = await Promise.all([
    fetchBoard("value_multiple", 10),
    fetchBoard("avoidable_usd", 10),
    fetchBoard("created_at", 12),
  ]);
  return { topValue, mostAvoidable, latest };
}
