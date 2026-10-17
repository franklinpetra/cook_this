// Cook This: add what's in your pantry, get recipes that use the most of it.
// Recipes come from TheMealDB's free API, which needs no secret key.

import { AFFILIATE, SAMPLES, STORES } from "./brand.js";
import { track } from "./track.js";
import { isSaved, onSavedChange, savedRecipes, sendSignInLink, signOut, startSync, syncAvailable, syncedEmail, toggleSaved } from "./saved.js";

const API = "https://www.themealdb.com/api/json/v1/1";
const DETAILS_TO_FETCH = 16;
const STORE_KEY = "cook-this-pantry";
const MAX_PANTRY = 15;

// Words that make an ingredient a different thing ("Chicken Stock" isn't chicken, "Peanut Butter" isn't butter).
const NOT_THE_SAME = [
  "spring", "stock", "powder", "sauce", "paste", "oil", "juice", "extract", "seasoning", "cube", "gravy",
  "peanut", "almond", "coconut", "soy", "oat", "ice", "vinegar", "wine", "noodle", "flour", "flake", "milk",
  "cream", "bread", "tortilla", "syrup", "bean", "condensed", "evaporated", "soya", "chocolate", "vermicelli",
  "krispy", "paper", "ketchup", "puree", "sun", "salt", "liver", "palm",
];
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
// Optional buy buttons, switched on server-side (api/config.js): { instacart: true, kroger: "QFC" }.
let services = {};
let shown = null; // the recipe open in the dialog

// --- Small helpers -----------------------------------------------------------

const norm = (s) => s.toLowerCase().trim();
const words = (s) => norm(s).split(/[\s-]+/).filter(Boolean);
const singular = (w) => (w.endsWith("oes") ? w.slice(0, -2) : w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((x) => typeof x === "string").slice(0, MAX_PANTRY) : [];
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

/** Does a recipe ingredient name count as one of yours? "Garlic" covers "Garlic Clove", not "Garlic Powder". */
function covers(mine, theirs) {
  const a = words(mine).map(singular);
  const b = words(theirs).map(singular);
  if (!a.every((w) => b.includes(w))) return false;
  const extra = b.filter((w) => !a.includes(w));
  if (a.length === 1 && a[0] === "pepper") return extra.every((w) => PEPPER_SPICE.includes(w));
  if (a.length === 1 && SQUEEZABLE.includes(a[0]) && extra.length === 1 && extra[0] === "juice") return true;
  return !extra.some((w) => NOT_THE_SAME.includes(w));
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
};

/** The best real ingredient name for what was typed, so searches use TheMealDB's own names. */
function canonical(text) {
  const t = norm(text);
  if (!t) return null;
  if (SAME_AS[t]) return SAME_AS[t];
  const exact = allIngredients.find((n) => norm(n) === t || singular(norm(n)) === singular(t));
  if (exact) return exact;
  // Only when it's unambiguous: "corn" could be Cornflour or Corn Tortillas, so it stays "Corn".
  const starts = allIngredients.filter((n) => norm(n).startsWith(t));
  if (starts.length === 1) return starts[0];
  // "Baby Carrots" → "Carrots": the longest known name whose words are all in what was typed.
  const typed = words(t).map(singular);
  const inside = allIngredients
    .filter((n) => words(n).map(singular).every((w) => typed.includes(w)))
    .sort((a, b) => b.length - a.length)[0];
  if (inside) return inside;
  return text.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** True when TheMealDB (or our American-name table) knows this exact ingredient. */
function known(text) {
  const t = norm(text);
  return Boolean(SAME_AS[t] || allIngredients.some((n) => norm(n) === t || singular(norm(n)) === singular(t)));
}

// Commas, semicolons, new lines and slashes separate items in a typed or pasted list; so do "&", "and" and
// "plus", unless they are part of a known name.
const SEPARATORS = /\s*[,;\n\/]\s*/;
const JOINERS = /\s*(?:[&+]|\band\b|\bplus\b)\s*/i;

// Words that describe the next item ("fresh limes"), and words that finish the one before ("curry paste").
const DESCRIBES = new Set(
  "fresh frozen dried canned tinned raw cooked leftover ripe baby large small big organic chopped sliced diced minced grated shredded smoked boneless skinless whole lean extra virgin".split(" "),
);
const FORMS = new Set("paste sauce powder leaves leaf seeds flakes stock broth oil juice zest puree cubes fillets fillet breasts breast thighs wings mince".split(" "));

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
  const parts = text.split(SEPARATORS).flatMap((part) => (known(part) ? [part] : part.split(JOINERS)));
  return parts.flatMap((part) => {
    const w = part.split(/\s+/).filter(Boolean);
    if (w.length < 2 || known(part)) return w.length ? [part.trim()] : [];
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
  const variants = [name, ...allIngredients.filter((n) => n !== name && covers(name, n)).slice(0, 5)];
  const lists = await Promise.all(variants.map((v) => getJSON(`filter.php?i=${encodeURIComponent(v)}`).catch(() => ({ meals: null }))));
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
    statusEl.textContent = "Add at least one thing from your kitchen first.";
    input.focus();
    return;
  }
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
    const candidates = [...tally.values()].sort((a, b) => b.hits - a.hits).slice(0, DETAILS_TO_FETCH);
    if (!candidates.length) {
      statusEl.textContent = "";
      resultsEl.innerHTML = `<p class="empty">Nothing yet with that combination. Try removing one ingredient, or add a staple like rice or eggs.</p>`;
      return;
    }

    // Full recipes, so we can show what you'd still need.
    const details = await Promise.all(
      candidates.map((c) =>
        getJSON(`lookup.php?i=${c.meal.idMeal}`)
          .then((d) => d.meals?.[0])
          .catch(() => null),
      ),
    );
    lastResults = details.filter(Boolean).map(toResult).sort(byCookable);
    render();
  } catch (err) {
    statusEl.textContent = "The recipe box is stuck. Check your connection and try again.";
    console.error(err);
  } finally {
    cookBtn.disabled = false;
  }
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
      return `<button type="button" class="card" data-open="${i}" style="animation-delay:${Math.min(i, 10) * 40}ms">
        <img src="${m.strMealThumb}/medium" alt="" loading="lazy" />
        <span class="card-body">
          <span class="card-title">${escapeHtml(m.strMeal)}</span>
          <span class="meta">${escapeHtml([m.strArea, m.strCategory].filter(Boolean).join(" · "))}</span>
          <span class="badges"><span class="badge uses">Uses ${r.have} of yours</span>${need}</span>
        </span>
      </button>`;
    })
    .join("");
}

