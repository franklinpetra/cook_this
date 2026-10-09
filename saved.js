// Saved recipes. They live in this browser with no account needed. If someone wants them on their other
// devices too, they sign in with an emailed link, and the list is kept in Supabase as well.

// Fill these in from the Supabase project's Settings → API page to turn on syncing. Both are safe to publish:
// the database's row rules (supabase/schema.sql) only let each person read and change their own saves.
// While they are empty, saving still works, just on this device only.
const SYNC = { supabaseUrl: "", supabaseAnonKey: "" };

const STORE_KEY = "cook-this-saved";
const TABLE = "saved_recipes";

let saved = load();
let client = null;
let user = null;
const listeners = new Set();

function load() {
  try {
    const list = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    return Array.isArray(list) ? list.filter((r) => r && typeof r.id === "string") : [];
  } catch {
    return [];
  }
}

function store() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(saved));
  } catch {
    // Private windows can refuse storage; saves then last until the tab closes.
  }
  listeners.forEach((fn) => fn());
}

/** The fields worth keeping from a TheMealDB meal; the full recipe is looked up again when opened. */
const summary = (meal) => ({
  id: meal.idMeal,
  name: meal.strMeal,
  thumb: meal.strMealThumb,
  meta: [meal.strArea, meal.strCategory].filter(Boolean).join(" · "),
  savedAt: new Date().toISOString(),
});

export const savedRecipes = () => saved;
export const isSaved = (id) => saved.some((r) => r.id === id);
export const onSavedChange = (fn) => listeners.add(fn);
export const syncAvailable = () => Boolean(SYNC.supabaseUrl && SYNC.supabaseAnonKey);
export const syncedEmail = () => user?.email ?? null;

/** Saves or unsaves a recipe; returns whether it is now saved. */
export function toggleSaved(meal) {
  if (isSaved(meal.idMeal)) {
    saved = saved.filter((r) => r.id !== meal.idMeal);
    store();
    if (user) client.from(TABLE).delete().eq("meal_id", meal.idMeal).then(logError);
    return false;
  }
  const entry = summary(meal);
  saved = [entry, ...saved];
  store();
  if (user) client.from(TABLE).upsert(toRow(entry)).then(logError);
  return true;
}

// --- Syncing (only when SYNC is filled in) ------------------------------------

const toRow = (r) => ({ meal_id: r.id, name: r.name, thumb: r.thumb, meta: r.meta, saved_at: r.savedAt });
const fromRow = (row) => ({ id: row.meal_id, name: row.name, thumb: row.thumb, meta: row.meta ?? "", savedAt: row.saved_at });

function logError({ error }) {
  if (error) console.error("Saved recipes sync:", error.message);
}

async function connect() {
  if (client || !syncAvailable()) return client;
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
  client = createClient(SYNC.supabaseUrl, SYNC.supabaseAnonKey);
  return client;
}

/** Combines this browser's saves with the account's, so nothing saved before signing in is lost. */
async function merge() {
  const { data, error } = await client.from(TABLE).select("*");
  if (error) return logError({ error });
  const remote = data.map(fromRow);
  const missing = saved.filter((r) => !remote.some((x) => x.id === r.id));
  if (missing.length) client.from(TABLE).upsert(missing.map(toRow)).then(logError);
  const extra = remote.filter((x) => !saved.some((r) => r.id === x.id));
  saved = [...saved, ...extra].sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
  store();
}

/** Picks up an existing sign-in, including one arriving from the emailed link. */
export async function startSync() {
  if (!(await connect())) return;
  client.auth.onAuthStateChange((_event, session) => {
    const before = user?.id;
    user = session?.user ?? null;
    if (user && user.id !== before) merge();
    else listeners.forEach((fn) => fn());
  });
}

/** Emails a sign-in link that brings the person back here. */
export async function sendSignInLink(email) {
  if (!(await connect())) throw new Error("Syncing isn't set up yet.");
  const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw error;
}

/** Stops syncing; the saves stay in this browser. */
export async function signOut() {
  if (client) await client.auth.signOut();
}
