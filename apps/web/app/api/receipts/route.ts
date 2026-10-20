import { revalidateTag } from "next/cache";
import { env } from "@/lib/env";
import { clientIp, createShare } from "@/lib/share-logic";
import { supabaseReceiptStore } from "@/lib/store";

export async function POST(request: Request) {
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
