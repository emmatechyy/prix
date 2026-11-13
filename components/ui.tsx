import Link from "next/link";
import type { ReactNode } from "react";
import { NR, pct } from "@/lib/format";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-lg border border-border bg-surface ${className}`}>{children}</section>;
}

export function CardHeader({ title, subtitle, right, id }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; id?: string }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <h2 id={id} className="text-[13px] font-semibold tracking-tight text-text">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0 text-xs text-muted">{right}</div>}
    </header>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text sm:text-[28px]">{title}</h1>
      {children && <div className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone, source }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "up" | "down" | "warn"; source?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] leading-tight font-medium uppercase tracking-[0.08em] text-faint">{label}</p>
        {source && <SourceLink href={source} compact />}
      </div>
      <p className="num mt-1.5 truncate text-xl font-medium text-text">{value}</p>
      {sub && <p className={`num mt-0.5 text-xs leading-snug ${tone === "up" ? "text-accent" : tone === "down" ? "text-danger" : tone === "warn" ? "text-warn" : "text-muted"}`}>{sub}</p>}
    </div>
  );
}

export function Delta({ v, digits = 1 }: { v: number | null | undefined; digits?: number }) {
  if (v == null || !Number.isFinite(v)) return <span className="text-faint">{NR}</span>;
  const cls = v > 0 ? "text-accent" : v < 0 ? "text-danger" : "text-muted";
  return <span className={`num ${cls}`}>{pct(v, digits, true)}</span>;
}

export function Badge({ children, tone = "neutral", title }: { children: ReactNode; tone?: "neutral" | "accent" | "warn" | "danger" | "info"; title?: string }) {
  const map = {
    neutral: "border-border-strong text-muted",
    accent: "border-accent/40 text-accent bg-accent/5",
    warn: "border-warn/40 text-warn bg-warn/5",
    danger: "border-danger/40 text-danger bg-danger/5",
    info: "border-info/40 text-info bg-info/5",
  } as const;
  return (
    <span title={title} className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] leading-none font-medium whitespace-nowrap ${map[tone]}`}>
      {children}
    </span>
  );
}

export function NotReported({ why }: { why?: string }) {
  return (
    <span className="text-faint" title={why}>
      {NR}
    </span>
  );
}

export function ScoreBar({ score, size = "md" }: { score: number | null; size?: "sm" | "md" }) {
  if (score == null) return <NotReported why="Less than half of the score's weight had data" />;
  const color = score >= 60 ? "bg-accent" : score >= 35 ? "bg-warn" : "bg-danger";
  return (
    <div className="flex items-center gap-2" aria-label={`Score ${score} of 100`}>
      <span className={`num ${size === "md" ? "w-9 text-sm" : "w-8 text-xs"} text-right text-text`}>{score.toFixed(1)}</span>
      <span className={`relative ${size === "md" ? "h-1.5 w-20" : "h-1 w-14"} overflow-hidden rounded-full bg-border`} aria-hidden>
        <span className={`absolute inset-y-0 left-0 ${color}`} style={{ width: `${Math.max(2, score)}%` }} />
      </span>
    </div>
  );
}

export function SourceLink({ href, compact, label }: { href: string; compact?: boolean; label?: string }) {
  const isUrl = /^https?:\/\//.test(href) && !/<|%3C/i.test(href);
  if (!isUrl) return <span className="num text-[11px] text-faint">{label ?? decodeURIComponent(href)}</span>;
  const host = new URL(href).host;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-[11px] text-faint hover:text-info" title={href}>
      <span className="whitespace-nowrap">{compact ? "src ↗" : (label ?? host) + " ↗"}</span>
    </a>
  );
}

export function Sources({ urls, note }: { urls: string[]; note?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-2 text-[11px] text-faint">
      <span className="uppercase tracking-[0.08em]">Sources</span>
      {urls.map((u) => (
        <SourceLink key={u} href={u} label={decodeURIComponent(u.replace(/^https?:\/\//, "").split("?")[0])} />
      ))}
      {note && <span className="w-full text-faint sm:w-auto">{note}</span>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium text-text">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted">{children}</p>}
    </div>
  );
}

export function SourceError({ what, error }: { what: string; error: string }) {
  return (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm">
      <p className="font-medium text-danger">{what} is unavailable right now</p>
      <p className="mt-0.5 text-xs text-muted">Upstream error: {error}. PRIX shows nothing rather than a guess; the page retries on the next refresh.</p>
    </div>
  );
}

export function TokenLink({ id, symbol, sub }: { id: string; symbol: string; sub?: string }) {
  return (
    <Link href={`/token/${encodeURIComponent(id)}`} className="group inline-flex min-w-0 flex-col">
      <span className="font-medium text-text group-hover:text-accent">{symbol}</span>
      {sub && <span className="max-w-[180px] truncate text-[11px] text-faint">{sub}</span>}
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
