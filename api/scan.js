// POST /api/scan: finds the food in a photo of a pantry, fridge, or cupboard.
//
// The photo goes to a vision model through OpenRouter and is never saved or logged here.
// Requests go only to providers that don't keep or train on data. Limits keep a stranger
// from running up the bill: each visitor gets a few scans a day, the whole site has a daily
// ceiling (both counted in Redis, so they hold across server instances), and the OpenRouter
// key itself has a spending cap set in OpenRouter.

import { clientIp, sameSite, underLimit } from "./_guard.js";

const MODEL = process.env.COOK_THIS_VISION_MODEL || "google/gemini-3.8-flash";
const PER_VISITOR_PER_DAY = 15;
const SITE_PER_DAY = 400;
const MAX_IMAGE_CHARS = 3_000_000; // about 2.2 MB of JPEG once base64-encoded

/** The key as pasted into Vercel, forgiving stray spaces, quotes, or a leading "OPENROUTER_API_KEY=". */
function apiKey() {
  return String(process.env.OPENROUTER_API_KEY || "")
    .trim()
    .replace(/^OPENROUTER_API_KEY\s*=\s*/, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

const PROMPT = `You look at one photo of someone's kitchen: a pantry shelf, fridge, cupboard, or counter.
List the food ingredients you can actually see. Use plain grocery names a recipe would use, such as "eggs", "cheddar cheese", "chickpeas", "spinach", "chicken breast". When a label is readable, use what it says. Skip anything that isn't food or a cooking ingredient (dishes, appliances, cleaning products), and skip drinks unless they're for cooking (milk, wine, stock).
Mark "sure" true only when the item is clearly visible or labeled. Never guess what might be behind a door or inside an unlabeled container. Return at most 20 items, most prominent first. If the photo shows no food, return an empty list.`;

const SCHEMA = {
  type: "object",
  properties: {
    ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, sure: { type: "boolean" } },
        required: ["name", "sure"],
        additionalProperties: false,
      },
    },
  },
  required: ["ingredients"],
  additionalProperties: false,
};

/** The model's JSON answer, tolerating code fences or stray text around it. */
function readJson(text) {
  if (typeof text !== "string") return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!sameSite(req)) return res.status(403).json({ error: "Not allowed from this site." });
  const key = apiKey();
  if (!key) return res.status(503).json({ error: "The photo scanner isn't set up yet." });

  const image = req.body?.image;
  if (typeof image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(image)) {
    return res.status(400).json({ error: "Send one photo as a JPEG, PNG, or WebP." });
  }
  if (image.length > MAX_IMAGE_CHARS) return res.status(413).json({ error: "That photo is too large." });

  if (!(await underLimit("scan", clientIp(req), PER_VISITOR_PER_DAY))) {
    return res.status(429).json({ error: "You've used today's photo scans. You can still type your ingredients." });
  }
  if (!(await underLimit("scan", "site", SITE_PER_DAY))) {
    return res.status(429).json({ error: "The photo scanner is resting for today. You can still type your ingredients." });
  }

  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Title": "Cook This",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        max_tokens: 2000,
        reasoning: { effort: "low" },
        // Only providers that don't store or train on what they're sent.
        provider: { data_collection: "deny", require_parameters: true },
        response_format: { type: "json_schema", json_schema: { name: "pantry", strict: true, schema: SCHEMA } },
        messages: [
          { role: "system", content: PROMPT },
          { role: "user", content: [{ type: "image_url", image_url: { url: image } }] },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!r.ok) {
      // The key's shape helps diagnose setup problems without ever logging the key itself.
      console.error("[scan] model error", r.status, (await r.text()).slice(0, 300), `key: ${key.length} chars, ${key.startsWith("sk-or-") ? "sk-or- prefix" : "unexpected prefix"}`);
      return res.status(502).json({ error: "The photo scanner is having trouble. Try again in a moment." });
    }
    const data = await r.json();
    const parsed = readJson(data.choices?.[0]?.message?.content);
    if (!parsed) {
      console.error("[scan] unreadable answer", data.choices?.[0]?.finish_reason);
      return res.status(502).json({ error: "The photo scanner is having trouble. Try again in a moment." });
    }
    const seen = new Set();
    const ingredients = (parsed.ingredients || [])
      .map((i) => ({ name: String(i.name || "").trim().slice(0, 40), sure: i.sure === true }))
      .filter((i) => i.name && !seen.has(i.name.toLowerCase()) && seen.add(i.name.toLowerCase()))
      .slice(0, 20);
    return res.status(200).json({ ingredients });
  } catch (err) {
    console.error("[scan] failed", err?.name || err);
    return res.status(502).json({ error: "The photo scanner is having trouble. Try again in a moment." });
  }
}
