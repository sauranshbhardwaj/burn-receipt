import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Burn Receipt — where your AI coding plan really went",
  description:
    "One command reads your local Claude Code and Codex history and prints a receipt: what your plan was really worth at API prices, and what was avoidable.",
  openGraph: { siteName: "Burn Receipt", type: "website" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={jetbrains.variable}>
      <body className="min-h-screen antialiased">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">{children}</div>
        <footer className="mx-auto max-w-4xl px-4 pb-10 text-sm text-muted sm:px-6">
          Estimates at public API list prices. Not affiliated with Anthropic or OpenAI. Your chats never leave your
          machine — only the receipt&apos;s numbers, and only if you choose to share.
        </footer>
      </body>
    </html>
  );
}
