// GET /api/kroger/login: sends the shopper to Kroger to sign in and allow Cook This to add to their cart.

import { randomBytes } from "node:crypto";
import { BANNER, CLIENT_ID, krogerReady, REDIRECT_URI, setCookie } from "../_kroger.js";

export default function handler(req, res) {
  if (!krogerReady()) return res.redirect(302, "/?kroger=unavailable");
  const state = randomBytes(16).toString("hex");
  setCookie(res, "kroger_state", state, 600);
  const params = new URLSearchParams({
    scope: "cart.basic:write",
    response_type: "code",
    client_id: CLIENT_ID(),
    redirect_uri: REDIRECT_URI(),
    state,
    banner: BANNER(),
  });
  res.redirect(302, `https://api.kroger.com/v1/connect/oauth2/authorize?${params}`);
}
