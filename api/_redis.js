// A tiny client for the Upstash Redis store that holds usage counts (see api/track.js).
// Vercel fills these in when an Upstash database is connected to the project under Storage.
// Files starting with "_" aren't published as their own endpoints.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export const redisReady = () => Boolean(URL_ && TOKEN);

/** Runs several Redis commands in one request; returns each command's result. */
export async function redis(commands) {
  const r = await fetch(`${URL_}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(5_000),
  });
  if (!r.ok) throw new Error(`Redis answered ${r.status}`);
  return (await r.json()).map((x) => x.result);
}
