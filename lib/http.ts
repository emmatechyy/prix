import "server-only";

/** A value fetched from an upstream source, with provenance. */
export type Sourced<T> =
  | { ok: true; data: T; source: string; fetchedAt: string }
  | { ok: false; error: string; source: string; fetchedAt: string };

const UA = "PRIX/1.0 (+https://github.com/; read-only NEAR analytics)";

export class SourceError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly status?: number,
    public readonly retryAfter?: number,
  ) {
    super(message);
  }
}

/**
 * GET/POST JSON with a timeout and Next.js data-cache revalidation.
 * Never logs secrets: only the URL path (no query string with keys) is reported.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetchJson with up to 2 retries on HTTP 429 / 5xx (backoff honours Retry-After, capped at 8s). */
export async function fetchJson<T>(url: string, opts: Parameters<typeof fetchJsonOnce>[1] = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchJsonOnce<T>(url, opts);
    } catch (e) {
      const st = e instanceof SourceError ? e.status : undefined;
      const retryable = st === 429 || (st != null && st >= 500);
      if (!retryable || attempt >= 2) throw e;
      const ra = e instanceof SourceError ? e.retryAfter : undefined;
      await sleep(Math.min(8000, ra != null ? ra * 1000 : 1500 * 2 ** attempt + Math.random() * 500));
    }
  }
}

async function fetchJsonOnce<T>(
  url: string,
  opts: {
    revalidate?: number;
    timeoutMs?: number;
    method?: "GET" | "POST";
    body?: unknown;
    headers?: Record<string, string>;
    tags?: string[];
  } = {},
): Promise<T> {
  const { revalidate = 600, timeoutMs = 15000, method = "GET", body, headers = {} } = opts;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: {
        accept: "application/json",
        "user-agent": UA,
        ...(body ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      next: { revalidate, tags: opts.tags },
    });
    if (!res.ok) {
      const ra = Number(res.headers.get("retry-after"));
      throw new SourceError(`HTTP ${res.status}`, url, res.status, Number.isFinite(ra) && ra > 0 ? ra : undefined);
    }
    const text = await res.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new SourceError("Invalid JSON", url, res.status);
    }
  } catch (e) {
    if (e instanceof SourceError) throw e;
    const msg = e instanceof Error ? (e.name === "AbortError" ? "Timed out" : e.message) : "Request failed";
    throw new SourceError(msg, url);
  } finally {
    clearTimeout(timer);
  }
}

export async function sourced<T>(source: string, fn: () => Promise<T>): Promise<Sourced<T>> {
  const fetchedAt = new Date().toISOString();
  try {
    return { ok: true, data: await fn(), source, fetchedAt };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error", source, fetchedAt };
  }
}

/** Run async tasks with bounded concurrency; failures resolve to undefined. */
export async function mapLimit<I, O>(items: I[], limit: number, fn: (item: I, i: number) => Promise<O>): Promise<(O | undefined)[]> {
  const out: (O | undefined)[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i], i);
      } catch {
        out[i] = undefined;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Plain Node HTTPS GET (bypasses the patched fetch). Used only for responses larger than the
 * Next.js data-cache item limit, which are memoised in-process by the caller instead.
 */
export async function getJsonRaw<T>(url: string, timeoutMs = 25000): Promise<T> {
  const https = await import("node:https");
  const zlib = await import("node:zlib");
  return new Promise<T>((resolve, reject) => {
    const req = https.get(url, { headers: { accept: "application/json", "accept-encoding": "gzip", "user-agent": UA }, timeout: timeoutMs }, (res) => {
      if ((res.statusCode ?? 500) >= 400) {
        res.resume();
        return reject(new SourceError(`HTTP ${res.statusCode}`, url, res.statusCode));
      }
      const stream = res.headers["content-encoding"] === "gzip" ? res.pipe(zlib.createGunzip()) : res;
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as T);
        } catch {
          reject(new SourceError("Invalid JSON", url));
        }
      });
      stream.on("error", (e: Error) => reject(new SourceError(e.message, url)));
    });
    req.on("timeout", () => req.destroy(new Error("Timed out")));
    req.on("error", (e) => reject(new SourceError(e.message, url)));
  });
}
