# Cook This

**Tell it what's in your kitchen. It finds something delicious to make with it.**

**Live:** [cookthis.link](https://cookthis.link)

## What makes it good

- **Type it however it comes out.** Rattle off "turkey edamame heavy cream tofu" with no commas and no Return key, and Cook This splits it into four ingredients. It knows "heavy cream" and "cherry tomatoes" are one thing each, keeps "fresh thyme" and "curry paste" together, and keeps foods it has never heard of instead of dropping them.
- **Forgives typos.** "brocoli tumeric chiken" becomes Broccoli, Turmeric, Chicken.
- **Speaks American.** Zucchini, cilantro, shrimp, heavy cream, and ground beef all find the British-named recipes in TheMealDB.
- **Honest about what you have.** Butter isn't peanut butter, rice isn't rice vinegar, and black pepper isn't a bell pepper, so "Ready to cook" means ready to cook. Lemons do count as lemon juice.
- **Or just take a picture** of your fridge and let AI list what's in it.
- **One tap to buy what's missing.** **Shop ingredients** sends just the missing items to an Instacart page where you pick your store, and **Add to my QFC cart** puts them straight into your Kroger-family cart.
- **NYT Cooking subscribers** can send the same ingredient list to a New York Times Cooking search with one tap from the bottom of the page.

## Using it

1. **Add what you have.** Type a few ingredients (chicken, rice, lemon…) and pick from the suggestions, or tap one of the "Try" ideas. A whole list works too: "limes, chicken, cheese, bread" or just "turkey edamame heavy cream tofu" adds each one, and small typos like "brocoli" are fixed. The list holds up to 15 ingredients.
2. **Or snap a photo.** Tap **Photo** in the box, or **Snap a photo** just below it, then take or choose a picture of your fridge, pantry, or cupboard. Cook This lists the food it spots; untick anything it got wrong and tap **Add these**. Multiple photos used one by one can be used to truly get your kitchen's inventory in the search.
3. **Tap Find recipes.** Recipes are ranked by how close you are to cooking them: how many of your ingredients each one uses, and how few you'd need to buy.
4. **Open a recipe** to see what you have (✓), the basics you have (•), and what you'd need (+), with numbered steps and a video when there is one.
5. **Get what's missing.** Tap **Shop ingredients** for an Instacart page with everything you need, or **Add to my QFC cart** to sign in to your Kroger account and fill your cart. Each item also links to a search for it at Instacart, Amazon Fresh, QFC, and Safeway, and **Copy list** copies them all for your own shopping app.
6. **Save** recipes you like with the **Save** button under the recipe's name. They appear under **Your saved recipes**, with no account needed. To see them on another device too, enter your email there and open the sign-in link it sends.
7. **Print** a clean copy of the recipe: just the photo, ingredients, and steps.
8. **Subscribe to NYT Cooking?** The link at the bottom of the page searches New York Times Cooking for the ingredients on your list.

Untick "I have the basics" (salt, pepper, oil, butter, flour, sugar, water) to count those as missing too.

## Privacy

- **Photos** are shrunk in your browser, sent once to an AI vision service to identify ingredients, and never stored. Requests go only to providers that don't keep or train on data.
- **Recipe searches** send only ingredient names to [TheMealDB](https://www.themealdb.com).
- **Your ingredient list** is remembered in your own browser and nowhere else.
- **Usage counts:** Cook This counts visits, searches, recipe opens, and store clicks, plus which ingredients people have and need, so we know what's working. No names, emails, IP addresses, or cookies are kept; a random number in your browser lets us count daily visitors without knowing who anyone is.
- **Kroger sign-in** happens on Kroger's own page. Cook This only gets permission to add to your cart, and that permission stays in a cookie only our server can read.
- **Saved recipes** stay in your browser. Only if you choose to sign in are they also kept in our database, alongside your email address, so they can follow you to other devices. Each person can read only their own.

## How it works

A plain HTML, CSS, and JavaScript site with no build step, plus one small serverless function, hosted on Vercel.

- **Recipes** come from the free [TheMealDB](https://www.themealdb.com) API. Cook This looks up recipes for each ingredient (including close variants, so "Chicken" also finds "Chicken Thighs"), tallies the overlap, then loads the top matches to compare their ingredient lists with yours. American names are translated to TheMealDB's British ones, so "zucchini" finds recipes listed under "Courgettes".
- **Reading a typed list:** commas, new lines, and "and" split items; without them, Cook This finds the longest known ingredient name at each word, attaches describing words ("fresh", "frozen") and form words ("paste", "leaves") to their neighbour, corrects near-miss spellings of known ingredients, and keeps anything else as its own item.
- **Matching:** your "Chicken" covers a recipe's "Chicken Thighs", but words that make something a different food ("stock", "peanut", "vinegar", "ice", "condensed"…) don't count, so a recipe only says "Ready to cook" when it is.
- **Photo scanning** (`api/scan.js`) sends the photo to a vision model (Gemini Flash) through [OpenRouter](https://openrouter.ai) and returns the ingredients it sees. To keep costs in check, each visitor gets 15 scans a day, each server instance has a daily ceiling, and the OpenRouter key has its own spending cap.
- **Buying** (`api/instacart.js`, `api/kroger/`): the Instacart Developer Platform turns the missing ingredients into a shoppable Instacart page, with affiliate tracking added by Instacart. Kroger's API signs the shopper in, finds a product for each missing ingredient, and adds them to their cart. Each button only appears once its keys are set.
- **Usage counts** (`api/track.js`, `stats.html`): daily counts in a small Upstash Redis database, readable at [cookthis.link/stats.html](https://cookthis.link/stats.html) with the stats password.
- **Branded versions:** colors are tokens at the top of `style.css`, and stores, affiliate tags, and the "Try" ideas are in `brand.js`, so a grocer's own version is mostly a settings change.
- **Design:** a heavy Inter title, Fraunces for recipe names, Inter text, an ocean palette of sea mist, deep water, and teal, and motion that holds still for anyone who has reduced motion turned on.

| File | What it does |
|---|---|
| `index.html` | The page |
| `style.css` | The look |
| `app.js` | Ingredients, suggestions, recipe search, the recipe view, store links, and printing (store and affiliate settings are at the top) |
| `brand.js` | Stores, affiliate tags, and the "Try" ideas: what a branded version changes |
| `track.js` | Sends anonymous usage counts |
| `stats.html` | The private usage page |
| `api/track.js`, `api/stats.js` | Record and read usage counts |
| `api/instacart.js` | Makes the Instacart shopping page |
| `api/kroger/` | Kroger sign-in and adding to the cart |
| `api/config.js` | Tells the page which buy buttons are switched on |
| `saved.js` | Saved recipes: kept in the browser, and synced through Supabase for people who sign in (sync settings are at the top) |
| `supabase/schema.sql` | The saved-recipes table and the rules that keep each person's saves private |
| `scan.js` | Shrinks a photo in the browser and sends it to the scanner |
| `api/scan.js` | The serverless function that asks the vision model what food it sees |

## Publishing

Every commit to the `master` branch publishes to cookthis.link automatically through Vercel, usually within a minute. Commits to other branches get their own preview address, so a change can be checked before it's merged. To undo a release, open the project's **Deployments** page on Vercel and promote an earlier version to production.

The old address, franklinpetra.github.io/cook_this, redirects here.

## Running it locally

1. Copy `.env.example` to `.env.local` and add an OpenRouter API key. `.env.local` is ignored by git and never uploaded.
2. Run `npx vercel dev` and open the address it prints.

On Vercel, the same key is set as the `OPENROUTER_API_KEY` environment variable. Give that key a spending limit in OpenRouter.

## Switching on the extras

All of these are set in Vercel under **Settings → Environment Variables**, then take effect on the next deploy (or **Deployments → Redeploy**).

**Usage counts**
1. In Vercel, open **Storage → Create Database → Upstash (Redis)**, pick the free plan, and connect it to this project. Vercel adds its keys for you.
2. Add `STATS_TOKEN`, a long password of your choosing. Open cookthis.link/stats.html and enter it.

**Instacart "Shop ingredients"**
1. Sign up at [instacart.com/company/business/developers](https://www.instacart.com/company/business/developers) and create a **development** API key.
2. Add it as `INSTACART_API_KEY`. The button appears and makes test pages.
3. When Instacart approves production, create a production key, swap it in, and add `INSTACART_ENV` = `production`.
4. Join the affiliate program through Impact from the link Instacart emails you. Commissions are tracked automatically.

**Kroger "Add to my cart"**
1. At [developer.kroger.com](https://developer.kroger.com), create an application with the **Cart** and **Products** APIs and the redirect URI `https://cookthis.link/api/kroger/callback`.
2. Add `KROGER_CLIENT_ID` and `KROGER_CLIENT_SECRET`. Optionally set `KROGER_BANNER` (`qfc` by default; also `kroger`, `fredmeyer`, `ralphs`).

## Turning on saved-recipe syncing

Saving works on each device without this. To let people sign in and see their saves everywhere:

1. Create a free project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, paste the contents of `supabase/schema.sql` and run it.
3. In **Authentication → URL Configuration**, set the Site URL to `https://cookthis.link` and add `https://cookthis.link` as a redirect URL.
4. From **Settings → API**, copy the Project URL and the anon public key into `SYNC` at the top of `saved.js`. Both are safe to publish, because the table's rules only let each person reach their own rows.

Supabase's built-in email sender is limited to a few sign-in emails an hour. Before many people use it, connect your own email service under **Authentication → SMTP Settings**.

## Credits

Recipe data and images: [TheMealDB](https://www.themealdb.com). Built by [Petra Franklin](https://github.com/franklinpetra).
