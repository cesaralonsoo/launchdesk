// Tiny in-memory sliding-window rate limit per client IP (one process; enough for the demo server).
import type { Context } from "hono";
import { config } from "./config.js";

const hits = new Map<string, number[]>();

/** Private, loopback and link-local addresses: always a proxy inside the host's network, never a public visitor. */
export const isPrivateIp = (ip: string) =>
  /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd][0-9a-f]{2}:|fe80:|::ffff:(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.))/i.test(ip);

/**
 * R1: the visitor's address from an X-Forwarded-For value. Each proxy in front of us appends the address it saw,
 * so the visitor is `hops` entries from the right (earlier entries are client-supplied and can be forged).
 * `skipPrivate` first drops trailing private addresses (internal load balancers). Clamped to the first entry.
 */
export function pickClientIp(xff: string | undefined, hops: number, skipPrivate: boolean): string | null {
  if (!xff || hops <= 0) return null;
  const list = xff.split(",").map((s) => s.trim()).filter(Boolean);
  if (skipPrivate) while (list.length > 1 && isPrivateIp(list[list.length - 1]!)) list.pop();
  if (!list.length) return null;
  return list[Math.max(0, list.length - hops)]!;
}

const seenShapes = new Set<number>();
/** The caller's IP (TRUST_PROXY_HOPS, see config.ts), else the socket address. */
export function clientIp(c: Context): string {
  const raw = c.req.header("x-forwarded-for");
  if (raw && config.production && seenShapes.size < 4) {
    // R1 check after a deploy: log how many hops the proxy sends (never the addresses themselves).
    const n = raw.split(",").filter((s) => s.trim()).length;
    if (!seenShapes.has(n)) {
      seenShapes.add(n);
      console.log(`[ratelimit] X-Forwarded-For has ${n} hop(s); TRUST_PROXY_HOPS=${config.trustProxyHops}, skip private=${config.proxySkipPrivate}`);
    }
  }
  const ip = pickClientIp(raw, config.trustProxyHops, config.proxySkipPrivate);
  if (ip) return ip;
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
