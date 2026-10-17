// GET /api/config: which optional services are switched on, so the page only shows buttons that work.

import { BANNER, krogerReady } from "./_kroger.js";

const BANNER_NAMES = { qfc: "QFC", fredmeyer: "Fred Meyer", ralphs: "Ralphs", kroger: "Kroger" };

export default function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({
    instacart: Boolean(String(process.env.INSTACART_API_KEY || "").trim()),
    kroger: krogerReady() ? BANNER_NAMES[BANNER()] || "Kroger" : null,
  });
}
