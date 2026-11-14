"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The four destinations. Same items everywhere: a floating pill on top (≥ 900px), a floating tab pill at the bottom below. */
export const NAV = [
  { href: "/", label: "Verdicts", icon: "M4 12.5l4.5 4.5L20 6.5" },
  { href: "/tokens", label: "Tokens", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/capital", label: "Capital", icon: "M4 19V11M10 19V5M16 19v-6M22 19H2" },
  { href: "/method", label: "Method", icon: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5" },
] as const;

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/") || (href === "/tokens" && path.startsWith("/token/")));

export function Logo() {
  return (
    <Link href="/" className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-full" aria-label="PRIX, verdicts">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink" aria-hidden>
        <svg width="15" height="15" viewBox="0 0 14 14">
          <path d="M1.5 11.5 L5 6.5 L8 9 L12.5 2.5" stroke="var(--paper)" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="font-serif text-[28px] leading-none text-ink">PRIX</span>
    </Link>
  );
}

export function SiteNav() {
  const path = usePathname();
  return (
    <>
      <div className="pointer-events-none sticky top-0 z-40 px-3 pt-4 sm:pt-5">
        <div className="pointer-events-auto mx-auto flex w-full max-w-max items-center gap-6 rounded-full bg-[rgba(247,249,252,0.85)] py-2 pr-2 pl-5 shadow-pill backdrop-blur-md">
          <Logo />
          <span className="hidden h-5 w-px bg-rule-strong min-[900px]:block" aria-hidden />
          <nav aria-label="Primary" className="hidden min-[900px]:block">
            <ul className="flex items-center gap-1">
              {NAV.map((n) => {
                const a = isActive(path, n.href);
                return (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      aria-current={a ? "page" : undefined}
                      className={`inline-flex min-h-11 items-center rounded-full px-5 text-[16px] transition-colors duration-300 ${a ? "bg-ink font-medium text-paper underline decoration-1 underline-offset-[6px]" : "text-ink hover:bg-wash"}`}
                    >
                      {n.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>
      <nav aria-label="Primary" className="fixed inset-x-3 bottom-3 z-40 rounded-full bg-[rgba(247,249,252,0.92)] p-1.5 pb-[max(6px,env(safe-area-inset-bottom))] shadow-float backdrop-blur-md min-[900px]:hidden">
        <ul className="grid grid-cols-4 gap-1">
          {NAV.map((n) => {
            const a = isActive(path, n.href);
            return (
              <li key={n.href} className="flex">
                <Link
                  href={n.href}
                  aria-current={a ? "page" : undefined}
                  className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[13px] ${a ? "bg-ink font-semibold text-paper" : "text-ink"}`}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={n.icon} />
                  </svg>
                  <span className={a ? "underline decoration-1 underline-offset-2" : ""}>{n.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
