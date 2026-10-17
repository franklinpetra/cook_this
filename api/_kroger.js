// Shared pieces for sending missing ingredients to a Kroger-family cart (Kroger, QFC, Fred Meyer, Ralphs…).
//
// Set up at developer.kroger.com: register an app with the redirect URI below, then put its client id and
// secret in Vercel as KROGER_CLIENT_ID and KROGER_CLIENT_SECRET. Shoppers sign in with their own Kroger
// account; their tokens stay in a cookie only this site's server can read.

export const API = "https://api.kroger.com/v1";
export const CLIENT_ID = () => String(process.env.KROGER_CLIENT_ID || "").trim();
const SECRET = () => String(process.env.KROGER_CLIENT_SECRET || "").trim();
export const REDIRECT_URI = () => process.env.KROGER_REDIRECT_URI || "https://cookthis.link/api/kroger/callback";
// Which store's sign-in page and cart people see. A branded version for another Kroger banner changes this.
export const BANNER = () => String(process.env.KROGER_BANNER || "qfc").trim().toLowerCase();

export const krogerReady = () => Boolean(CLIENT_ID() && SECRET());

const COOKIE = "kroger";
const COOKIE_DAYS = 30;

export function readCookie(req, name) {
  const match = String(req.headers.cookie || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return ""; // A mangled cookie counts as no cookie.
  }
}

export function setCookie(res, name, value, maxAgeSeconds) {
  const cookie = `${name}=${encodeURIComponent(value)}; Path=/api/kroger; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
  const existing = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", [...(Array.isArray(existing) ? existing : existing ? [existing] : []), cookie]);
}

/** The shopper's tokens: { access, refresh, expires }, or null if they haven't signed in. */
export function readTokens(req) {
  try {
    const t = JSON.parse(Buffer.from(readCookie(req, COOKIE), "base64url").toString());
    return t?.access ? t : null;
  } catch {
    return null;
  }
}

/** Stores fresh tokens; a refresh that doesn't send a new refresh token keeps the previous one. */
export function saveTokens(res, token, previousRefresh = "") {
  const refresh = token.refresh_token || previousRefresh;
  const value = Buffer.from(JSON.stringify({ access: token.access_token, refresh, expires: Date.now() + (token.expires_in - 60) * 1000 })).toString(
    "base64url",
  );
  setCookie(res, COOKIE, value, COOKIE_DAYS * 86400);
}

export const forgetTokens = (res) => setCookie(res, COOKIE, "", 0);

/** Asks Kroger for a token: signing a shopper in, refreshing their sign-in, or for the app itself. */
export async function token(params) {
  const r = await fetch(`${API}/connect/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID()}:${SECRET()}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.access_token) throw new Error(`Kroger token ${r.status}: ${data.error || ""}`);
  return data;
}
