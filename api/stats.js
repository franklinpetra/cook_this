// GET /api/stats: the usage counts for the last 30 days, for stats.html.
// Needs the STATS_TOKEN set in Vercel, sent as "Authorization: Bearer <token>".

import { redis, redisReady } from "./_redis.js";

const DAYS = 30;
const TOP = 25;

/** Redis returns hashes and scored lists as flat [key, value, key, value…] arrays. */
const pairs = (flat) => {
  const out = [];
  for (let i = 0; i < (flat?.length ?? 0); i += 2) out.push([flat[i], Number(flat[i + 1])]);
  return out;
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const token = process.env.STATS_TOKEN || "";
  if (!token || req.headers.authorization !== `Bearer ${token}`) return res.status(401).json({ error: "Wrong or missing stats password." });
  if (!redisReady()) return res.status(503).json({ error: "Usage storage isn't connected yet." });

  const days = Array.from({ length: DAYS }, (_, i) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  const results = await redis([
    ...days.flatMap((d) => [["HGETALL", `d:${d}`], ["PFCOUNT", `u:${d}`]]),
    ["ZREVRANGE", "top:have", 0, TOP - 1, "WITHSCORES"],
    ["ZREVRANGE", "top:need", 0, TOP - 1, "WITHSCORES"],
    ["ZREVRANGE", "top:recipes", 0, TOP - 1, "WITHSCORES"],
  ]);
  const daily = days.map((day, i) => ({ day, visitors: Number(results[i * 2 + 1]) || 0, counts: Object.fromEntries(pairs(results[i * 2])) }));
  const [have, need, recipes] = results.slice(DAYS * 2).map(pairs);
  return res.status(200).json({ daily, have, need, recipes });
}
