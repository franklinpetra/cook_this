// Cook This: add what's in your pantry, get recipes that use the most of it.
// Recipes come from TheMealDB's free API, which needs no secret key.

import { AFFILIATE, SAMPLES, STORES } from "./brand.js";
import { track } from "./track.js";
import { isSaved, onSavedChange, savedRecipes, sendSignInLink, signOut, startSync, syncAvailable, syncedEmail, toggleSaved } from "./saved.js";

const API = "https://www.themealdb.com/api/json/v1/1";
const DETAILS_TO_FETCH = 16;
const STORE_KEY = "cook-this-pantry";
const MAX_PANTRY = 15;
const MAX_NAME = 40; // characters in one ingredient name

// Words that make an ingredient a different thing ("Chicken Stock" isn't chicken, "Peanut Butter" isn't butter).
const NOT_THE_SAME = [
  "spring", "stock", "powder", "sauce", "paste", "oil", "juice", "extract", "seasoning", "cube", "gravy",
  "peanut", "almond", "coconut", "soy", "oat", "ice", "vinegar", "wine", "noodle", "flour", "flake", "milk",
  "cream", "bread", "tortilla", "syrup", "bean", "condensed", "evaporated", "soya", "chocolate", "vermicelli",
  "krispy", "paper", "ketchup", "puree", "sun", "salt", "liver", "palm", "snap", "chestnut", "starch", "ale",
  "salsa", "sweet", "plant", "roll",
];
// Words that only narrow an ingredient down, so "Garlic Cloves" or "Red Onions" still count as a recipe's
// plain "Garlic" or "Onion". Anything else ("Beef Tomatoes", "Peanut Butter") is a different food.
const REFINES = new Set(
  "red white yellow green orange purple brown black fresh baby large small medium whole chopped diced sliced minced grated shredded boneless skinless lean extra virgin unsalted salted plain organic free range clove thigh breast leg drumstick wing fillet cherry plum grape vine roma basmati jasmine long grain arborio".split(" "),
);
// Pepper the spice only covers other pepper spices, not "Red Pepper" (a bell pepper) or "Chilli Pepper".
const PEPPER_SPICE = ["black", "white", "ground", "cracked", "freshly", "pepper"];
// Fresh citrus gives you its own juice.
const SQUEEZABLE = ["lemon", "lime"];



const $ = (id) => document.getElementById(id);
const form = $("pantry-form");
const input = $("ingredient");
const chipsEl = $("chips");
const suggestionsEl = $("suggestions");
const statusEl = $("status");
const resultsEl = $("results");
const basicsEl = $("basics");
const cookBtn = $("cook");
const dialog = $("recipe");

let allIngredients = [];
let pantry = load();
let active = -1;
let lastResults = [];
// Only vegetarian (and vegan) recipes, when that's switched on.
let vegOnly = false;
let vegIds = null;
let rerun = null;
let searched = false;
let searchId = 0; // Only the newest search gets to show its results.
// Optional buy buttons, switched on server-side (api/config.js): { instacart: true, kroger: "QFC" }.
let services = {};
let shown = null; // the recipe open in the dialog

// --- Small helpers -----------------------------------------------------------

// Accents don't matter when comparing names: "gruyere" finds "Gruyère".
const norm = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const words = (s) => norm(s).split(/[\s-]+/).filter(Boolean);
const singular = (w) => (w.endsWith("oes") ? w.slice(0, -2) : w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
// Smooth scrolling only for people who haven't asked for less motion.
const scrollBehavior = () => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");
/** Only web links from recipe data become links, never javascript: or other schemes. */
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || "")) ? String(u) : "");
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    if (!Array.isArray(saved)) return [];
    // Skip blanks, overlong entries and duplicates that an older version or a hand edit may have left.
    const seen = new Set();
    return saved
      // Runs before the helpers below exist, so it lowercases on its own.
      .filter((x) => typeof x === "string" && x.trim() && x.length <= MAX_NAME && !seen.has(x.trim().toLowerCase()) && seen.add(x.trim().toLowerCase()))
      .map((x) => x.trim())
      .slice(0, MAX_PANTRY);
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(pantry));
  } catch {
    // Private windows can refuse storage; the app still works without it.
  }
}

async function getJSON(path) {
  const res = await fetch(`${API}/${path}`);
  if (!res.ok) throw new Error(`TheMealDB answered ${res.status}`);
  return res.json();
}

// Answers already fetched this visit. Recipes and ingredient lists don't change minute to minute, and
// TheMealDB starts refusing requests when searches come quickly (say, while someone adds items one by one).
const fetched = new Map();

/** getJSON, remembering successful answers; a failed request is forgotten so it can be tried again. */
function cachedJSON(path) {
  if (!fetched.has(path)) {
    fetched.set(
      path,
      getJSON(path).catch((err) => {
        fetched.delete(path);
        throw err;
      }),
    );
  }
  return fetched.get(path);
}

/**
 * Does a recipe ingredient name count as one of yours? "Garlic" covers "Garlic Clove", not "Garlic Powder",
 * and your "Garlic Cloves" or "Red Onions" cover a recipe's plain "Garlic" or "Onion".
 */
