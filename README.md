# Cook This 🍲

**Tell it what's in your kitchen. It finds something delicious to make with it.**

**Live:** [franklinpetra.github.io/cook_this](https://franklinpetra.github.io/cook_this/)

- Add a few things you have (chicken, rice, lemon…). Suggestions appear as you type. Or tap **Photo** and snap your fridge, pantry, or cupboard; you tick what it got right.
- Tap **Cook this!** and get recipes ranked by how close you are to cooking them: how many of your ingredients each one uses, and how few you'd need to buy.
- Open a recipe to see what you have (✓), the basics you have (•), what you'd need (+), the steps, and a video when there is one.
- Tick or untick "I have the basics" (salt, pepper, oil, butter, flour, sugar, water) to change what counts as missing.

The design is editorial and calm: Fraunces headlines, Inter text, warm neutrals with a terracotta accent, and motion that stays still for anyone who has reduced motion turned on.

## How it works

A plain HTML, CSS, and JavaScript site plus one small serverless function, hosted on Vercel.

- **Recipes** come from the free [TheMealDB](https://www.themealdb.com) API. Cook This looks up recipes for each of your ingredients (and close variants, so "Chicken" also finds "Chicken Thighs"), tallies the overlap, then loads the top matches to compare their ingredient lists with yours. American names like "zucchini" are translated to TheMealDB's ("Courgettes").
- **Photo scanning** (`api/scan.js`): the photo is shrunk in the browser and sent once to a vision model (Gemini Flash) through OpenRouter, using only providers that don't store or train on data. Nothing is saved. Each visitor gets 15 scans a day, and the OpenRouter key has its own spending cap.
- Your ingredient list is remembered in your own browser.

## Run it locally

Put an OpenRouter key in `.env.local` (see `.env.example`), then run `npx vercel dev` and open the address it prints.

Built by [Petra Franklin](https://github.com/franklinpetra).
