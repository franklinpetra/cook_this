// POST /api/kroger/cart: finds each missing ingredient at Kroger and adds the best match to the shopper's cart.
// Answers { signIn: true } when the shopper needs to sign in first.

import { API, BANNER, forgetTokens, krogerReady, readTokens, saveTokens, token } from "../_kroger.js";

const CARTS = { qfc: "https://www.qfc.com/cart", fredmeyer: "https://www.fredmeyer.com/cart", ralphs: "https://www.ralphs.com/cart" };
const cartUrl = () => CARTS[BANNER()] || "https://www.kroger.com/cart";

// The app's own token for looking up products, shared across requests until it expires.
let appToken = { value: "", expires: 0 };

async function productToken() {
  if (appToken.expires > Date.now()) return appToken.value;
  const t = await token({ grant_type: "client_credentials", scope: "product.compact" });
  appToken = { value: t.access_token, expires: Date.now() + (t.expires_in - 60) * 1000 };
  return appToken.value;
}

/** The first product Kroger finds for an ingredient name, or null. */
async function findProduct(name, bearer) {
  const params = new URLSearchParams({ "filter.term": name, "filter.limit": "5" });
  const r = await fetch(`${API}/products?${params}`, { headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) return null;
  const product = ((await r.json()).data || []).find((p) => p.upc);
  return product ? { upc: product.upc, description: product.description || name } : null;
}

/** The shopper's access token, refreshed if it has expired. */
async function shopperToken(req, res) {
  const t = readTokens(req);
  if (!t) return null;
  if (t.expires > Date.now()) return t.access;
  if (!t.refresh) return null;
  try {
    const fresh = await token({ grant_type: "refresh_token", refresh_token: t.refresh });
    saveTokens(res, fresh);
    return fresh.access_token;
  } catch {
    forgetTokens(res);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!krogerReady()) return res.status(503).json({ error: "The Kroger cart isn't set up yet." });

  const names = (Array.isArray(req.body?.items) ? req.body.items : [])
    .map((n) => String(n ?? "").trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 30);
  if (!names.length) return res.status(400).json({ error: "Nothing to add." });

  const shopper = await shopperToken(req, res);
  if (!shopper) return res.status(200).json({ signIn: true });

  try {
    const bearer = await productToken();
    const matches = await Promise.all(names.map((name) => findProduct(name, bearer).then((p) => ({ name, product: p }))));
    const found = matches.filter((m) => m.product);
    if (found.length) {
      const r = await fetch(`${API}/cart/add`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${shopper}`, "Content-Type": "application/json" },
        body: JSON.stringify({ items: found.map((m) => ({ upc: m.product.upc, quantity: 1, modality: "PICKUP" })) }),
        signal: AbortSignal.timeout(15_000),
      });
      if (r.status === 401) {
        forgetTokens(res);
        return res.status(200).json({ signIn: true });
      }
      if (!r.ok) throw new Error(`cart add ${r.status}: ${(await r.text()).slice(0, 200)}`);
    }
    return res.status(200).json({
      added: found.map((m) => ({ name: m.name, product: m.product.description })),
      notFound: matches.filter((m) => !m.product).map((m) => m.name),
      cart: cartUrl(),
    });
  } catch (err) {
    console.error("[kroger] cart failed", err.message);
    return res.status(502).json({ error: "Kroger isn't answering right now. Try again in a moment." });
  }
}
