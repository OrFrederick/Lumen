import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Lumen — science video library",
  description:
    "Interactive timeline of stories, anecdotes, and experiments distilled from science videos.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased font-sans">
        <header className="border-b border-current/10">
          <nav className="mx-auto max-w-7xl px-4 h-12 flex items-center justify-between text-sm">
            <Link href="/" className="font-semibold tracking-tight">
              ✦ Lumen
            </Link>
            <div className="flex items-center gap-4 opacity-80">
              <Link href="/" className="hover:underline">Timeline</Link>
              <Link href="/walk" className="hover:underline">Walk</Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 py-8 text-xs opacity-50">
          Lumen — distilled from science videos.
        </footer>
      </body>
    </html>
  );
}
