// Finds ingredients in a photo. The photo is shrunk here, sent once to our /api/scan
// function, which asks a vision model what food it sees. Nothing is stored.

const HEIC = /^image\/hei[cf]/i;

/** True when this browser can draw the file as an image. */
function opens(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = (e) => {
      URL.revokeObjectURL(img.src);
      resolve(e.type === "load");
    };
    img.src = URL.createObjectURL(file);
  });
}

/**
 * The photo in a form this browser can show. iPhones save HEIC, which Safari opens but Chrome,
 * Firefox, and most Android browsers don't; those get a JPEG copy made right here, with a
 * converter that only loads when it's needed.
 */
export async function readPhoto(file) {
  const flagged = HEIC.test(file.type) || /\.hei[cf]$/i.test(file.name) || !file.type;
  if (!flagged || (await opens(file))) return file;
  const { heicTo, isHeic } = await import("./vendor/heic-to.js");
  if (!(await isHeic(file).catch(() => false))) throw new Error("That file doesn't look like a photo.");
  try {
    return await heicTo({ blob: file, type: "image/jpeg", quality: 0.9 });
  } catch {
    throw new Error("I couldn't open that HEIC photo. Try a screenshot of it, or a JPEG.");
  }
}

/** A smaller JPEG copy of the photo: quicker to send, and plenty for spotting food. */
function shrink(file, max = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("That file doesn't look like a photo."));
    img.src = URL.createObjectURL(file);
  });
}

/** The ingredients spotted in the photo (one readPhoto has returned): [{ name, sure }], most prominent first. */
export async function scanPhoto(file) {
  const image = await shrink(file);
  const res = await fetch("api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "The photo scanner is having trouble. Try again in a moment.");
  return data.ingredients || [];
}
