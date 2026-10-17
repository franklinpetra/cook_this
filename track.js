// Counts what people do (see api/track.js). Never waits on the network and never breaks the page.

const ID_KEY = "cook-this-visitor";

/** A random id that lets us count daily visitors without knowing who anyone is. */
function visitor() {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

/** track("open", { detail: "Chicken Karaage", need: ["Mirin"] }) */
export function track(event, extra = {}) {
  if (!/^https:/.test(location.protocol)) return; // Not while working on it locally.
  try {
    const body = JSON.stringify({ event, visitor: visitor(), ...extra });
    if (!navigator.sendBeacon?.("api/track", new Blob([body], { type: "application/json" }))) {
      fetch("api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    }
  } catch {
    // Counting is never worth an error.
  }
}
