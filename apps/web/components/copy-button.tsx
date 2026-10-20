"use client";

import { useState } from "react";

export function CopyButton({ text, label = "copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (insecure context, permissions); the text stays selectable.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 whitespace-nowrap rounded border border-line px-3 py-1 text-sm text-muted transition hover:border-amber hover:text-amber"
    >
      {copied ? "copied!" : label}
    </button>
  );
}