function covers(mine, theirs) {
  const a = words(mine).map(singular);
  const b = words(theirs).map(singular);
  if (a.every((w) => b.includes(w))) {
    const extra = b.filter((w) => !a.includes(w));
    if (a.length === 1 && a[0] === "pepper") return extra.every((w) => PEPPER_SPICE.includes(w));
    if (a.length === 1 && SQUEEZABLE.includes(a[0]) && extra.length === 1 && extra[0] === "juice") return true;
    return !extra.some((w) => NOT_THE_SAME.includes(w));
  }
  if (b.every((w) => a.includes(w))) {
    const extra = a.filter((w) => !b.includes(w));
    if (b.length === 1 && b[0] === "pepper") return extra.every((w) => PEPPER_SPICE.includes(w));
    // Egg whites alone don't make the whole eggs a recipe asks for.
    if (b.length === 1 && b[0] === "egg" && extra.includes("white")) return false;
    return extra.every((w) => REFINES.has(w));
  }
  return false;
}

const STAPLE = /^(salt|sea salt|table salt|water|sugar|caster sugar|granulated sugar|brown sugar|butter|unsalted butter|flour|plain flour|all purpose flour|pepper|black pepper|white pepper|ground pepper|olive oil|vegetable oil|oil|sunflower oil|canola oil|extra virgin olive oil|salt and pepper)$/;
const isStaple = (name) => STAPLE.test(norm(name));

// --- Ingredients you have ----------------------------------------------------

function renderChips() {
  chipsEl.innerHTML = pantry
    .map(
      (name, i) =>
        `<li class="chip">${escapeHtml(name)}<button type="button" data-remove="${i}" aria-label="Remove ${escapeHtml(name)}">×</button></li>`,
    )
    .join("");
  input.placeholder = pantry.length ? "Add another…" : "Add an ingredient — chicken, rice, lemon…";
  $("clear-all").hidden = pantry.length < 2;
  if (pantry.length < MAX_PANTRY && statusEl.textContent.startsWith("Your list holds")) statusEl.textContent = "";
  // Once someone has searched, the results follow the list as it changes.
  if (searched) {
    clearTimeout(rerun);
    rerun = setTimeout(() => {
      rerun = null;
      cook();
    }, 700);
  }
  // The footer's NYT Cooking link searches for what's on the list, for people who subscribe.
  $("nyt").href = pantry.length ? `https://cooking.nytimes.com/search?q=${encodeURIComponent(pantry.join(" "))}` : "https://cooking.nytimes.com/";
  renderSamples();
}

function renderSamples() {
  const tryEl = $("try");
  const left = SAMPLES.filter((s) => !pantry.some((p) => norm(p) === norm(s))).slice(0, 6);
  tryEl.innerHTML = left.length
    ? `<span class="try-label">Try:</span>${left.map((s) => `<button type="button" data-add="${escapeHtml(s)}">+ ${escapeHtml(s)}</button>`).join("")}`
    : "";
}

// TheMealDB uses British names; people (and the photo scanner) often use American ones.
const SAME_AS = {
  eggplant: "Aubergine", zucchini: "Courgettes", cilantro: "Coriander", scallions: "Spring Onions",
  "green onions": "Spring Onions", "ground beef": "Minced Beef", "ground pork": "Minced Pork", shrimp: "Prawns",
  arugula: "Rocket", "garbanzo beans": "Chickpeas", "powdered sugar": "Icing Sugar", "heavy cream": "Double Cream",
  "all-purpose flour": "Plain Flour", "all purpose flour": "Plain Flour", "bell pepper": "Red Pepper",
  "bell peppers": "Red Pepper", "baking soda": "Bicarbonate Of Soda", "romaine": "Lettuce",
  "canned tomatoes": "Chopped Tomatoes", "chicken breasts": "Chicken Breast", "sweet potatoes": "Sweet Potatoes",
  "green onion": "Spring Onions", scallion: "Spring Onions", peppers: "Red Pepper",
  "5 spice": "Five Spice Powder", "five spice": "Five Spice Powder", "chinese five spice": "Five Spice Powder",
};
/** The British name for an American one, or null. (A Map-style check, so "constructor" is just a word.) */
const sameAs = (t) => (Object.hasOwn(SAME_AS, t) ? SAME_AS[t] : null);
/** "jalapeño" → "Jalapeño", "crème fraîche" → "Crème Fraîche". */
const titleCase = (s) => s.replace(/(^|[\s-])(\p{L})/gu, (_, before, letter) => before + letter.toUpperCase());

/** The best real ingredient name for what was typed, so searches use TheMealDB's own names. */
function canonical(text) {
  const t = norm(text);
  if (!t) return null;
  if (sameAs(t)) return sameAs(t);
  const exact = allIngredients.find((n) => norm(n) === t || singular(norm(n)) === singular(t));
  if (exact) return exact;
  // "parmesan" → "Parmesan Cheese", only when it's unambiguous and the added words don't make it a different
  // thing: "corn" could be Corn Tortillas or Corn Flour, and "chili" isn't Chili Powder.
  const starts = allIngredients.filter((n) => {
    const name = norm(n);
    return name.startsWith(`${t} `) && !words(name.slice(t.length)).map(singular).some((w) => NOT_THE_SAME.includes(w));
  });
  if (starts.length === 1) return starts[0];
  // "Baby Carrots" → "Carrots": the longest known name whose words are all in what was typed, unless the
  // leftover words make it something else ("tomato paste" isn't Tomatoes).
  const typed = words(t).map(singular);
  const inside = allIngredients
    .filter((n) => {
      const name = words(n).map(singular);
      return name.every((w) => typed.includes(w)) && !typed.some((w) => !name.includes(w) && NOT_THE_SAME.includes(w));
    })
    .sort((a, b) => b.length - a.length)[0];
  if (inside) return inside;
  return titleCase(text.trim().slice(0, MAX_NAME));
}

/** True when TheMealDB (or our American-name table) knows this exact ingredient. */
function known(text) {
  const t = norm(text);
  return Boolean(sameAs(t) || allIngredients.some((n) => norm(n) === t || singular(norm(n)) === singular(t)));
}

