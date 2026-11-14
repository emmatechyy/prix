import Link from "next/link";
import type { ReactNode } from "react";
import { NR, pct } from "@/lib/format";
import { flagText } from "@/lib/copy";

export function Card({ children, className = "" }: { children: ReactNode; className?: string; tone?: "paper" | "cobalt" }) {
  return <section className={`min-w-0 overflow-hidden rounded-lg border border-rule bg-surface ${className}`}>{children}</section>;
}

export function CardHeader({ title, subtitle, right, id }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-4 pb-3 sm:px-5">
      <div className="min-w-0 flex-1 basis-[240px]">
        <h3 id={id} className="font-serif text-[21px] leading-[1.3] text-ink">
          {title}
        </h3>
        {subtitle && <div className="measure mt-1 text-[15px] leading-[1.5] text-slate">{subtitle}</div>}
      </div>
      {right && <div className="shrink-0 pt-1 text-[15px] text-slate">{right}</div>}
    </header>
  );
}

/** Section heading inside a page (each page has its own h1). */
export function PageHeader({ title, children, id }: { eyebrow?: string; title: string; children?: ReactNode; id?: string }) {
  return (
    <div className="mb-5">
      <h2 id={id} className="font-serif text-[28px] leading-[1.25] text-ink">{title}</h2>
      {children && <div className="measure mt-2 text-[15px] leading-[1.6] text-slate">{children}</div>}
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

export function Stat({ label, value, sub, source }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "up" | "down" | "warn"; source?: string }) {
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-rule bg-surface px-4 py-4">
      <p className="text-[15px] leading-snug text-slate">{label}</p>
      <p className="num mt-2 truncate text-[21px] leading-tight font-semibold text-ink">{value}</p>
      {sub && <p className="mt-1 text-[13px] leading-snug text-slate">{sub}</p>}
      {source && <p className="mt-auto pt-2"><SourceLink href={source} label="source" /></p>}
    </div>
  );
}

/** Stat grid: two up on phones (an odd last tile spans the row), five across on desktop. */
export const STAT_GRID = "grid grid-cols-2 gap-3 lg:grid-cols-5 max-lg:[&>*:last-child:nth-child(odd)]:col-span-2";

export function Delta({ v, digits = 1 }: { v: number | null | undefined; digits?: number }) {
  if (v == null || !Number.isFinite(v)) return <span className="text-faint">{NR}</span>;
  const cls = "text-ink";
  return <span className={`num ${cls}`}>{pct(v, digits, true)}</span>;
}

export type Tone = "neutral" | "up" | "warn" | "danger" | "info" | "solid";

export function Badge({ children, tone = "neutral", title }: { children: ReactNode; tone?: Tone; title?: string }) {
  const map = {
    neutral: "border-border-strong text-muted",
    up: "border-border-strong text-ink",
    warn: "border-border-strong text-ink",
    danger: "border-border-strong text-ink",
    info: "border-transparent bg-tint text-text",
    solid: "border-transparent bg-accent text-on-accent",
  } as const;
  return (
    <span title={title} className={`inline-flex items-center rounded-full border px-2.5 py-[3px] text-[13px] leading-[1.35] font-medium whitespace-nowrap ${map[tone]}`}>
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
  const color = score >= 60 ? "bg-accent" : score >= 35 ? "bg-accent/45" : "bg-accent/20";
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
  const internal = href.startsWith("/");
  const isUrl = (internal || /^https?:\/\//.test(href)) && !/<|%3C/i.test(href);
  if (!isUrl) return <span className="num text-[13px] text-faint">{label ?? decodeURIComponent(href)}</span>;
  const host = internal ? href : new URL(href).host;
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`text-[13px] text-faint underline-offset-4 transition-colors hover:text-text hover:underline ${compact ? "inline-flex min-h-11 min-w-11 items-center justify-center" : ""}`} title={href}>
      <span className="break-all">{compact ? "src ↗" : (label ?? host) + " ↗"}</span>
    </a>
  );
}

export function Sources({ urls, note }: { urls: string[]; note?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border px-5 py-3.5 text-[13px] text-faint sm:px-6">
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

export function SourceError({ what }: { what: string; error?: string }) {
  return (
    <div role="alert" className="rounded-lg border border-rule px-5 py-4 text-[15px]">
      <p className="font-medium text-ink">Couldn’t load {what} right now.</p>
      <p className="mt-1 text-[15px] text-slate">The rest of this page is unaffected. PRIX shows nothing rather than a guess; this block retries on the next refresh (about 10 minutes).</p>
    </div>
  );
}

export function TokenLink({ id, symbol, sub }: { id: string; symbol: string; sub?: string }) {
  return (
    <Link href={`/token/${encodeURIComponent(id)}`} className="group inline-flex min-h-11 min-w-11 flex-col justify-center">
      <span className="font-medium text-ink transition-colors group-hover:text-accent group-hover:underline">{symbol}</span>
      {sub && <span className="max-w-[180px] truncate text-[13px] text-faint">{sub}</span>}
    </Link>
  );
}

export function Flags({ flags, max = 3 }: { flags: string[]; max?: number }) {
  if (!flags.length) return <span className="text-slate">None</span>;
  return (
    <ul className="grid max-w-[44ch] gap-0.5 text-[13px] leading-snug whitespace-normal text-ink">
      {flags.slice(0, max).map((f) => (
        <li key={f}>{flagText(f)}</li>
      ))}
      {flags.length > max && <li className="text-slate">and {flags.length - max} more</li>}
    </ul>
  );
}

/** Verdict → badge tone, shared by the overview and the thesis page. */
export const VERDICT_TONE = { Supported: "up", "Not supported": "danger", Mixed: "warn", "Insufficient data": "neutral" } as const satisfies Record<string, Tone>;
