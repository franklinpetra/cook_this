// POST /api/track: counts what people do, so we know how Cook This is used.
//
// Only counts are kept: how many searches, recipe opens, and store clicks each day, plus which ingredients
// people have and which they're missing. No names, emails, IP addresses, or cookies. A random id from the
// browser is added to a daily unique-visitor estimate (a HyperLogLog), which can't be read back out.

import { redis, redisReady } from "./_redis.js";

const EVENTS = new Set(["visit", "search", "scan", "open", "shop", "copy", "save", "print", "video", "nyt", "instacart", "kroger", "veg", "surprise"]);
const KEEP_DAYS = 400;
const PER_VISITOR_PER_DAY = 400;

const usage = { day: "", byVisitor: new Map() };

function allow(visitor, day) {
  if (usage.day !== day) Object.assign(usage, { day, byVisitor: new Map() });
  const used = usage.byVisitor.get(visitor) ?? 0;
  usage.byVisitor.set(visitor, used + 1);
  return used < PER_VISITOR_PER_DAY;
}

const clean = (s) => String(s ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
// Ingredient names are lowercased so "Rice" and "rice" count together.
const list = (xs) => (Array.isArray(xs) ? [...new Set(xs.map((x) => clean(x).toLowerCase()).filter(Boolean))].slice(0, 20) : []);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  if (!redisReady()) return res.status(204).end();

  // sendBeacon posts plain text, so the body may arrive as a string.
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).end();
    }
  }
  const event = String(body?.event || "");
  if (!EVENTS.has(event)) return res.status(400).end();

  const day = new Date().toISOString().slice(0, 10);
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (!allow(ip, day)) return res.status(204).end();

  const ttl = KEEP_DAYS * 86400;
  const detail = clean(body.detail);
  const commands = [
    ["HINCRBY", `d:${day}`, event, 1],
    ["EXPIRE", `d:${day}`, ttl],
  ];
  if (detail) commands.push(["HINCRBY", `d:${day}`, `${event}:${detail}`, 1]);
  const visitor = String(body.visitor || "").slice(0, 40);
  if (visitor) commands.push(["PFADD", `u:${day}`, visitor], ["EXPIRE", `u:${day}`, ttl]);
  // What people have, what they cook, and what they need to buy: the numbers a grocer cares about.
  if (event === "search") for (const i of list(body.have)) commands.push(["ZINCRBY", "top:have", 1, i]);
  if (event === "open" && detail) commands.push(["ZINCRBY", "top:recipes", 1, detail]);
  if (event === "open") for (const i of list(body.need)) commands.push(["ZINCRBY", "top:need", 1, i]);

  try {
    await redis(commands);
  } catch (err) {
    console.error("[track]", err.message);
  }
  return res.status(204).end();
}
