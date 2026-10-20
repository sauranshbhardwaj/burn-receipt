/**
 * Public base URL for share links and preview cards. Falling back to localhost in production
 * would hand out broken links, so production refuses to start without it.
 */
function resolveSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (url) return url.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_SITE_URL must be set in production (e.g. https://burnreceipt.dev).");
  }
  return "http://localhost:3000";
}

export const SITE_URL = resolveSiteUrl();
