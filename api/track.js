// POST /api/track: counts what people do, so we know how Cook This is used.
//
// Only counts are kept: how many searches, recipe opens, and store clicks each day, plus which ingredients
// people have and which they're missing. No names, emails, IP addresses, or cookies. A random id from the
// browser is added to a daily unique-visitor estimate (a HyperLogLog), which can't be read back out.
//
// Everything written is checked first, so nobody can fill the stats with made-up text: ingredients must be
// real TheMealDB ingredients, recipes are stored by their TheMealDB id, and store names come from brand.js.

import { STORES } from "../brand.js";
import { clientIp, sameSite, underLimit } from "./_guard.js";
import { knownIngredients } from "./_mealdb.js";
import { redis, redisReady } from "./_redis.js";

const EVENTS = new Set(["visit", "search", "scan", "open", "shop", "copy", "save", "print", "video", "nyt", "instacart", "kroger", "veg", "surprise"]);
const STORE_NAMES = new Set(STORES.map((s) => s.name));
const KEEP_DAYS = 400;
const PER_VISITOR_PER_DAY = 300;
const VISITOR_ID = /^[0-9a-f-]{36}$/i;

/** The real ingredient names in a list, lowercased so "Rice" and "rice" count together. */
async function realIngredients(xs) {
  if (!Array.isArray(xs)) return [];
  const known = await knownIngredients();
  if (!known) return [];
  const names = xs.map((x) => String(x ?? "").trim().toLowerCase()).filter((x) => known.has(x));
  return [...new Set(names)].slice(0, 15);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  if (!redisReady() || !sameSite(req)) return res.status(204).end();

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
  if (!(await underLimit("track", clientIp(req), PER_VISITOR_PER_DAY))) return res.status(204).end();

  const day = new Date().toISOString().slice(0, 10);
  const ttl = KEEP_DAYS * 86400;
  const commands = [
    ["HINCRBY", `d:${day}`, event, 1],
    ["EXPIRE", `d:${day}`, ttl],
  ];
  if (event === "shop" && STORE_NAMES.has(body.detail)) commands.push(["HINCRBY", `d:${day}`, `shop:${body.detail}`, 1]);
  const visitor = String(body.visitor || "");
  // Visitors are counted once per page load, and one address can't invent hundreds of them.
  if (event === "visit" && VISITOR_ID.test(visitor) && (await underLimit("visitors", clientIp(req), 20))) commands.push(["PFADD", `u:${day}`, visitor], ["EXPIRE", `u:${day}`, ttl]);
  // What people have, what they cook, and what they need to buy: the numbers a grocer cares about.
  if (event === "search") for (const i of await realIngredients(body.have)) commands.push(["ZINCRBY", "top:have", 1, i]);
  if (event === "open" && /^\d{1,8}$/.test(String(body.id))) commands.push(["ZINCRBY", "top:recipes", 1, String(body.id)]);
  if (event === "open") for (const i of await realIngredients(body.need)) commands.push(["ZINCRBY", "top:need", 1, i]);

  try {
    await redis(commands);
  } catch (err) {
    console.error("[track]", err.message);
  }
  return res.status(204).end();
}
