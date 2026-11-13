import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { SideNav, TopNav } from "@/components/nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "PRIX — Evidence-graded index of NEAR on-chain markets", template: "%s · PRIX" },
  description:
    "PRIX reads RHEA pools, NEAR Intents and NEAR network data and turns them into transparent, re-runnable investment signals: liquidity depth, flows, whale moves, launches and a ranked index with every input shown.",
};

export const viewport: Viewport = { themeColor: "#07090c", width: "device-width", initialScale: 1 };

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="PRIX home">
      <span className="grid h-7 w-7 place-items-center rounded-md border border-accent/40 bg-accent/10">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path d="M1 12 L5 6 L8 9 L13 2" stroke="var(--accent)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="leading-none">
        <span className="block text-[15px] font-semibold tracking-[0.12em] text-text">PRIX</span>
        <span className="block text-[10px] tracking-wide text-faint">NEAR smart index layer</span>
      </span>
    </Link>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        <div className="mx-auto flex max-w-[1440px]">
          <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border px-3 py-5 lg:flex">
            <div className="px-2">
              <Logo />
            </div>
            <div className="mt-8">
              <SideNav />
            </div>
            <div className="mt-auto space-y-2 px-2 text-[11px] leading-relaxed text-faint">
              <p>Read-only. No wallet, no trading, no custody.</p>
              <p>
                Data: RHEA indexer &amp; Smart Router, NEAR RPC, FastNEAR, NearBlocks v3, NEAR Intents 1Click.
              </p>
            </div>
          </aside>
          <div className="min-w-0 flex-1">
            <header className="sticky top-0 z-20 border-b border-border bg-bg/90 px-4 pt-3 backdrop-blur lg:hidden">
              <div className="mb-3 flex items-center justify-between">
                <Logo />
                <span className="text-[10px] uppercase tracking-[0.12em] text-faint">Read-only</span>
              </div>
              <TopNav />
            </header>
            <main id="main" className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              {children}
            </main>
            <footer className="border-t border-border px-4 py-5 text-xs text-faint sm:px-6 lg:px-8">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p>
                  Built for <span className="text-muted">NEAR HACKATHON 2026</span> · Investment Thesis track
                </p>
                <p>
                  Every figure links to its source. Missing data is shown as <span className="text-muted">“not reported”</span>, never estimated.
                </p>
              </div>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
