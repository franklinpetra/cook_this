// Shared protections for the endpoints that cost money or write data: same-site checks and daily limits.
// Limits are counted in Redis when it's connected, so they hold across every server instance; without it
// they fall back to this instance's memory.

import { redis, redisReady } from "./_redis.js";

/** True for requests from our own pages. Same-origin form posts and some browsers omit Origin. */
export function sameSite(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/** The visitor's address, with IPv6 grouped by /64 so one household can't rotate through addresses. */
export function clientIp(req) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (!ip.includes(":")) return ip;
  if (ip.includes(".")) return ip.slice(ip.lastIndexOf(":") + 1); // IPv4 written as IPv6 (::ffff:1.2.3.4)
  // Expand "::" first, so 2001:db8::5 and 2001:db8:0:0::6 land in the same /64.
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...front, ...Array(Math.max(0, 8 - front.length - back.length)).fill("0"), ...back] : front;
  return groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":");
}

const memory = { day: "", counts: new Map() };

/** Counts one use of `bucket` by `who` today; true while that stays at or under `max`. */
export async function underLimit(bucket, who, max) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `rl:${bucket}:${day}:${who}`;
  if (redisReady()) {
    try {
      const [count] = await redis([["INCR", key], ["EXPIRE", key, 2 * 86400]]);
      return count <= max;
    } catch {
      // Fall through to memory if Redis is unreachable.
    }
  }
  if (memory.day !== day) Object.assign(memory, { day, counts: new Map() });
  const count = (memory.counts.get(key) ?? 0) + 1;
  memory.counts.set(key, count);
  return count <= max;
}
