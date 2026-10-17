// GET /api/stats: the usage counts for the last 30 days, for stats.html.
// Needs the STATS_TOKEN set in Vercel, sent as "Authorization: Bearer <token>".

import { createHash, timingSafeEqual } from "node:crypto";
import { lookupMeal } from "./_mealdb.js";
import { redis, redisReady } from "./_redis.js";

const DAYS = 30;
const TOP = 25;

/** Redis returns hashes and scored lists as flat [key, value, key, value…] arrays. */
const pairs = (flat) => {
  const out = [];
  for (let i = 0; i < (flat?.length ?? 0); i += 2) out.push([flat[i], Number(flat[i + 1])]);
  return out;
};

/** Compares the password without leaking, through timing, how much of it matched. */
const digest = (s) => createHash("sha256").update(String(s)).digest();
const matches = (given, expected) => timingSafeEqual(digest(given), digest(expected));

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const token = process.env.STATS_TOKEN || "";
  if (!token || !matches(req.headers.authorization || "", `Bearer ${token}`)) return res.status(401).json({ error: "Wrong or missing stats password." });
  if (!redisReady()) return res.status(503).json({ error: "Usage storage isn't connected yet." });

  const days = Array.from({ length: DAYS }, (_, i) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  const results = await redis([
    ...days.flatMap((d) => [["HGETALL", `d:${d}`], ["PFCOUNT", `u:${d}`]]),
    ["ZREVRANGE", "top:have", 0, TOP - 1, "WITHSCORES"],
    ["ZREVRANGE", "top:need", 0, TOP - 1, "WITHSCORES"],
    ["ZREVRANGE", "top:recipes", 0, TOP - 1, "WITHSCORES"],
  ]);
  const daily = days.map((day, i) => ({ day, visitors: Number(results[i * 2 + 1]) || 0, counts: Object.fromEntries(pairs(results[i * 2])) }));
  const [have, need, recipeIds] = results.slice(DAYS * 2).map(pairs);
  // Recipes are counted by TheMealDB id; show their names.
  const recipes = await Promise.all(recipeIds.map(async ([id, n]) => [/^\d+$/.test(id) ? (await lookupMeal(id))?.strMeal || `Recipe ${id}` : id, n]));
  return res.status(200).json({ daily, have, need, recipes });
}
