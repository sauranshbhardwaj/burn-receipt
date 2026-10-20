"use client";

import Link from "next/link";

/** Users never see a stack trace: just what happened and what to do next. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex flex-col items-start gap-4 py-20">
      <p className="text-sm text-red">! something broke on our side</p>
      <h1 className="text-3xl font-bold text-amber">That receipt got crumpled.</h1>
      <p className="text-muted">Your local receipt is unaffected — this only affects the website. Try again in a moment.</p>
      <div className="flex gap-3">
        <button type="button" onClick={reset} className="rounded-lg bg-text px-4 py-2 font-bold text-page hover:opacity-90">
          Try again
        </button>
        <Link href="/" className="rounded-lg border border-line px-4 py-2 hover:border-amber">
          Home
        </Link>
      </div>
    </main>
  );
}