// Commas, semicolons, new lines and slashes separate items in a typed or pasted list; so do "&", "and" and
// "plus", unless they are part of a known name.
const SEPARATORS = /\s*(?:[,;\n]|(?<!\d)\/(?!\d))\s*/;
const JOINERS = /\s*(?:[&+]|\band\b|\bplus\b)\s*/i;

// Words that describe the next item ("fresh limes"), and words that finish the one before ("curry paste").
const DESCRIBES = new Set(
  "fresh frozen dried canned tinned raw cooked leftover ripe baby large small big organic chopped sliced diced minced grated shredded smoked boneless skinless whole lean extra virgin white hot sweet plain cooking green red yellow orange wild light dark unsalted salted ground greek skim natural".split(" "),
);
const FORMS = new Set("paste sauce powder leaves leaf seeds flakes stock broth oil juice zest puree cubes fillets fillet breasts breast thighs wings mince".split(" "));

// Quantities and units at the start of an item: "2 lbs chicken", "1/2 cup rice", "a can of beans", "200ml milk".
// A unit only counts after an amount, so "pound cake" and "cloves" (the spice) stay food.
const AMOUNT = /^(?:a|an|[\d\u00bc-\u00be\u2150-\u215e.,\/x-]+(?:ml|l|g|kg|lbs?|oz)?\.?)$/i;
const UNIT = /^(?:cups?|tbsps?|tbs|tablespoons?|tsps?|teaspoons?|lbs?|pounds?|oz|ounces?|g|grams?|kg|ml|liters?|litres?|cans?|tins?|jars?|packages?|pkgs?|packs?|bags?|box(?:es)?|bunch(?:es)?|heads?|handfuls?|pinch(?:es)?|cloves?|slices?|sticks?|dozen|of)\.?$/i;

/** One typed item without its list bullet, number, quantity, or unit: "- 2 cups rice" → "rice". */
function tidy(part) {
  const text = part
    .replace(/\([^)]*\)/g, " ") // "1 (14 oz) can tomatoes"
    .replace(/^\s*(?:[-–—•*·]+|\d+[.)](?!\d))\s*/, "")
    .replace(/^\s*(juice|zest)\s+of\s+(?:\d+\s+|an?\s+)?(.+)$/i, "$2 $1"); // "juice of 1 lemon" → "lemon juice"
  const w = text.split(/\s+/).filter(Boolean);
  let measured = false;
  while (w.length > 1) {
    if (AMOUNT.test(w[0])) measured = true;
    else if (!measured || !UNIT.test(w[0])) break;
    w.shift();
  }
  return w.join(" ");
}

/** Letters you'd have to change to turn one word into another. */
function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

/** A known one-word ingredient this is a likely typo of ("brocoli" → "Broccoli"), or null. */
function corrected(word) {
  const w = singular(norm(word));
  if (w.length < 5) return null;
  const allowed = w.length >= 8 ? 2 : 1;
  let best = null;
  let bestD = allowed + 1;
  for (const n of [...allIngredients, ...Object.keys(SAME_AS)]) {
    if (n.includes(" ")) continue;
    const d = distance(w, singular(norm(n)));
    if (d < bestD) [best, bestD] = [n, d];
  }
  return best;
}

/**
 * Turns whatever was typed into separate ingredients: "limes, chicken, cheese, bread" or
 * "turkey edamame heavy cream tofu" both work. Known multi-word names ("olive oil") stay whole, and a
 * word we don't recognise becomes its own item rather than being lost.
 */
function splitIngredients(text) {
  const parts = text
    .replace(/\band\s*\/\s*or\b/gi, ",") // "milk and/or cream"
    .split(SEPARATORS)
    .flatMap((part) => (known(part) ? [part] : part.split(JOINERS)))
    .map((part) => (known(part) ? part : tidy(part)));
  return parts.flatMap((part) => {
    const w = part.split(/\s+/).filter(Boolean);
    if (!w.length || /^[^\p{L}]+$/u.test(part)) return []; // Bullets, numbers and stray symbols alone aren't food.
    if (!known(part) && w.every((x) => DESCRIBES.has(norm(x)))) return []; // Nor is "diced" in "1 onion, diced".
    if (known(part)) return [part.trim()];
    if (w.length === 1) return [corrected(part) ?? part.trim()]; // "chiken" → Chicken
    // Longest known name at each position, up to three words.
    const found = [];
    let lead = [];
    for (let i = 0; i < w.length; ) {
      let len = Math.min(3, w.length - i);
      while (len > 0 && !known(w.slice(i, i + len).join(" "))) len--;
      const word = w[i];
      if (len) {
        found.push([...lead, ...w.slice(i, i + len)].join(" "));
        lead = [];
        i += len;
        continue;
      }
      i++;
      if (DESCRIBES.has(norm(word))) lead.push(word);
      else if (FORMS.has(norm(word)) && found.length && !lead.length) found[found.length - 1] += ` ${word}`;
      else {
        found.push([...lead, corrected(word) ?? word].join(" "));
        lead = [];
      }
    }
    if (found.length < 2) return [part.trim()];
    if (lead.length) found[found.length - 1] += ` ${lead.join(" ")}`;
    return found;
  });
}

function add(text) {
  let changed = false;
  let full = false;
  for (const item of splitIngredients(text)) {
    const name = canonical(item);
    if (!name || pantry.some((p) => norm(p) === norm(name))) continue;
    if (pantry.length >= MAX_PANTRY) {
      full = true;
      continue;
    }
    pantry.push(name);
    changed = true;
  }
  if (changed) {
    save();
    renderChips();
  }
  if (full) statusEl.textContent = `Your list holds ${MAX_PANTRY} ingredients. Remove one to add another.`;
  input.value = "";
  hideSuggestions();
}

