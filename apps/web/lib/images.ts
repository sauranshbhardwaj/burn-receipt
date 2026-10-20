import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactElement } from "react";
import { ImageResponse } from "next/og";
import { RECEIPT_FONT_FAMILY, type ReceiptNode } from "@burn-receipt/core";

// Read once at module scope (a "predictable value" under cacheComponents). The files are copied
// from packages/core/assets/fonts by the predev/prebuild script, so there's one source of truth.
const fontsDir = join(process.cwd(), "assets", "fonts");
const [regular, bold] = await Promise.all([
  readFile(join(fontsDir, "JetBrainsMono-Regular.ttf")),
  readFile(join(fontsDir, "JetBrainsMono-Bold.ttf")),
]);

// Browsers keep it an hour, the CDN a day: a receipt never changes, but a takedown must stick.
const IMAGE_CACHE = "public, max-age=3600, s-maxage=86400";

/** Renders one of the shared core layouts — the exact same tree the CLI turns into a PNG. */
export function renderImage(tree: ReceiptNode, size: { width: number; height: number }, cache = IMAGE_CACHE): ImageResponse {
  // next/og hands the element to satori, which only needs the {type, props} shape our tree has.
  return new ImageResponse(tree as unknown as ReactElement, {
    ...size,
    headers: { "cache-control": cache },
    fonts: [
      { name: RECEIPT_FONT_FAMILY, data: regular, weight: 400, style: "normal" },
      { name: RECEIPT_FONT_FAMILY, data: bold, weight: 700, style: "normal" },
    ],
  });
}
