import Link from "next/link";
import { Suspense } from "react";
import { formatMultiple, formatUsd, toolsLabel, valueMultiple } from "@burn-receipt/core";
import { InstallCommand } from "@/components/install-command";
import { getBoards } from "@/lib/receipts";
import type { BoardEntry } from "@/lib/store";

const STEPS = [
  ["Run one command", "It reads the history Claude Code and Codex already keep on your laptop. No login, no API key."],
  ["Get your receipt", "Every dollar of API-equivalent value lands on one line — including what was avoidable."],
  ["Share if you want", "--share uploads only the numbers (never chats, paths or project names) and gives you a link."],
] as const;

function Board({ title, entries, metric }: { title: string; entries: BoardEntry[]; metric: (e: BoardEntry) => string }) {
  return (
    <section className="rounded-xl border border-line bg-window p-5">
      <h3 className="mb-3 text-sm text-muted">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-dim">No receipts yet. Be the first: npx burn-receipt --share</p>
      ) : (
        <ol className="flex flex-col gap-2 text-sm">
          {entries.map((entry, i) => (
            <li key={entry.id}>
              <Link href={`/r/${entry.id}`} className="flex justify-between gap-3 hover:text-amber">
                <span className="truncate">
                  <span className="text-dim">{String(i + 1).padStart(2, "0")} </span>
                  {toolsLabel(entry.data)} · {entry.data.periodDays}d
                </span>
                <span className="shrink-0 font-bold">{metric(entry)}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

async function Boards() {
  let boards;
  try {
    boards = await getBoards();
  } catch {
    return <p className="text-sm text-muted">The boards are taking a nap. Your receipt still works locally.</p>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Board
        title="MOST VALUE SQUEEZED OUT"
        entries={boards.topValue}
        metric={(e) => {
          const m = valueMultiple(e.data);
          return m === null ? formatUsd(e.data.totalUsd) : formatMultiple(m);
        }}
      />
      <Board title="MOST AVOIDABLE BURN" entries={boards.mostAvoidable} metric={(e) => formatUsd(e.data.avoidableUsd)} />
    </div>
  );
}

export default function Home() {
  return (
    <main className="flex flex-col gap-16">
      <section className="grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="flex flex-col gap-6">
          <p className="text-sm text-green">$ npx burn-receipt</p>
          <h1 className="text-4xl font-bold leading-tight text-amber sm:text-5xl">Where did my AI coding plan go?</h1>
          <p className="text-lg text-muted">
            Your $200 plan ran out by Tuesday. Burn Receipt reads your local Claude Code and Codex history and prints a
            receipt: what it was really worth at API prices, where every dollar went, and how much of it was avoidable.
          </p>
          <InstallCommand />
          <p className="text-sm text-dim">Runs locally in ~2 seconds. Node 20+. macOS, Linux, Windows.</p>
        </div>
        <figure className="flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated PNG from our own route */}
          <img src="/example.png" alt="Example burn receipt" width={1080} height={1350} className="h-auto w-full rounded-xl border border-line" />
          <figcaption className="text-center text-xs text-dim">example receipt (made-up numbers)</figcaption>
        </figure>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {STEPS.map(([title, body], i) => (
          <div key={title} className="rounded-xl border border-line bg-window p-5">
            <p className="text-sm text-green">{i + 1}.</p>
            <h2 className="mt-1 font-bold">{title}</h2>
            <p className="mt-2 text-sm text-muted">{body}</p>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">The board</h2>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-window" />}>
          <Boards />
        </Suspense>
      </section>
    </main>
  );
}
