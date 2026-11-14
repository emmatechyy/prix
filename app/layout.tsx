import type { Metadata, Viewport } from "next";
import { Geist_Mono, Host_Grotesk, Instrument_Serif } from "next/font/google";
import Link from "next/link";
import { SiteNav } from "@/components/nav";
import "./globals.css";

const hostGrotesk = Host_Grotesk({ variable: "--font-host-grotesk", subsets: ["latin"], display: "swap" });
const instrumentSerif = Instrument_Serif({ variable: "--font-instrument-serif", subsets: ["latin"], weight: "400", display: "swap" });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://prix-orcin.vercel.app"),
  title: { default: "PRIX: the long-term case for NEAR, tested daily", template: "%s · PRIX" },
  description: "An evidence-graded index of NEAR on-chain markets with a falsifiable investment thesis. Six pre-registered claims, one hashed daily snapshot, every number linked to its source.",
  openGraph: { images: ["/og"] },
  twitter: { card: "summary_large_image", images: ["/og"] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#e7ecf3" };

const FOOT = [
  ["Method", "/method"],
  ["API", "/api/v1/openapi.json"],
  ["Repo", "https://github.com/emmatechyy/prix"],
  ["Data sources", "/method#sources"],
] as const;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${hostGrotesk.variable} ${instrumentSerif.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:text-paper">
          Skip to content
        </a>
        <SiteNav />
        <main id="main" className="mx-auto w-full max-w-[1200px] px-4 pt-12 pb-16 sm:px-8 sm:pt-16 lg:px-10">
          {children}
        </main>
        <footer className="mx-auto w-full max-w-[1200px] px-4 pb-28 sm:px-8 lg:px-10 min-[900px]:pb-10">
          <div className="flex flex-col items-center gap-3 border-t border-rule-strong pt-6 text-[15px] text-slate sm:flex-row sm:justify-between">
            <p className="text-center sm:text-left">Read-only. No wallet, no trading, no custody.</p>
            <ul className="flex flex-wrap justify-center gap-x-1">
              {FOOT.map(([l, h]) => (
                <li key={h}>
                  <Link href={h} className="inline-flex min-h-11 items-center px-2.5 text-ink hover:underline">
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <p className="mx-auto mt-2 max-w-[68ch] text-center text-[13px] leading-relaxed text-slate sm:text-left sm:mx-0">
            PRIX has no commercial relationship with RHEA or NEAR Intents. RHEA is both a data source and a subject, so its numbers are recomputed, not trusted. Built for the NEAR Hackathon 2026, Investment Thesis track.
          </p>
        </footer>
      </body>
    </html>
  );
}
