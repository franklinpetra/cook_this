// Finds ingredients in a photo. The photo is shrunk here, sent once to our /api/scan
// function, which asks a vision model what food it sees. Nothing is stored.

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

/** The ingredients spotted in the photo: [{ name, sure }], most prominent first. */
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
