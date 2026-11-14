import type { Metadata, Viewport } from "next";
import { Geist_Mono, Host_Grotesk, Instrument_Serif } from "next/font/google";
import Link from "next/link";
import { SiteNav } from "@/components/nav";
import "./globals.css";

const hostGrotesk = Host_Grotesk({ variable: "--font-host-grotesk", subsets: ["latin"] });
const instrumentSerif = Instrument_Serif({ variable: "--font-instrument-serif", subsets: ["latin"], weight: "400" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "PRIX — Evidence-graded index of NEAR on-chain markets", template: "%s · PRIX" },
  description:
    "PRIX reads RHEA pools, NEAR Intents and NEAR network data and turns them into transparent, re-runnable investment signals: liquidity depth, flows, whale moves, launches and a ranked index with every input shown.",
};

export const viewport: Viewport = { themeColor: "#e7ecf3", width: "device-width", initialScale: 1 };

const FOOT = [
  ["Index", "/rankings"],
  ["Thesis", "/thesis"],
  ["Depth", "/depth"],
  ["Methodology", "/methodology"],
  ["JSON API", "/api/v1/openapi.json"],
  ["Feed", "/feed.xml"],
] as const;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${hostGrotesk.variable} ${instrumentSerif.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent">
          Skip to content
        </a>
        <span id="top" />
        <SiteNav />
        <main id="main" className="mx-auto w-full max-w-[1200px] px-4 pt-12 pb-16 sm:px-8 sm:pt-16 lg:px-10">
          {children}
        </main>
        <footer className="mx-auto w-full max-w-[1200px] px-4 sm:px-8 lg:px-10">
          <div className="appear py-16 text-center sm:py-24">
            <p className="text-[17px] text-muted">Read-only. No wallet, no trading, no custody.</p>
            <p className="display mx-auto mt-4 max-w-[14ch] text-[44px] text-text sm:text-[72px]">Every figure links to its source.</p>
            <p className="mx-auto mt-5 max-w-xl text-[17px] leading-[1.55] text-muted">
              Missing data is shown as <span className="text-text">“not reported”</span>, never estimated. Data: RHEA indexer &amp; Smart Router, NEAR RPC, FastNEAR, NearBlocks v3, NEAR Intents 1Click.
            </p>
            <Link href="/methodology" className="mt-8 inline-block rounded-full bg-accent px-7 py-4 text-[16px] leading-5 font-medium text-on-accent transition-colors duration-300 hover:bg-accent-hover">
              Read the methodology
            </Link>
          </div>
          <div className="flex flex-col items-center gap-4 border-t border-border-strong py-6 text-[15px] text-muted sm:flex-row sm:justify-between">
            <p className="text-center sm:text-left">Built for NEAR HACKATHON 2026 · Investment Thesis track</p>
            <ul className="flex flex-wrap justify-center gap-x-5 gap-y-1">
              {FOOT.map(([l, h]) => (
                <li key={h}>
                  <Link href={h} className="hover:text-text">{l}</Link>
                </li>
              ))}
            </ul>
            <a href="#top" className="text-text underline underline-offset-4 hover:text-accent-hover">Back to top</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