/** Phones often don't report the comma key, and pasted lists arrive all at once: add finished items as they appear. */
function addFinishedItems() {
  const value = input.value;
  const cut = Math.max(value.lastIndexOf(","), value.lastIndexOf(";"), value.lastIndexOf("\n"));
  if (cut < 0) return;
  const rest = value.slice(cut + 1).trimStart();
  add(value.slice(0, cut));
  input.value = rest;
}

// --- Suggestions while typing ------------------------------------------------

function showSuggestions() {
  const t = norm(input.value);
  if (!t || !allIngredients.length) return hideSuggestions();
  const picked = new Set(pantry.map(norm));
  const matches = allIngredients
    .filter((n) => norm(n).includes(t) && !picked.has(norm(n)))
    .sort((a, b) => norm(a).indexOf(t) - norm(b).indexOf(t) || a.length - b.length)
    .slice(0, 8);
  if (!matches.length) return hideSuggestions();
  active = -1;
  suggestionsEl.innerHTML = matches
    .map((n, i) => {
      const at = norm(n).indexOf(t);
      const label = `${escapeHtml(n.slice(0, at))}<mark>${escapeHtml(n.slice(at, at + t.length))}</mark>${escapeHtml(n.slice(at + t.length))}`;
      return `<li role="option" id="opt-${i}" data-value="${escapeHtml(n)}" aria-selected="false">${label}</li>`;
    })
    .join("");
  suggestionsEl.hidden = false;
  input.setAttribute("aria-expanded", "true");
}

function hideSuggestions() {
  suggestionsEl.hidden = true;
  suggestionsEl.innerHTML = "";
  input.setAttribute("aria-expanded", "false");
  input.removeAttribute("aria-activedescendant");
  active = -1;
}

function move(delta) {
  const opts = [...suggestionsEl.querySelectorAll("li")];
  if (!opts.length) return;
  active = (active + delta + opts.length) % opts.length;
  opts.forEach((o, i) => o.setAttribute("aria-selected", String(i === active)));
  input.setAttribute("aria-activedescendant", opts[active].id);
  opts[active].scrollIntoView({ block: "nearest" });
}

// --- Finding recipes ---------------------------------------------------------

/** The recipe ids that use one of your ingredients, including close variants ("Chicken Thighs"). */
async function mealsFor(name) {
  const variants = [name, ...allIngredients.filter((n) => n !== name && covers(name, n)).slice(0, 8)];
  const lists = await Promise.all(variants.map((v) => cachedJSON(`filter.php?i=${encodeURIComponent(v)}`).catch(() => ({ meals: null, failed: true }))));
  if (lists.every((l) => l.failed)) throw new Error(`No answer for ${name}`);
  const meals = new Map();
  for (const list of lists) for (const m of list.meals ?? []) meals.set(m.idMeal, m);
  return meals;
}

function ingredientsOf(meal) {
  const out = [];
  for (let i = 1; i <= 20; i++) {
    const name = (meal[`strIngredient${i}`] || "").trim();
    if (name) out.push({ name, measure: (meal[`strMeasure${i}`] || "").trim() });
  }
  return out;
}

function classify(meal) {
  const basics = basicsEl.checked;
  return ingredientsOf(meal).map((ing) => ({
    ...ing,
    status: pantry.some((p) => covers(p, ing.name)) ? "have" : basics && isStaple(ing.name) ? "staple" : "need",
  }));
}

/** A full recipe, with each ingredient marked as one you have, a basic, or one you'd need. */
function toResult(meal) {
  const ings = classify(meal);
  return { meal, ings, have: ings.filter((i) => i.status === "have").length, need: ings.filter((i) => i.status === "need") };
}

async function cook() {
  if (!pantry.length) {
    ++searchId; // Cancels a search still running for the old list.
    cookBtn.disabled = false;
    lastResults = [];
    resultsEl.innerHTML = "";
    statusEl.textContent = "Add at least one thing from your kitchen first.";
    input.focus();
    return;
  }
  const id = ++searchId;
  searched = true;
  cookBtn.disabled = true;
  track("search", { have: pantry });
  resultsEl.innerHTML = "";
  statusEl.innerHTML = `<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span> Finding recipes…`;
  try {
    // How many of your ingredients each recipe uses.
    const perIngredient = await Promise.all(pantry.map(mealsFor));
    const tally = new Map();
    perIngredient.forEach((meals) => {
      for (const [id, m] of meals) {
        const t = tally.get(id) ?? { meal: m, hits: 0 };
        t.hits++;
        tally.set(id, t);
      }
    });
    const allowed = vegOnly ? await vegetarianIds() : null;
    if (id !== searchId) return;
    const candidates = [...tally.values()]
      .filter((t) => !allowed || allowed.has(t.meal.idMeal))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, DETAILS_TO_FETCH);
    if (!candidates.length) {
      lastResults = [];
      statusEl.textContent = "";
      resultsEl.innerHTML = vegOnly
        ? `<p class="empty">No vegetarian recipes use those yet. Try another ingredient, or turn off Vegetarian.</p>`
        : `<p class="empty">Nothing yet with that combination. Try removing one ingredient, or add a staple like rice or eggs.</p>`;
      return;
    }

    // Full recipes, so we can show what you'd still need.
    const details = await Promise.all(
      candidates.map((c) =>
        cachedJSON(`lookup.php?i=${c.meal.idMeal}`)
          .then((d) => d.meals?.[0])
          .catch(() => null),
      ),
    );
    if (id !== searchId) return;
    if (!details.some(Boolean)) throw new Error("No recipe details came back");
    lastResults = details.filter(Boolean).map(toResult).sort(byCookable);
    render();
  } catch (err) {
    if (id !== searchId) return;
    lastResults = []; // The page shows no results now, so nothing (like Surprise me) should use the old ones.
    statusEl.textContent = "The recipe box is busy. Give it a few seconds and try again.";
    console.error(err);
  } finally {
    if (id === searchId) cookBtn.disabled = false;
  }
}

