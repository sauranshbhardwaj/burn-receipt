import "server-only";
import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.url(),
  /** Server-only. Bypasses RLS, so it must never reach the browser. */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  /** Secret salt for hashing sharer IPs (rate limiting only). */
  IP_HASH_SECRET: z.string().min(16),
  NEXT_PUBLIC_SITE_URL: z.url(),
  /** Bearer token for the takedown endpoint; unset = takedowns disabled. */
  ADMIN_TOKEN: z.string().min(24).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Validated lazily so a missing var fails loudly at first use with a clear message, not at import. */
export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid or missing environment variables: ${missing}`);
  }
  cached = parsed.data;
  return cached;
}