/** Closest to cookable first: each of yours it uses counts double, each thing you'd buy counts against it. */
function byCookable(a, b) {
  return b.have * 2 - b.need.length - (a.have * 2 - a.need.length) || a.need.length - b.need.length;
}

/** Instruction lines, with short all-caps lines like "MARINATING THE CHICKEN" kept as section labels. */
function steps(text) {
  return (text || "")
    .split(/\r?\n+/)
    .map((s) => s.replace(/^\s*(step\s*\d+[:.)]?|\d+[.)])\s*/i, "").trim())
    .filter((s) => s.length > 2)
    .map((s) => {
      const bare = s.replace(/^[-–—•*\s]+|[:\s]+$/g, "");
      const heading = bare.length < 60 && bare === bare.toUpperCase() && /[A-Z]/.test(bare);
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
              <span class="shop-links">${STORES.map((s) => `<a href="${escapeHtml(s.url(name))}" target="_blank" rel="noopener" data-store="${escapeHtml(s.name)}">${s.name}</a>`).join("")}</span>
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

function openRecipe(r) {
  const m = r.meal;
  shown = r;
  const marks = { have: "✓", staple: "•", need: "+" };
  const labels = { have: "You have this", staple: "A basic you have", need: "You'd need this" };
  dialog.innerHTML = `
    <div class="recipe-hero">
      <img src="${m.strMealThumb}" alt="" />
      <button type="button" class="close" data-close aria-label="Close">×</button>
    </div>
    <div class="recipe-body">
      <p class="meta">${escapeHtml([m.strArea, m.strCategory].filter(Boolean).join(" · "))}</p>
      <h2 id="recipe-title">${escapeHtml(m.strMeal)}</h2>
      <p class="save-row">${saveButton(m.idMeal)}</p>
      ${shopPanel(r.need)}
      <h3>Ingredients</h3>
      <ul class="ingredients">
        ${r.ings
          .map(
            (i) =>
              `<li class="${i.status}"><span class="mark" aria-label="${labels[i.status]}">${marks[i.status]}</span><span>${escapeHtml(i.name)} <span class="measure">${escapeHtml(i.measure)}</span></span></li>`,
          )
          .join("")}
      </ul>
      <h3>How to make it</h3>
      <ol class="steps">${steps(m.strInstructions)
        .map((s) => (s.heading ? `<li class="sub">${escapeHtml(s.text)}</li>` : `<li>${escapeHtml(s.text)}</li>`))
        .join("")}</ol>
      <div class="links">
        ${m.strYoutube ? `<a href="${escapeHtml(m.strYoutube)}" target="_blank" rel="noopener" data-video>▶ Watch it made</a>` : ""}
        ${m.strSource ? `<a href="${escapeHtml(m.strSource)}" target="_blank" rel="noopener">Original recipe</a>` : ""}
        <button type="button" class="link-btn" data-print>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v6H7z"/></svg>
          Print
        </button>
      </div>
      <p class="print-only">Recipe from TheMealDB · found with Cook This, cookthis.link</p>
    </div>`;
  dialog.showModal();
  dialog.scrollTop = 0;
  track("open", { detail: m.strMeal, need: r.need.map((n) => n.name) });
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
  scanEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
  add(`${input.value} ${text}`);
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
  buyNote("Making your Instacart list…");
  try {
    const res = await fetch("api/instacart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: r.meal.strMeal, image: r.meal.strMealThumb, items: r.need.map((n) => ({ name: n.name, measure: n.measure })) }),
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
async function addToKroger(items, show = buyNote) {
  track("kroger");
  show("Finding your ingredients at the store…");
  try {
    const res = await fetch("api/kroger/cart", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
    const data = await res.json().catch(() => ({}));
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
  if (items.length) addToKroger(items, notice);
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
  savedListEl.innerHTML = list.length
    ? list
        .map(
          (r) => `<button type="button" class="card" data-saved="${escapeHtml(r.id)}">
        <img src="${escapeHtml(r.thumb)}/medium" alt="" loading="lazy" />
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
