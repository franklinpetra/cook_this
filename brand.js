// Everything a branded version of Cook This changes, in one place. The colors live at the top of
// style.css (:root), the name and tagline in index.html, and the Kroger banner in Vercel (KROGER_BANNER).
// A grocer's version usually means: their stores here, their colors there, and their logo in the footer.

// The "Try:" ideas under the search box.
export const SAMPLES = ["Chicken", "Rice", "Garlic", "Eggs", "Tomatoes", "Pasta", "Lemon", "Cheese"];

// Where "Get what's missing" sends people. An affiliate tag, once Petra has one, goes here;
// when any tag is set, the recipe view shows the required disclosure.
export const AFFILIATE = { amazonTag: "cookthis-20" };
export const STORES = [
  { name: "Instacart", url: (q) => `https://www.instacart.com/store/s?k=${encodeURIComponent(q)}` },
  {
    name: "Amazon Fresh",
    url: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}&i=amazonfresh${AFFILIATE.amazonTag ? `&tag=${encodeURIComponent(AFFILIATE.amazonTag)}` : ""}`,
  },
  { name: "QFC", url: (q) => `https://www.qfc.com/search?query=${encodeURIComponent(q)}&searchType=default_search` },
  { name: "Safeway", url: (q) => `https://www.safeway.com/shop/search-results.html?q=${encodeURIComponent(q)}` },
];
