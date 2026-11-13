import Link from "next/link";
import type { ReactNode } from "react";
import { NR, pct } from "@/lib/format";

export function Card({ children, className = "", tone = "paper" }: { children: ReactNode; className?: string; tone?: "paper" | "cobalt" }) {
  const base = tone === "cobalt" ? "bg-accent text-on-accent" : "bg-surface";
  return <section className={`appear min-w-0 overflow-hidden rounded-[20px] ${base} ${className}`}>{children}</section>;
}

export function CardHeader({ title, subtitle, right, id }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
      <div className="min-w-0 flex-1 basis-[260px]">
        <h2 id={id} className="font-serif text-[26px] leading-[1.1] text-text sm:text-[28px]">
          {title}
        </h2>
        {subtitle && <div className="mt-1.5 max-w-[68ch] text-[14.5px] leading-[1.5] text-muted">{subtitle}</div>}
      </div>
      {right && <div className="shrink-0 pt-1 text-[14px] text-muted">{right}</div>}
    </header>
  );
}

/** Eyebrow pill with a status dot, after the reference's "on/off air" marker. */
export function Eyebrow({ children, dot = "accent" }: { children: ReactNode; dot?: "accent" | "live" }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border-strong px-3.5 py-1.5 text-[14px] leading-none font-medium text-text">
      <span className={`h-2 w-2 rounded-full ${dot === "live" ? "bg-up-fill" : "bg-accent"}`} aria-hidden />
      {children}
    </span>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="appear mb-10 grid gap-x-12 gap-y-5 sm:mb-14 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-end">
      <div className="min-w-0">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="display mt-5 text-[42px] text-text sm:text-[56px] lg:text-[64px]">{title}</h1>
      </div>
      {children && <div className="max-w-[58ch] text-[16px] leading-[1.6] text-muted sm:text-[17px] lg:pb-2">{children}</div>}
    </div>
  );
}

export function PillLink({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "outline" }) {
  const cls =
    variant === "primary"
      ? "bg-accent text-on-accent hover:bg-accent-hover px-7 py-4"
      : "border border-accent text-text hover:bg-tint px-[27px] py-[15px]";
  return (
    <Link href={href} className={`inline-flex items-center justify-center rounded-full text-[16px] leading-5 font-medium transition-colors duration-300 ${cls}`}>
      {children}
    </Link>
  );
}

/** Numbered chip, after the reference's channel keys. */
export function KeyChip({ n, href, children }: { n: number | string; href: string; children: ReactNode }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5 rounded-[14px] border border-border-strong py-1.5 pr-4 pl-1.5 text-[15px] font-medium text-text transition-colors duration-300 hover:bg-tint sm:text-[16px]">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-[14px] text-on-accent transition-transform duration-300 group-hover:scale-105">{n}</span>
      {children}
    </Link>
  );
}

export function Stat({ label, value, sub, tone, source }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "up" | "down" | "warn"; source?: string }) {
  return (
    <div className="appear flex min-w-0 flex-col rounded-[16px] bg-surface px-5 py-5 sm:px-6">
      <p className="text-[14px] leading-snug text-muted">{label}</p>
      <p className="mt-3 truncate font-serif text-[30px] leading-none text-text sm:text-[40px]">{value}</p>
      {sub && <p className={`mt-2 text-[13.5px] leading-snug ${tone === "up" ? "text-up" : tone === "down" ? "text-danger" : tone === "warn" ? "text-warn" : "text-muted"}`}>{sub}</p>}
      {source && <p className="mt-auto pt-3"><SourceLink href={source} label="source" /></p>}
    </div>
  );
}

/** Stat grid: two up on phones (an odd last tile spans the row), five across on desktop. */
export const STAT_GRID = "grid grid-cols-2 gap-3 lg:grid-cols-5 max-lg:[&>*:last-child:nth-child(odd)]:col-span-2";

export function Delta({ v, digits = 1 }: { v: number | null | undefined; digits?: number }) {
  if (v == null || !Number.isFinite(v)) return <span className="text-faint">{NR}</span>;
  const cls = v > 0 ? "text-up" : v < 0 ? "text-danger" : "text-muted";
  return <span className={`num ${cls}`}>{pct(v, digits, true)}</span>;
}

export type Tone = "neutral" | "up" | "warn" | "danger" | "info" | "solid";

