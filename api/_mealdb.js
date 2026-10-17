// TheMealDB lookups for the server: the list of real ingredient names and single recipes, so endpoints only
// accept names and recipes that exist instead of whatever text someone sends.

const API = "https://www.themealdb.com/api/json/v1/1";
const DAY = 86400000;

let ingredients = { set: null, at: 0 };
const meals = new Map();

async function getJSON(path) {
  const r = await fetch(`${API}/${path}`, { signal: AbortSignal.timeout(8_000) });
  if (!r.ok) throw new Error(`TheMealDB ${r.status}`);
  return r.json();
}

/** Every ingredient name TheMealDB knows, lowercased. Null if it can't be fetched right now. */
export async function knownIngredients() {
  if (ingredients.set && Date.now() - ingredients.at < DAY) return ingredients.set;
  try {
    const d = await getJSON("list.php?i=list");
    const set = new Set((d.meals ?? []).map((m) => String(m.strIngredient || "").trim().toLowerCase()).filter(Boolean));
    if (set.size) ingredients = { set, at: Date.now() };
  } catch {
    // Keep whatever we had.
  }
  return ingredients.set;
}

/** One recipe by its TheMealDB id, or null. */
export async function lookupMeal(id) {
  if (!/^\d{1,8}$/.test(String(id))) return null;
  if (meals.has(id)) return meals.get(id);
  try {
    const meal = (await getJSON(`lookup.php?i=${id}`)).meals?.[0] ?? null;
    if (meals.size > 500) meals.clear();
    if (meal) meals.set(id, meal);
    return meal;
  } catch {
    return null;
  }
}

/** A recipe's ingredients as [{ name, measure }]. */
export function ingredientsOf(meal) {
  const out = [];
  for (let i = 1; i <= 20; i++) {
    const name = String(meal[`strIngredient${i}`] || "").trim();
    if (name) out.push({ name, measure: String(meal[`strMeasure${i}`] || "").trim() });
  }
  return out;
}
