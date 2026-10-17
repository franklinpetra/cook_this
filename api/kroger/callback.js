// GET /api/kroger/callback: where Kroger sends the shopper back after they sign in.

import { readCookie, REDIRECT_URI, saveTokens, setCookie, token } from "../_kroger.js";

export default async function handler(req, res) {
  const { code, state, error } = req.query;
  const expected = readCookie(req, "kroger_state");
  setCookie(res, "kroger_state", "", 0);
  if (error || !code || !state || state !== expected) return res.redirect(302, "/?kroger=cancelled");
  try {
    saveTokens(res, await token({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI() }));
    return res.redirect(302, "/?kroger=connected");
  } catch (err) {
    console.error("[kroger] sign-in failed", err.message);
    return res.redirect(302, "/?kroger=failed");
  }
}
