"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export const NAV = [
  { href: "/", label: "Overview" },
  { href: "/rankings", label: "Index" },
  { href: "/thesis", label: "Thesis" },
  { href: "/depth", label: "Depth" },
  { href: "/flows", label: "Flows" },
  { href: "/whales", label: "Whales" },
  { href: "/launches", label: "Launches" },
  { href: "/methodology", label: "Methodology" },
] as const;

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-full" aria-label="PRIX home">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent" aria-hidden>
        <svg width="15" height="15" viewBox="0 0 14 14">
          <path d="M1.5 11.5 L5 6.5 L8 9 L12.5 2.5" stroke="var(--on-accent)" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="font-serif text-[28px] leading-none tracking-[-0.01em] text-text">PRIX</span>
    </Link>
  );
}

export function SiteNav() {
  const path = usePathname();
  // The menu is open only for the path it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const links = NAV.filter((n) => n.href !== "/methodology");

  return (
    <div className="pointer-events-none sticky top-0 z-40 px-3 pt-4 sm:pt-5">
      <nav
        aria-label="Primary"
        className="pointer-events-auto relative mx-auto flex w-full max-w-max items-center gap-4 rounded-full bg-[rgba(247,249,252,0.8)] py-2 pr-2 pl-5 shadow-pill backdrop-blur-md lg:gap-8"
      >
        <Logo />
        <span className="hidden h-5 w-px bg-border-strong lg:block" aria-hidden />
        <ul className="hidden items-center gap-6 lg:flex">
          {links.map((n) => {
            const a = isActive(path, n.href);
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={a ? "page" : undefined}
                  className={`relative text-[16px] leading-[26px] transition-colors duration-300 hover:text-accent-hover ${a ? "text-text" : "text-muted"}`}
                >
                  {n.label}
                  {a && <span className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent" aria-hidden />}
                </Link>
              </li>
            );
          })}
        </ul>
        <Link
          href="/methodology"
          aria-current={isActive(path, "/methodology") ? "page" : undefined}
          className="hidden rounded-full bg-accent px-[22px] py-3 text-[16px] leading-5 font-medium text-on-accent transition-colors duration-300 hover:bg-accent-hover sm:inline-block"
        >
          Methodology
        </Link>
        <button
          type="button"
          onClick={() => setOpenOn(open ? null : path)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          className="ml-auto inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-[16px] leading-5 font-medium text-on-accent transition-colors hover:bg-accent-hover lg:hidden"
        >
          {open ? "Close" : "Menu"}
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className={`transition-transform duration-300 ${open ? "rotate-45" : ""}`}>
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        {open && (
          <ul id="mobile-menu" className="appear absolute inset-x-0 top-[calc(100%+8px)] rounded-[20px] bg-surface p-2 shadow-float lg:hidden">
            {NAV.map((n) => {
              const a = isActive(path, n.href);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={a ? "page" : undefined}
                    className={`flex items-center justify-between rounded-[14px] px-4 py-3 text-[17px] ${a ? "bg-tint text-text" : "text-muted hover:bg-tint"}`}
                  >
                    {n.label}
                    {a && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </div>
  );
}
