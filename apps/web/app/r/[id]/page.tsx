import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatCount, formatPercent, formatUsd, periodLabel, toolsLabel } from "@burn-receipt/core";
import { CopyButton } from "@/components/copy-button";
import { InstallCommand } from "@/components/install-command";
import { getReceipt } from "@/lib/receipts";
import { redditShareUrl, shareHeadline, xShareUrl } from "@/lib/share-text";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  "use cache";
  const { id } = await params;
  const data = await getReceipt(id);
  if (!data) return { title: "Receipt not found — Burn Receipt" };
  const title = shareHeadline(data);
  return {
    title: `${title} — Burn Receipt`,
    description: "Get your own: npx burn-receipt",
    openGraph: { title, description: "Get your own: npx burn-receipt", url: `/r/${id}` },
    twitter: { card: "summary_large_image", title, description: "Get your own: npx burn-receipt" },
  };
}

async function Receipt({ params }: Props) {
  const { id } = await params;
  const data = await getReceipt(id);
  if (!data) notFound();

  const pageUrl = new URL(`/r/${id}`, process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").toString();
  const stats = [
    ["replies", formatCount(data.replies)],
    ["sessions", formatCount(data.sessions)],
    ["helper agents", `${formatCount(data.helperAgents)} (${formatPercent(data.helperShare)} of cost)`],
    ["reloads after pauses", formatCount(data.idleReloads)],
  ];

  return (
    <article className="grid gap-8 md:grid-cols-[minmax(0,1fr)_280px]">
      {/* eslint-disable-next-line @next/next/no-img-element -- dynamic PNG from our own route, already sized */}
      <img
        src={`/r/${id}/receipt.png`}
        alt={shareHeadline(data)}
        width={1080}
        height={1350}
        className="h-auto w-full rounded-xl border border-line"
      />
      <aside className="flex flex-col gap-6">
        <div>
          <p className="text-sm text-muted">
            {toolsLabel(data)} · {periodLabel(data)}
          </p>
          <p className="mt-2 text-3xl font-bold text-amber">{formatUsd(data.totalUsd)}</p>
          <p className="text-sm text-muted">API-equivalent value</p>
          {data.avoidableUsd >= 1 && <p className="mt-3 font-bold text-red">{formatUsd(data.avoidableUsd)} avoidable</p>}
        </div>
        <dl className="grid gap-2 text-sm">
          {stats.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-2 border-b border-line pb-2">
              <dt className="text-muted">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-col gap-2">
          <a href={xShareUrl(data, pageUrl)} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-text px-4 py-2 text-center font-bold text-page hover:opacity-90">
            Post on X
          </a>
          <a href={redditShareUrl(data, pageUrl)} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-line px-4 py-2 text-center hover:border-amber">
            Share on Reddit
          </a>
          <div className="flex items-center justify-between rounded-lg border border-line px-4 py-2 text-sm">
            <span className="truncate text-muted">{pageUrl}</span>
            <CopyButton text={pageUrl} label="copy link" />
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm text-muted">Get yours — reads your local logs, nothing uploaded unless you share:</p>
          <InstallCommand />
        </div>
      </aside>
    </article>
  );
}

export default function ReceiptPage(props: Props) {
  return (
    <main className="flex flex-col gap-8">
      <Link href="/" className="text-sm text-green hover:underline">
        ← burn-receipt
      </Link>
      <Suspense fallback={<div className="aspect-[4/5] w-full max-w-xl animate-pulse rounded-xl bg-window" />}>
        <Receipt {...props} />
      </Suspense>
    </main>
  );
}
