import { revalidateTag } from "next/cache";
import { env } from "@/lib/env";
import { clientIp, createShare, MAX_BODY_BYTES } from "@/lib/share-logic";
import { supabaseReceiptStore } from "@/lib/store";

export async function POST(request: Request) {
  // Refuse obviously oversized bodies before reading them into memory.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return Response.json({ error: "Receipt is too large." }, { status: 413 });
  }
  const { IP_HASH_SECRET, NEXT_PUBLIC_SITE_URL } = env();
  const result = await createShare({
    rawBody: await request.text(),
    ip: clientIp(request.headers),
    secret: IP_HASH_SECRET,
    siteUrl: NEXT_PUBLIC_SITE_URL,
    store: supabaseReceiptStore,
  });
  if (result.status === 201) revalidateTag("boards", "minutes");
  return Response.json(result.body, { status: result.status });
}
