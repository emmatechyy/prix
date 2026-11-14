"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The four destinations (frontend spec §2). Same items on every page, top bar ≥ 900px, bottom tabs below. */
export const NAV = [
  { href: "/", label: "Verdicts", icon: "M4 12.5l4.5 4.5L20 6.5" },
  { href: "/tokens", label: "Tokens", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/capital", label: "Capital", icon: "M4 19V11M10 19V5M16 19v-6M22 19H2" },
  { href: "/method", label: "Method", icon: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5" },
] as const;

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/") || (href === "/tokens" && path.startsWith("/token/")));

export function Logo() {
  return (
    <Link href="/" className="flex min-h-11 shrink-0 items-center gap-2 rounded" aria-label="PRIX, verdicts">
      <span className="font-serif text-[24px] leading-none text-ink">PRIX</span>
    </Link>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function SiteNav() {
  const path = usePathname();
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-rule bg-paper">
        <div className="mx-auto flex h-14 w-full max-w-[1080px] items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav aria-label="Primary" className="hidden min-[900px]:block">
            <ul className="flex items-center gap-1">
              {NAV.map((n) => {
                const a = isActive(path, n.href);
                return (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      aria-current={a ? "page" : undefined}
                      className={`inline-flex min-h-11 items-center rounded-lg px-4 text-[15px] ${a ? "font-semibold text-ink underline decoration-2 underline-offset-[10px]" : "text-slate hover:text-ink"}`}
                    >
                      {n.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </header>
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-surface pb-[env(safe-area-inset-bottom)] min-[900px]:hidden">
        <ul className="grid h-14 grid-cols-4">
          {NAV.map((n) => {
            const a = isActive(path, n.href);
            return (
              <li key={n.href} className="flex">
                <Link
                  href={n.href}
                  aria-current={a ? "page" : undefined}
                  className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[13px] ${a ? "font-semibold text-ink" : "text-slate"}`}
                >
                  <Icon d={n.icon} />
                  <span className={a ? "underline decoration-2 underline-offset-4" : ""}>{n.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
