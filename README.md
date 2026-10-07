# Cook This

**Tell it what's in your kitchen. It finds something delicious to make with it.**

**Live:** [cookthis.link](https://cookthis.link)

## Using it

1. **Add what you have.** Type a few ingredients (chicken, rice, lemon…) and pick from the suggestions, or tap one of the "Try" ideas.
2. **Or snap a photo.** Tap **Photo** in the box, or **Snap a photo** just below it, then take or choose a picture of your fridge, pantry, or cupboard. Cook This lists the food it spots; untick anything it got wrong and tap **Add these**. Multiple photos used one by one can be used to truly get your kitchens inventory in the search.
3. **Tap Find recipes.** Recipes are ranked by how close you are to cooking them: how many of your ingredients each one uses, and how few you'd need to buy.
4. **Open a recipe** to see what you have (✓), the basics you have (•), and what you'd need (+), with numbered steps and a video when there is one.
5. **Get what's missing.** Each thing you'd need links to a search for it at Instacart, Amazon Fresh, QFC, and Safeway, and **Copy list** copies them all for your own shopping app.
6. **Print** a clean copy of the recipe: just the photo, ingredients, and steps.

Untick "I have the basics" (salt, pepper, oil, butter, flour, sugar, water) to count those as missing too.

## Privacy

- **Photos** are shrunk in your browser, sent once to an AI vision service to identify ingredients, and never stored. Requests go only to providers that don't keep or train on data.
- **Recipe searches** send only ingredient names to [TheMealDB](https://www.themealdb.com).
- **Your ingredient list** is remembered in your own browser and nowhere else.

## How it works

A plain HTML, CSS, and JavaScript site with no build step, plus one small serverless function, hosted on Vercel.

- **Recipes** come from the free [TheMealDB](https://www.themealdb.com) API. Cook This looks up recipes for each ingredient (including close variants, so "Chicken" also finds "Chicken Thighs"), tallies the overlap, then loads the top matches to compare their ingredient lists with yours. American names are translated to TheMealDB's British ones, so "zucchini" finds recipes listed under "Courgettes".
- **Photo scanning** (`api/scan.js`) sends the photo to a vision model (Gemini Flash) through [OpenRouter](https://openrouter.ai) and returns the ingredients it sees. To keep costs in check, each visitor gets 15 scans a day, each server instance has a daily ceiling, and the OpenRouter key has its own spending cap.
- **Design:** a heavy Inter title, Fraunces for recipe names, Inter text, an ocean palette of sea mist, deep water, and teal, and motion that holds still for anyone who has reduced motion turned on.

| File | What it does |
|---|---|
| `index.html` | The page |
| `style.css` | The look |
| `app.js` | Ingredients, suggestions, recipe search, the recipe view, store links, and printing (store and affiliate settings are at the top) |
| `scan.js` | Shrinks a photo in the browser and sends it to the scanner |
| `api/scan.js` | The serverless function that asks the vision model what food it sees |

## Publishing

Every commit to the `master` branch publishes to cookthis.link automatically through Vercel, usually within a minute. Commits to other branches get their own preview address, so a change can be checked before it's merged. To undo a release, open the project's **Deployments** page on Vercel and promote an earlier version to production.

The old address, franklinpetra.github.io/cook_this, redirects here.

## Running it locally

1. Copy `.env.example` to `.env.local` and add an OpenRouter API key. `.env.local` is ignored by git and never uploaded.
2. Run `npx vercel dev` and open the address it prints.

On Vercel, the same key is set as the `OPENROUTER_API_KEY` environment variable. Give that key a spending limit in OpenRouter.

## Credits

Recipe data and images: [TheMealDB](https://www.themealdb.com). Built by [Petra Franklin](https://github.com/franklinpetra).