/** The ids of TheMealDB's vegetarian and vegan recipes, looked up once. */
function vegetarianIds() {
  // A failed lookup isn't kept, so the next search tries again instead of finding nothing forever.
  vegIds ??= Promise.all(["Vegetarian", "Vegan"].map((c) => cachedJSON(`filter.php?c=${c}`)))
    .then((lists) => new Set(lists.flatMap((l) => (l.meals ?? []).map((m) => m.idMeal))))
    .catch((err) => {
      vegIds = null;
      throw err;
    });
  return vegIds;
}

function render() {
  const ready = lastResults.filter((r) => r.need.length === 0).length;
  statusEl.textContent = ready
    ? `${ready} ${ready === 1 ? "recipe" : "recipes"} you can make right now, plus ${lastResults.length - ready} close ones.`
    : `${lastResults.length} recipes that use what you have.`;
  resultsEl.innerHTML = lastResults
    .map((r, i) => {
      const m = r.meal;
      const need = r.need.length
        ? `<span class="badge need" title="${escapeHtml(r.need.map((n) => n.name).join(", "))}">${r.need.length} to buy</span>`
        : `<span class="badge ready">Ready to cook</span>`;
      return `<button type="button" class="card${r.need.length ? "" : " is-ready"}" data-open="${i}" style="animation-delay:${Math.min(i, 10) * 40}ms">
        ${photo(m.strMealThumb, "/medium", 'loading="lazy"')}
        <span class="card-body">
          <span class="card-title">${escapeHtml(m.strMeal)}</span>
          <span class="meta">${escapeHtml([m.strArea, m.strCategory].filter(Boolean).join(" · "))}</span>
          <span class="badges"><span class="badge uses">Uses ${r.have} of yours</span>${need}</span>
        </span>
      </button>`;
    })
    .join("");
}

/** A recipe photo, or nothing if the recipe has none. */
function photo(url, size = "", extra = "") {
  const src = safeUrl(url);
  return src ? `<img src="${escapeHtml(src + size)}" alt="" ${extra} />` : "";
}

/** Closest to cookable first: each of yours it uses counts double, each thing you'd buy counts against it. */
function byCookable(a, b) {
  return b.have * 2 - b.need.length - (a.have * 2 - a.need.length) || a.need.length - b.need.length;
}

/** Instruction lines, with short all-caps lines like "MARINATING THE CHICKEN" kept as section labels. */
function steps(text) {
  return (text || "")
    .split(/\r?\n+/)
    .map((s) => s.replace(/^\s*(?:step\s*\d+|\d+[.)])\s*[:.)\-–—]*\s*/i, "").trim())
    .filter((s) => s.length > 2)
    .map((s) => {
      const bare = s.replace(/^[-–—•*\s]+|[:\s]+$/g, "");
      // A short all-caps line is a section label, but not a shouted instruction ("PREHEAT TO 350F.").
      const heading = bare.length < 60 && bare === bare.toUpperCase() && /[A-Z]/.test(bare) && !/[\d.!?]$/.test(bare);
      return heading ? { heading: true, text: bare.charAt(0) + bare.slice(1).toLowerCase() } : { heading: false, text: s };
    });
}

/** "Get what's missing": each ingredient to buy, with a search link at each store, and a copyable list. */
function shopPanel(need) {
  if (!need.length) return "";
  const list = need.map((n) => n.name);
  return `
    <section class="shop" aria-label="Get what's missing">
      <div class="shop-head">
        <p class="shop-title">Get the ${need.length === 1 ? "one thing" : `${need.length} things`} you need</p>
        <button type="button" class="link-btn small" data-copy="${escapeHtml(list.join("\n"))}">Copy list</button>
      </div>
      ${buyButtons()}
      <ul class="shop-list">
        ${list
          .map(
            (name) => `<li>
              <span class="shop-item">${escapeHtml(name)}</span>
              <span class="shop-links">${STORES.map((s) => `<a href="${escapeHtml(s.url(name))}" target="_blank" rel="noopener" data-store="${escapeHtml(s.name)}" aria-label="${escapeHtml(`${name} at ${s.name} (opens in a new tab)`)}">${s.name}</a>`).join("")}</span>
            </li>`,
          )
          .join("")}
      </ul>
      ${AFFILIATE.amazonTag ? `<p class="shop-note">As an Amazon Associate, Cook This earns from qualifying purchases.</p>` : ""}
    </section>`;
}

const CARROT = `<img src="icons/instacart-carrot.svg" alt="" width="22" height="22" />`;

/** One-tap buying: everything missing in a single Instacart page, or straight into a Kroger-family cart. */
function buyButtons() {
  if (!services.instacart && !services.kroger) return "";
  return `<div class="buy">
    ${services.instacart ? `<button type="button" class="instacart-cta" data-instacart>${CARROT}Shop ingredients</button>` : ""}
    ${services.kroger ? `<button type="button" class="kroger-cta" data-kroger>Add to my ${escapeHtml(services.kroger)} cart</button>` : ""}
  </div>
  <p class="buy-note" id="buy-note" role="status" aria-live="polite"></p>`;
}

