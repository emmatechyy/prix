"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV = [
  { href: "/", label: "Overview", code: "OVR" },
  { href: "/rankings", label: "PRIX Index", code: "IDX" },
  { href: "/thesis", label: "Thesis", code: "THS" },
  { href: "/flows", label: "Flows", code: "FLW" },
  { href: "/whales", label: "Whales", code: "WHL" },
  { href: "/launches", label: "Launch Radar", code: "LCH" },
  { href: "/methodology", label: "Methodology", code: "MTH" },
] as const;

export function SideNav() {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {NAV.map((n) => {
        const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`group flex items-center justify-between rounded-md px-3 py-2 text-[13px] transition-colors ${active ? "bg-surface-2 text-text" : "text-muted hover:bg-surface hover:text-text"}`}
          >
            <span className="flex items-center gap-2.5">
              <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-accent" : "bg-border-strong group-hover:bg-faint"}`} aria-hidden />
              {n.label}
            </span>
            <span className="num text-[10px] text-faint">{n.code}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function TopNav() {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="scroll-x -mx-4 flex gap-1 px-4 pb-2">
      {NAV.map((n) => {
        const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-md border px-2.5 py-1.5 text-xs ${active ? "border-accent/40 bg-accent/5 text-accent" : "border-border text-muted"}`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
