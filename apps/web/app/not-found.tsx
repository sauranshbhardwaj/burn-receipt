import Link from "next/link";
import { InstallCommand } from "@/components/install-command";

export default function NotFound() {
  return (
    <main className="flex max-w-xl flex-col items-start gap-5 py-20">
      <p className="text-sm text-muted">404 · receipt not found</p>
      <h1 className="text-3xl font-bold text-amber">No receipt at this address.</h1>
      <p className="text-muted">The link may be mistyped. Make your own in two seconds:</p>
      <div className="w-full">
        <InstallCommand />
      </div>
      <Link href="/" className="text-sm text-green hover:underline">
        ← burn-receipt
      </Link>
    </main>
  );
}