/** "You already have 5 of the 9 ingredients." A small celebration of what's already in the kitchen. */
function haveLine(r) {
  const total = r.ings.length;
  const have = r.ings.filter((i) => i.status !== "need").length;
  if (!r.need.length) return "You have everything for this one. Let's cook!";
  return `You already have ${have} of the ${total} ingredients.`;
}

function openRecipe(r) {
  const m = r.meal;
  shown = r;
  const marks = { have: "✓", staple: "•", need: "+" };
  const labels = { have: "You have this", staple: "A basic you have", need: "You'd need this" };
  dialog.innerHTML = `
    <div class="recipe-hero">
      ${photo(m.strMealThumb)}
      <button type="button" class="close" data-close aria-label="Close">×</button>
    </div>
    <div class="recipe-body">
      <p class="meta">${escapeHtml([m.strArea, m.strCategory].filter(Boolean).join(" · "))}</p>
      <h2 id="recipe-title">${escapeHtml(m.strMeal)}</h2>
      <p class="have-line">${haveLine(r)}</p>
      <p class="save-row">${saveButton(m.idMeal)}</p>
      ${shopPanel(r.need)}
      <h3>Ingredients</h3>
      <ul class="ingredients">
        ${r.ings
          .map(
            (i) =>
              `<li class="${i.status}"><span class="mark" aria-hidden="true">${marks[i.status]}</span><span class="sr-only">${labels[i.status]}: </span><span>${escapeHtml(i.name)} <span class="measure">${escapeHtml(i.measure)}</span></span></li>`,
          )
          .join("")}
      </ul>
      <h3>How to make it</h3>
      <ol class="steps">${steps(m.strInstructions)
        .map((s) => (s.heading ? `<li class="sub">${escapeHtml(s.text)}</li>` : `<li>${escapeHtml(s.text)}</li>`))
        .join("")}</ol>
      <div class="links">
        ${safeUrl(m.strYoutube) ? `<a href="${escapeHtml(safeUrl(m.strYoutube))}" target="_blank" rel="noopener" data-video>▶ Watch it made</a>` : ""}
        ${safeUrl(m.strSource) ? `<a href="${escapeHtml(safeUrl(m.strSource))}" target="_blank" rel="noopener">Original recipe</a>` : ""}
        <button type="button" class="link-btn" data-print>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v6H7z"/></svg>
          Print
        </button>
      </div>
      <p class="print-only">Recipe from TheMealDB · found with Cook This, cookthis.link</p>
    </div>`;
  dialog.showModal();
  dialog.scrollTop = 0;
  track("open", { id: m.idMeal, need: r.need.map((n) => n.name) });
}

// --- Ingredients from a photo -------------------------------------------------

const scanEl = $("scan");
const photoEl = $("photo");
const foundEl = $("found");
const PRIVACY = "Your photo goes to an AI service to spot ingredients and isn't stored.";

function setScan(title, note = PRIVACY, actions = false) {
  $("scan-title").textContent = title;
  $("scan-note").textContent = note;
  $("scan-actions").hidden = !actions;
}

async function scan(file) {
  scanEl.hidden = false;
  foundEl.innerHTML = "";
  $("scan-add").hidden = true;
  const img = $("scan-img");
  if (img.src) URL.revokeObjectURL(img.src);
  img.src = URL.createObjectURL(file);
  setScan("Looking for ingredients…");
  track("scan");
  scanEl.classList.add("busy");
  scanEl.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
  try {
    const { scanPhoto } = await import("./scan.js");
    const found = (await scanPhoto(file)).map((f) => ({ ...f, name: canonical(f.name) }));
    const seen = new Set(pantry.map(norm));
    const fresh = found.filter((f) => !seen.has(norm(f.name)) && seen.add(norm(f.name)));
    if (!fresh.length) {
      setScan(
        found.length ? "Everything I spotted is already on your list." : "I couldn't spot any ingredients in that one.",
        found.length ? PRIVACY : "Try a closer, brighter photo of a shelf or the inside of your fridge, or type them in.",
        true,
      );
      return;
    }
    foundEl.innerHTML = fresh
      .map(
        (f) =>
          `<li><button type="button" class="found-item" aria-pressed="${f.sure}" data-name="${escapeHtml(f.name)}"><span class="tick" aria-hidden="true"></span>${escapeHtml(f.name)}</button></li>`,
      )
      .join("");
    $("scan-add").hidden = false;
    setScan("Here's what I spotted. Untick anything I got wrong.", PRIVACY, true);
  } catch (err) {
    setScan("I couldn't read that photo.", `${err.message} You can still type your ingredients in.`, true);
  } finally {
    scanEl.classList.remove("busy");
  }
}

function closeScan() {
  scanEl.hidden = true;
  foundEl.innerHTML = "";
  input.focus();
}

$("scan-btn").addEventListener("click", () => photoEl.click());
$("photo-hint").addEventListener("click", () => photoEl.click());
photoEl.addEventListener("change", () => {
  const file = photoEl.files?.[0];
  photoEl.value = "";
  if (file) scan(file);
});
foundEl.addEventListener("click", (e) => {
  const b = e.target.closest(".found-item");
  if (b) b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
});
$("scan-add").addEventListener("click", () => {
  for (const b of foundEl.querySelectorAll('.found-item[aria-pressed="true"]')) add(b.dataset.name);
  closeScan();
});
$("scan-cancel").addEventListener("click", closeScan);

// --- Wiring ------------------------------------------------------------------

