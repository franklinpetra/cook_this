// POST /api/instacart: turns the ingredients someone is missing into an Instacart page where they pick a
// store (Kroger, QFC, Safeway, Costco…) and add everything to their cart in one tap.
//
// Uses the Instacart Developer Platform. INSTACART_API_KEY comes from the Instacart developer dashboard;
// set INSTACART_ENV to "production" once Instacart activates a production key. Affiliate tracking is added
// to the returned link by Instacart itself, so nothing about it is set here.

const BASE = process.env.INSTACART_ENV === "production" ? "https://connect.instacart.com" : "https://connect.dev.instacart.tools";
const KEY = () => String(process.env.INSTACART_API_KEY || "").trim();
const SITE = "https://cookthis.link";

// The same recipe and shopping list always gets the same page, so repeat taps don't call Instacart again.
const pages = new Map();
const MAX_CACHED = 500;

const text = (s, max) => String(s ?? "").trim().slice(0, max);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!KEY()) return res.status(503).json({ error: "Instacart isn't set up yet." });

  const body = req.body || {};
  const title = text(body.title, 120);
  const image = /^https:\/\/www\.themealdb\.com\//.test(body.image) ? body.image : undefined;
  const items = (Array.isArray(body.items) ? body.items : [])
    .map((i) => ({ name: text(i?.name, 60), measure: text(i?.measure, 40) }))
    .filter((i) => i.name)
    .slice(0, 30);
  if (!title || !items.length) return res.status(400).json({ error: "Send a recipe title and at least one ingredient." });

  const cacheKey = JSON.stringify([title, items]);
  if (pages.has(cacheKey)) return res.status(200).json({ url: pages.get(cacheKey) });

  try {
    const r = await fetch(`${BASE}/idp/v1/products/recipe`, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        image_url: image,
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
      return res.status(502).json({ error: "Instacart isn't answering right now. The store links below still work." });
    }
    if (pages.size >= MAX_CACHED) pages.delete(pages.keys().next().value);
    pages.set(cacheKey, data.products_link_url);
    return res.status(200).json({ url: data.products_link_url });
  } catch (err) {
    console.error("[instacart] failed", err?.name || err);
    return res.status(502).json({ error: "Instacart isn't answering right now. The store links below still work." });
  }
}
