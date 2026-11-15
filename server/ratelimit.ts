// Tiny in-memory sliding-window rate limit per client IP (one process; enough for the demo server).
import type { Context } from "hono";

const hits = new Map<string, number[]>();

/** The caller's IP: the LAST X-Forwarded-For hop (the one our proxy added; earlier hops are client-supplied and
 *  could be forged to dodge the limit), else the socket address. */
export function clientIp(c: Context): string {
  const xff = c.req.header("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean).pop();
  if (xff) return xff;
  const remote = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket?.remoteAddress;
  return remote || "local";
}

/** true when allowed (and counts the hit); false when `max` hits already happened in the last `windowMs`. */
export function allow(bucket: string, ip: string, max: number, windowMs: number, now = Date.now()): boolean {
  if (max <= 0) return true;
  const key = `${bucket}:${ip}`;
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 50_000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return true;
}

export const resetRateLimits = () => hits.clear();