input.addEventListener("input", () => {
  addFinishedItems();
  showSuggestions();
});
input.addEventListener("keydown", (e) => {
  if (e.isComposing || e.keyCode === 229) return; // Still composing (Japanese, Chinese, some phone keyboards).
  if (e.key === "ArrowDown") {
    e.preventDefault();
    move(1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    move(-1);
  } else if (e.key === "Enter" || e.key === ",") {
    if (input.value.trim()) {
      e.preventDefault();
      const opt = suggestionsEl.querySelectorAll("li")[active];
      add(opt ? opt.dataset.value : input.value);
    }
  } else if (e.key === "Escape") {
    hideSuggestions();
  } else if (e.key === "Backspace" && !input.value && pantry.length) {
    pantry.pop();
    save();
    renderChips();
  }
});
input.addEventListener("blur", () => setTimeout(hideSuggestions, 150));
// A pasted list may be one item per line, which a one-line box would otherwise run together.
input.addEventListener("paste", (e) => {
  const text = e.clipboardData?.getData("text") ?? "";
  if (!/[,;\n]/.test(text)) return;
  e.preventDefault();
  // Pasted text goes where the cursor is, replacing any selection.
  const value = input.value;
  add(value.slice(0, input.selectionStart ?? value.length) + text + value.slice(input.selectionEnd ?? value.length));
});

suggestionsEl.addEventListener("mousedown", (e) => {
  const li = e.target.closest("li");
  if (li) {
    e.preventDefault();
    add(li.dataset.value);
  }
});

$("box").addEventListener("click", (e) => {
  const remove = e.target.closest("[data-remove]");
  if (remove) {
    pantry.splice(Number(remove.dataset.remove), 1);
    save();
    renderChips();
    input.focus();
  } else if (e.target === e.currentTarget) {
    input.focus();
  }
});

$("clear-all").addEventListener("click", () => {
  pantry = [];
  save();
  renderChips();
  input.focus();
});

$("try").addEventListener("click", (e) => {
  const b = e.target.closest("[data-add]");
  if (b) add(b.dataset.add);
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (input.value.trim()) add(input.value);
  cook();
});

basicsEl.addEventListener("change", () => {
  if (cookBtn.disabled) return; // A search is running; it will use the new setting.
  if (!lastResults.length) return;
  lastResults = lastResults
    .map((r) => {
      const ings = classify(r.meal);
      return { ...r, ings, have: ings.filter((i) => i.status === "have").length, need: ings.filter((i) => i.status === "need") };
    })
    .sort(byCookable);
  render();
});

resultsEl.addEventListener("click", (e) => {
  const card = e.target.closest("[data-open]");
  if (card) openRecipe(lastResults[Number(card.dataset.open)]);
});

dialog.addEventListener("click", async (e) => {
  if (e.target === dialog || e.target.closest("[data-close]")) return dialog.close();
  if (e.target.closest("[data-print]")) {
    track("print");
    return window.print();
  }
  const store = e.target.closest("[data-store]");
  if (store) return track("shop", { detail: store.dataset.store });
  if (e.target.closest("[data-video]")) return track("video");
  if (e.target.closest("[data-instacart]") && shown) return shopInstacart(shown);
  if (e.target.closest("[data-kroger]") && shown) return addToKroger(shown.need.map((n) => n.name));
  const save = e.target.closest("[data-save]");
  if (save && shown) {
    if (toggleSaved(shown.meal)) track("save");
    save.outerHTML = saveButton(shown.meal.idMeal);
    return;
  }
  const copy = e.target.closest("[data-copy]");
  if (copy) {
    try {
      await navigator.clipboard.writeText(copy.dataset.copy);
      track("copy");
      copy.textContent = "Copied";
    } catch {
      copy.textContent = "Couldn't copy";
    }
    setTimeout(() => (copy.textContent = "Copy list"), 1800);
  }
});

// --- Buying what's missing ------------------------------------------------------

const PENDING_KEY = "cook-this-kroger-pending";
const withCartLink = (text, link) => escapeHtml(text) + (link ? ` <a href="${escapeHtml(link)}" target="_blank" rel="noopener">Open your cart</a>` : "");
const buyNote = (text, link) => {
  const el = $("buy-note");
  if (el) el.innerHTML = withCartLink(text, link);
};

async function shopInstacart(r) {
  track("instacart");
  // Open the tab now, while the tap still counts as the reason, then point it at the page once it's ready.
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null; // The store's page can't reach back into Cook This.
  buyNote("Making your Instacart list…");
  try {
    const res = await fetch("api/instacart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.meal.idMeal, items: r.need.map((n) => n.name) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) throw new Error(data.error || "Instacart isn't answering right now.");
    if (tab) tab.location.href = data.url;
    else location.href = data.url;
    buyNote("");
  } catch (err) {
    tab?.close();
    buyNote(err.message);
  }
}

/** Adds the missing items to the shopper's Kroger-family cart, signing them in first if needed. */
async function addToKroger(items, show = buyNote, justSignedIn = false) {
  track("kroger");
  show("Finding your ingredients at the store…");
  try {
    const res = await fetch("api/kroger/cart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
    const data = await res.json().catch(() => ({}));
    if (data.signIn && justSignedIn) throw new Error("The store didn't accept the sign-in, so nothing was added to your cart.");
    if (data.signIn) {
      try {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify(items));
      } catch {}
      location.href = "api/kroger/login";
      return;
    }
    if (!res.ok) throw new Error(data.error || "The store isn't answering right now.");
    const added = data.added.length;
    show(
      `Added ${added} ${added === 1 ? "item" : "items"} to your ${services.kroger || "Kroger"} cart.` +
        (data.notFound.length ? ` Couldn't find: ${data.notFound.join(", ")}.` : ""),
      data.cart,
    );
  } catch (err) {
    show(err.message);
  }
}

/** A message across the top of the page, for when someone comes back from signing in at the store. */
function notice(text, link) {
  let el = $("notice");
  if (!el) {
    el = document.createElement("p");
    el.id = "notice";
    el.className = "notice";
    el.setAttribute("role", "status");
    document.querySelector(".page").prepend(el);
  }
  el.innerHTML = withCartLink(text, link);
}

function finishKrogerSignIn() {
  const result = new URLSearchParams(location.search).get("kroger");
  if (!result) return;
  history.replaceState(null, "", location.pathname);
  let items = [];
  try {
    items = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "[]");
    sessionStorage.removeItem(PENDING_KEY);
  } catch {}
  if (result !== "connected") return notice("Signing in to the store didn't finish, so nothing was added to your cart.");
  if (items.length) addToKroger(items, notice, true);
}

// --- Saved recipes -------------------------------------------------------------

const HEART = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>`;

function saveButton(id) {
  const on = isSaved(id);
  return `<button type="button" class="link-btn save-btn" data-save aria-pressed="${on}">${HEART}${on ? "Saved" : "Save"}</button>`;
}

const savedEl = $("saved");
const savedListEl = $("saved-list");
const syncEl = $("sync");
let syncNote = "";

function renderSaved() {
  const list = savedRecipes();
  const email = syncedEmail();
  savedEl.hidden = !list.length && !email;
  $("saved-count").textContent = list.length ? `(${list.length})` : "";
  $("saved-link").hidden = !list.length;
  $("saved-link-count").textContent = list.length ? `(${list.length})` : "";
  savedListEl.innerHTML = list.length
    ? list
        .map(
          (r) => `<button type="button" class="card" data-saved="${escapeHtml(r.id)}">
        ${photo(r.thumb, "/medium", 'loading="lazy"')}
        <span class="card-body">
          <span class="card-title">${escapeHtml(r.name)}</span>
          <span class="meta">${escapeHtml(r.meta || "")}</span>
        </span>
      </button>`,
        )
        .join("")
    : `<p class="empty">Nothing saved yet. Open a recipe and tap Save.</p>`;

  if (email) {
    syncEl.innerHTML = `<p>Your saved recipes are kept with ${escapeHtml(email)}, so they show up on any device where you sign in. <button type="button" class="ghost" data-signout>Sign out</button></p>`;
  } else if (syncAvailable()) {
    syncEl.innerHTML = `<form class="sync-form" data-signin>
        <label for="sync-email">Want these on your phone and computer? We'll email you a sign-in link. No password needed.</label>
        <span class="sync-row">
          <input id="sync-email" type="email" required placeholder="you@example.com" autocomplete="email" />
          <button type="submit" class="link-btn">Email me a link</button>
        </span>
        <span class="sync-note" role="status">${escapeHtml(syncNote)}</span>
      </form>`;
  } else {
    syncEl.innerHTML = "";
  }
}

savedEl.addEventListener("click", async (e) => {
  const card = e.target.closest("[data-saved]");
  if (card) {
    const meal = await getJSON(`lookup.php?i=${encodeURIComponent(card.dataset.saved)}`)
      .then((d) => d.meals?.[0])
      .catch(() => null);
    if (meal) openRecipe(toResult(meal));
    else statusEl.textContent = "That recipe wouldn't open. Check your connection and try again.";
  } else if (e.target.closest("[data-signout]")) {
    await signOut();
  }
});

savedEl.addEventListener("submit", async (e) => {
  if (!e.target.matches("[data-signin]")) return;
  e.preventDefault();
  const email = $("sync-email").value.trim();
  try {
    await sendSignInLink(email);
    syncNote = `Check ${email} for a sign-in link. Open it on this device.`;
  } catch (err) {
    syncNote = "That didn't send. Check the address and try again.";
    console.error(err);
  }
  renderSaved();
});

onSavedChange(renderSaved);

$("saved-link").addEventListener("click", (e) => {
  e.preventDefault();
  savedEl.querySelector("details").open = true;
  savedEl.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
});

$("veg").addEventListener("click", (e) => {
  vegOnly = !vegOnly;
  e.currentTarget.setAttribute("aria-pressed", String(vegOnly));
  if (vegOnly) track("veg");
  if (lastResults.length || resultsEl.querySelector(".empty")) cook();
});

/** Opens one good match at random, or any recipe at all when the list is empty. */
$("surprise").addEventListener("click", async () => {
  track("surprise");
  if (input.value.trim()) add(input.value);
  if (!pantry.length) {
    const meal = await getJSON("random.php")
      .then((d) => d.meals?.[0])
      .catch(() => null);
    if (meal) openRecipe(toResult(meal));
    else statusEl.textContent = "The recipe box is busy. Give it a few seconds and try again.";
    return;
  }
  // Results must match the list as it is now, not as it was before the last change.
  if (rerun || cookBtn.disabled || !lastResults.length) {
    clearTimeout(rerun);
    rerun = null;
    await cook();
  }
  const pool = lastResults.slice(0, 6);
  if (pool.length) openRecipe(pool[Math.floor(Math.random() * pool.length)]);
});

renderChips();
renderSaved();
track("visit");
fetch("api/config")
  .then((r) => (r.ok ? r.json() : {}))
  .then((c) => (services = c))
  .catch(() => {})
  .finally(finishKrogerSignIn);
$("nyt").addEventListener("click", () => track("nyt"));
startSync().catch((err) => console.error("Saved recipes sync:", err));
getJSON("list.php?i=list")
  .then((d) => {
    allIngredients = (d.meals ?? []).map((m) => m.strIngredient).filter(Boolean);
  })
  .catch(() => {
    // Suggestions are a nicety; searching still works with what people type.
  });
