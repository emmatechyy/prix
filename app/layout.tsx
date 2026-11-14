import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Newsreader } from "next/font/google";
import Link from "next/link";
import { SiteNav } from "@/components/nav";
import { ThemeToggle, THEME_SCRIPT } from "@/components/theme-toggle";
import "./globals.css";

const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", fallback: ["system-ui", "sans-serif"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], weight: ["500"], display: "swap", fallback: ["Georgia", "serif"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://prix-orcin.vercel.app"),
  title: { default: "PRIX: the long-term case for NEAR, tested daily", template: "%s · PRIX" },
  description: "An evidence-graded index of NEAR on-chain markets with a falsifiable investment thesis. Six pre-registered claims, one hashed daily snapshot, every number linked to its source.",
  openGraph: { images: ["/og"] },
  twitter: { card: "summary_large_image", images: ["/og"] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef1f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0e141b" },
  ],
};

const FOOT = [
  ["Method", "/method"],
  ["API", "/api/v1/openapi.json"],
  ["Repo", "https://github.com/emmatechyy/prix"],
  ["Data sources", "/method#sources"],
  ["Feed", "/feed.xml"],
] as const;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plex.variable} ${newsreader.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-3 focus:text-paper">
          Skip to content
        </a>
        <SiteNav />
        <main id="main" className="mx-auto w-full max-w-[1080px] px-4 pt-8 pb-16 sm:px-6 sm:pt-12">
          {children}
        </main>
        <footer className="mx-auto w-full max-w-[1080px] px-4 pb-24 sm:px-6 min-[900px]:pb-10">
          <div className="flex flex-col gap-4 border-t border-rule pt-6 text-[15px] text-slate sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <ul className="flex flex-wrap gap-x-1 gap-y-1">
              {FOOT.map(([l, h]) => (
                <li key={h}>
                  <Link href={h} className="inline-flex min-h-11 items-center rounded-lg px-2 text-ink underline-offset-4 hover:underline">{l}</Link>
                </li>
              ))}
            </ul>
            <ThemeToggle />
          </div>
          <p className="measure mt-4 text-[13px] leading-relaxed text-slate">
            Read-only. No wallet, no trading, no custody. PRIX has no commercial relationship with RHEA or NEAR Intents; RHEA is both a data source and a subject, so its numbers are recomputed, not trusted. Built for the NEAR Hackathon 2026, Investment Thesis track.
          </p>
        </footer>
      </body>
    </html>
  );
}
