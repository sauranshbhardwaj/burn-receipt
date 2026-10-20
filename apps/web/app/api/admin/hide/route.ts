import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { env } from "@/lib/env";
import { hideReceipt } from "@/lib/store";

const bodySchema = z.object({ id: z.string() });

function authorized(header: string | null, token: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Takedown: hides a receipt from its page, images and the boards. 404 unless ADMIN_TOKEN is set. */
export async function POST(request: Request) {
  const { ADMIN_TOKEN } = env();
  if (!ADMIN_TOKEN) return new Response("Not found", { status: 404 });
  if (!authorized(request.headers.get("authorization"), ADMIN_TOKEN)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Body must be {\"id\": \"...\"}" }, { status: 400 });

  const hidden = await hideReceipt(parsed.data.id);
  if (!hidden) return Response.json({ error: "No such receipt" }, { status: 404 });
  revalidateTag(`receipt:${parsed.data.id}`, "max");
  revalidateTag("boards", "max");
  return Response.json({ hidden: parsed.data.id });
}
