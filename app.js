// Cook This: add what's in your pantry, get recipes that use the most of it.
// Recipes come from TheMealDB's free API, which needs no secret key.

const API = "https://www.themealdb.com/api/json/v1/1";
const SAMPLES = ["Chicken", "Rice", "Garlic", "Eggs", "Tomatoes", "Pasta", "Lemon", "Cheese"];
const DETAILS_TO_FETCH = 16;
const STORE_KEY = "cook-this-pantry";
const MAX_PANTRY = 15;

// Words that make an ingredient a different thing ("Chicken Stock" isn't chicken).
const NOT_THE_SAME = ["spring", "stock", "powder", "sauce", "paste", "oil", "juice", "extract", "seasoning", "cube", "gravy"];

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
  return !b.some((w) => NOT_THE_SAME.includes(w) && !a.includes(w));
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
  const starts = allIngredients.find((n) => norm(n).startsWith(t));
  if (starts) return starts;
  // "Baby Carrots" → "Carrots": the longest known name whose words are all in what was typed.
  const typed = words(t).map(singular);
  const inside = allIngredients
    .filter((n) => words(n).map(singular).every((w) => typed.includes(w)))
    .sort((a, b) => b.length - a.length)[0];
  if (inside) return inside;
  return text.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function add(text) {
  const name = canonical(text);
  if (!name) return;
  if (!pantry.some((p) => norm(p) === norm(name)) && pantry.length < MAX_PANTRY) {
    pantry.push(name);
    save();
    renderChips();
  }
  input.value = "";
  hideSuggestions();
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

async function cook() {
  if (!pantry.length) {
    statusEl.textContent = "Add at least one thing from your kitchen first.";
    input.focus();
    return;
  }
  cookBtn.disabled = true;
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
    lastResults = details
      .filter(Boolean)
      .map((meal) => {
        const ings = classify(meal);
        return { meal, ings, have: ings.filter((i) => i.status === "have").length, need: ings.filter((i) => i.status === "need") };
      })
      .sort(byCookable);
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

function openRecipe(r) {
  const m = r.meal;
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
        ${m.strYoutube ? `<a href="${escapeHtml(m.strYoutube)}" target="_blank" rel="noopener">▶ Watch it made</a>` : ""}
        ${m.strSource ? `<a href="${escapeHtml(m.strSource)}" target="_blank" rel="noopener">Original recipe</a>` : ""}
      </div>
    </div>`;
  dialog.showModal();
  dialog.scrollTop = 0;
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

input.addEventListener("input", showSuggestions);
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

dialog.addEventListener("click", (e) => {
  if (e.target === dialog || e.target.closest("[data-close]")) dialog.close();
});

renderChips();
getJSON("list.php?i=list")
  .then((d) => {
    allIngredients = (d.meals ?? []).map((m) => m.strIngredient).filter(Boolean);
  })
  .catch(() => {
    // Suggestions are a nicety; searching still works with what people type.
  });
