# Cook This 🍲

**Tell it what's in your kitchen. It finds something delicious to make with it.**

**Live:** [franklinpetra.github.io/cook_this](https://franklinpetra.github.io/cook_this/)

- Add a few things you have (chicken, rice, lemon…). Suggestions appear as you type.
- Tap **Cook this!** and get recipes ranked by how close you are to cooking them: how many of your ingredients each one uses, and how few you'd need to buy.
- Open a recipe to see what you have (✓), the basics you have (•), what you'd need (+), the steps, and a video when there is one.
- Tick or untick "I have the basics" (salt, pepper, oil, butter, flour, sugar, water) to change what counts as missing.

The search box wriggles. It's a hand-drawn "line boil" made with an SVG noise filter, and it wriggles faster while you type. It holds still for anyone who has reduced motion turned on.

## How it works

A plain HTML, CSS, and JavaScript site with no build step and no secret keys, served by GitHub Pages. Recipes come from the free [TheMealDB](https://www.themealdb.com) API: Cook This looks up recipes for each of your ingredients (and close variants, so "Chicken" also finds "Chicken Thighs"), tallies the overlap, then loads the top matches to compare their ingredient lists with yours. Your list is remembered in your own browser.

To run it locally, serve the folder with any static server, for example `python3 -m http.server`, and open http://localhost:8000.

Built by [Petra Franklin](https://github.com/franklinpetra).
