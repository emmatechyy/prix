export async function safe<T>(f: () => Promise<T>): Promise<{ ok: true; v: T } | { ok: false; e: string }> {
  try {
    return { ok: true, v: await f() };
  } catch (e) {
    return { ok: false, e: e instanceof Error ? e.message : "error" };
  }
}
