export const NR = "Not reported";

export function usd(v: number | null | undefined, opts: { compact?: boolean; digits?: number } = {}): string {
  if (v == null || !Number.isFinite(v)) return NR;
  const { compact = true } = opts;
  const abs = Math.abs(v);
  if (compact && abs >= 1000) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 }).format(v);
  }
  const digits = opts.digits ?? (abs >= 1 ? 2 : abs >= 0.01 ? 4 : 8);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits, minimumFractionDigits: Math.min(2, digits) }).format(v);
}

export function price(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return NR;
  if (v >= 1) return usd(v, { compact: false, digits: 4 });
  if (v === 0) return "$0";
  const digits = Math.min(12, Math.max(4, -Math.floor(Math.log10(v)) + 3));
  return "$" + v.toFixed(digits);
}

export function num(v: number | null | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return NR;
  if (Math.abs(v) >= 10000) return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(v);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(v);
}

export function pct(v: number | null | undefined, digits = 2, signed = false): string {
  if (v == null || !Number.isFinite(v)) return NR;
  const s = (v * 100).toFixed(digits) + "%";
  return signed && v > 0 ? "+" + s : s;
}

export function shortId(id: string, n = 10): string {
  if (id.length <= n + 6) return id;
  return id.slice(0, n) + "…" + id.slice(-4);
}

export function ago(iso: string | number | null | undefined, now = Date.now()): string {
  if (iso == null) return NR;
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  if (!Number.isFinite(t)) return NR;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function utc(iso: string | number): string {
  const d = new Date(iso);
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

/** Convert an integer string amount with `decimals` into a JS number (precision loss acceptable for analytics). */
export function units(raw: string | number | bigint | null | undefined, decimals: number): number {
  if (raw == null) return NaN;
  const s = String(raw).split(".")[0];
  if (!/^-?\d+$/.test(s)) return NaN;
  const neg = s.startsWith("-");
  const digits = neg ? s.slice(1) : s;
  const padded = digits.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, padded.length - decimals);
  const frac = padded.slice(padded.length - decimals, padded.length - decimals + 18);
  const v = Number(`${intPart}.${frac || "0"}`);
  return neg ? -v : v;
}

export const explorer = {
  tx: (hash: string) => `https://nearblocks.io/txns/${hash}`,
  account: (id: string) => `https://nearblocks.io/address/${id}`,
  token: (id: string) => `https://nearblocks.io/token/${id}`,
  receipt: (id: string) => `https://nearblocks.io/?q=${id}`,
  rheaPool: (id: string) => (id.includes("|") ? `https://app.rhea.finance/poolV2/${id.replace(/\|/g, "@")}` : `https://app.rhea.finance/pool/${id}`),
};

/** Request time for server-rendered freshness lines (ISR re-renders every few minutes). */
export const nowMs = () => Date.now();
