// POST /api/instacart: turns the ingredients someone is missing into an Instacart page where they pick a
// store (Kroger, QFC, Safeway, Costco…) and add everything to their cart in one tap.
//
// Uses the Instacart Developer Platform. INSTACART_API_KEY comes from the Instacart developer dashboard;
// set INSTACART_ENV to "production" once Instacart activates a production key. Affiliate tracking is added
// to the returned link by Instacart itself, so nothing about it is set here.
//
// The page sends only a TheMealDB recipe id and the names of the missing ingredients. The title, photo, and
// measures come from TheMealDB here, and only that recipe's own ingredients are allowed, so nobody can use
// our key to publish pages with text of their choosing.

import { clientIp, sameSite, underLimit } from "./_guard.js";
import { ingredientsOf, lookupMeal } from "./_mealdb.js";

const BASE = process.env.INSTACART_ENV === "production" ? "https://connect.instacart.com" : "https://connect.dev.instacart.tools";
const KEY = () => String(process.env.INSTACART_API_KEY || "").trim();
const SITE = "https://cookthis.link";
const PER_VISITOR_PER_DAY = 40;

// The same recipe and shopping list always gets the same page, so repeat taps don't call Instacart again.
const pages = new Map();
const MAX_CACHED = 500;

const BUSY = "Instacart isn't answering right now. The store links below still work.";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!sameSite(req)) return res.status(403).json({ error: "Not allowed from this site." });
  if (!KEY()) return res.status(503).json({ error: "Instacart isn't set up yet." });

  const meal = await lookupMeal(String(req.body?.id ?? ""));
  if (!meal) return res.status(400).json({ error: "That recipe wasn't found." });
  const wanted = new Set((Array.isArray(req.body?.items) ? req.body.items : []).map((n) => String(n ?? "").trim().toLowerCase()));
  const items = ingredientsOf(meal).filter((i) => wanted.has(i.name.toLowerCase()));
  if (!items.length) return res.status(400).json({ error: "Nothing to shop for." });

  const cacheKey = JSON.stringify([meal.idMeal, items.map((i) => i.name)]);
  if (pages.has(cacheKey)) return res.status(200).json({ url: pages.get(cacheKey) });
  if (!(await underLimit("instacart", clientIp(req), PER_VISITOR_PER_DAY))) {
    return res.status(429).json({ error: "That's a lot of shopping lists for one day. The store links below still work." });
  }

  try {
    const r = await fetch(`${BASE}/idp/v1/products/recipe`, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: meal.strMeal,
        image_url: /^https:\/\/www\.themealdb\.com\//.test(meal.strMealThumb || "") ? meal.strMealThumb : undefined,
        link_type: "recipe",
        // Only what they're missing: Cook This already knows what's in their kitchen.
        ingredients: items.map((i) => ({ name: i.name, display_text: i.measure ? `${i.name} (${i.measure})` : i.name })),
        landing_page_configuration: { partner_linkback_url: SITE, enable_pantry_items: false },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.products_link_url) {
      console.error("[instacart]", r.status, JSON.stringify(data).slice(0, 300));
      return res.status(502).json({ error: BUSY });
    }
    if (pages.size >= MAX_CACHED) pages.delete(pages.keys().next().value);
    pages.set(cacheKey, data.products_link_url);
    return res.status(200).json({ url: data.products_link_url });
  } catch (err) {
    console.error("[instacart] failed", err?.name || err);
    return res.status(502).json({ error: BUSY });
  }
}
