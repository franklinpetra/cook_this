// Finds ingredients in a photo, entirely in the browser: the photo never leaves the device.
// Uses OWLv2, an open-vocabulary object detector, through Transformers.js. The model
// (about 155 MB) downloads once, the first time someone scans, and the browser keeps it.

const LIBRARY = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
const MODEL = "Xenova/owlv2-base-patch16-ensemble";

// What the scanner looks for: how to describe it to the model, and TheMealDB's name for it.
const LOOK_FOR = [
  ["eggs", "Eggs"], ["a carton of milk", "Milk"], ["butter", "Butter"], ["a block of cheese", "Cheese"],
  ["yogurt", "Greek Yogurt"], ["raw chicken", "Chicken"], ["ground beef", "Minced Beef"], ["bacon", "Bacon"],
  ["a salmon fillet", "Salmon"], ["tomatoes", "Tomatoes"], ["an onion", "Onions"], ["garlic", "Garlic"],
  ["potatoes", "Potatoes"], ["carrots", "Carrots"], ["broccoli", "Broccoli"], ["spinach", "Spinach"],
  ["lettuce", "Lettuce"], ["a cucumber", "Cucumber"], ["a bell pepper", "Red Pepper"], ["mushrooms", "Mushrooms"],
  ["a lemon", "Lemon"], ["a lime", "Lime"], ["apples", "Apples"], ["bananas", "Bananas"], ["oranges", "Oranges"],
  ["an avocado", "Avocado"], ["celery", "Celery"], ["ginger root", "Ginger"], ["a bag of rice", "Rice"],
  ["dry pasta", "Pasta"], ["a loaf of bread", "Bread"], ["a can of tomatoes", "Chopped Tomatoes"],
  ["a can of beans", "Kidney Beans"], ["chickpeas", "Chickpeas"], ["corn", "Sweetcorn"], ["peas", "Peas"],
  ["a jar of honey", "Honey"], ["peanut butter", "Peanut Butter"], ["oats", "Oats"], ["a zucchini", "Courgettes"],
  ["a cabbage", "Cabbage"], ["strawberries", "Strawberries"], ["a bottle of olive oil", "Olive Oil"], ["tofu", "Tofu"],
];

/** At or above this, an item starts ticked; between the two, it's offered unticked. */
export const SURE = 0.4;
const MAYBE = 0.1;
const MAX_SHOWN = 12;

let detector = null;

async function load(onProgress) {
  if (detector) return detector;
  const { pipeline, env } = await import(LIBRARY);
  env.allowLocalModels = false;
  const loaded = new Map();
  detector = await pipeline("zero-shot-object-detection", MODEL, {
    dtype: "q8",
    progress_callback: (p) => {
      if (p.status === "progress" && p.total) {
        loaded.set(p.file, [p.loaded, p.total]);
        const [got, all] = [...loaded.values()].reduce(([a, b], [x, y]) => [a + x, b + y], [0, 0]);
        onProgress?.(got / all);
      }
    },
  });
  return detector;
}

/** A smaller copy of the photo: faster to read, and plenty for spotting food. */
function shrink(file, max = 800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => reject(new Error("That file doesn't look like a photo."));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * The ingredients the scanner thinks it sees, most likely first.
 * Calls onStage("download", fraction) while the model loads, then onStage("look").
 */
export async function scanPhoto(file, onStage) {
  const [run, dataUrl] = await Promise.all([load((f) => onStage?.("download", f)), shrink(file)]);
  onStage?.("look");
  const { RawImage } = await import(LIBRARY);
  const image = await RawImage.fromURL(dataUrl);
  const found = await run(image, LOOK_FOR.map(([q]) => q), { threshold: MAYBE });
  const best = new Map();
  for (const f of found) {
    const name = LOOK_FOR.find(([q]) => q === f.label)?.[1];
    if (name && f.score > (best.get(name) ?? 0)) best.set(name, f.score);
  }
  return [...best.entries()]
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SHOWN);
}