export function Badge({ children, tone = "neutral", title }: { children: ReactNode; tone?: Tone; title?: string }) {
  const map = {
    neutral: "border-border-strong text-muted",
    up: "border-up/30 bg-up/8 text-up",
    warn: "border-warn/25 bg-warn-fill/70 text-warn",
    danger: "border-danger/25 bg-danger/8 text-danger",
    info: "border-transparent bg-tint text-text",
    solid: "border-transparent bg-accent text-on-accent",
  } as const;
  return (
    <span title={title} className={`inline-flex items-center rounded-full border px-2.5 py-[3px] text-[12.5px] leading-[1.35] font-medium whitespace-nowrap ${map[tone]}`}>
      {children}
    </span>
  );
}

export function NotReported({ why }: { why?: string }) {
  return (
    <span className="text-faint italic" title={why}>
      {NR}
    </span>
  );
}

export function ScoreBar({ score, size = "md" }: { score: number | null; size?: "sm" | "md" }) {
  if (score == null) return <NotReported why="Less than half of the score's weight had data" />;
  const color = score >= 60 ? "bg-accent" : score >= 35 ? "bg-accent/45" : "bg-danger-fill";
  return (
    <div className="flex items-center gap-2.5" aria-label={`Score ${score} of 100`}>
      <span className={`num ${size === "md" ? "w-10 text-[14px]" : "w-9 text-[13px]"} text-right text-ink`}>{score.toFixed(1)}</span>
      <span className={`relative ${size === "md" ? "h-2 w-24" : "h-1.5 w-16"} overflow-hidden rounded-full bg-tint-strong`} aria-hidden>
        <span className={`absolute inset-y-0 left-0 rounded-full ${color}`} style={{ width: `${Math.max(3, score)}%` }} />
      </span>
    </div>
  );
}

export function SourceLink({ href, compact, label }: { href: string; compact?: boolean; label?: string }) {
  const isUrl = /^https?:\/\//.test(href) && !/<|%3C/i.test(href);
  if (!isUrl) return <span className="num text-[12px] text-faint">{label ?? decodeURIComponent(href)}</span>;
  const host = new URL(href).host;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-[12.5px] text-faint underline-offset-4 transition-colors hover:text-text hover:underline" title={href}>
      <span className="whitespace-nowrap">{compact ? "src ↗" : (label ?? host) + " ↗"}</span>
    </a>
  );
}

export function Sources({ urls, note }: { urls: string[]; note?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-5 py-3.5 text-[12.5px] text-faint sm:px-6">
      <span className="font-medium text-muted">Sources</span>
      {urls.map((u) => (
        <SourceLink key={u} href={u} label={decodeURIComponent(u.replace(/^https?:\/\//, "").split("?")[0])} />
      ))}
      {note && <span className="w-full text-faint sm:w-auto">{note}</span>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-serif text-[24px] text-text">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-[14.5px] leading-relaxed text-muted">{children}</p>}
    </div>
  );
}

export function SourceError({ what, error }: { what: string; error: string }) {
  return (
    <div role="alert" className="rounded-[16px] bg-danger/6 px-5 py-4 text-[14.5px]">
      <p className="font-medium text-danger">{what} is unavailable right now</p>
      <p className="mt-1 text-[13.5px] text-muted">Upstream error: {error}. PRIX shows nothing rather than a guess; the page retries on the next refresh.</p>
    </div>
  );
}

export function TokenLink({ id, symbol, sub }: { id: string; symbol: string; sub?: string }) {
  return (
    <Link href={`/token/${encodeURIComponent(id)}`} className="group inline-flex min-w-0 flex-col">
      <span className="font-medium text-ink transition-colors group-hover:text-accent group-hover:underline">{symbol}</span>
      {sub && <span className="max-w-[180px] truncate text-[12px] text-faint">{sub}</span>}
    </Link>
  );
}

export function Flags({ flags, max = 3 }: { flags: string[]; max?: number }) {
  if (!flags.length) return <span className="text-faint">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.slice(0, max).map((f) => (
        <Badge key={f} tone={/not reported|unavailable|not routable|not indexed|not resolved|insufficient/.test(f) ? "neutral" : "warn"}>
          {f}
        </Badge>
      ))}
      {flags.length > max && <Badge>+{flags.length - max}</Badge>}
    </div>
  );
}

/** Verdict → badge tone, shared by the overview and the thesis page. */
export const VERDICT_TONE = { Supported: "up", "Not supported": "danger", Mixed: "warn", "Insufficient data": "neutral" } as const satisfies Record<string, Tone>;
