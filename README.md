# HelpingHands
This is the FIS hackathon project based off of my old helping hands business.

**Project Summary – Reward‑Link**

- Build a cross‑platform rewards system that works on both a web site and an iPhone app.
- The platform will communicate with a core‑banking system (FIS CORE), using a fake API for demo purposes that mimics the real
data format.
- Coupons and discounts will be “needs‑based” (e.g., groceries, utilities) rather than “wants”‑based, and will be backward
compatible with existing partner banks that use FIS CORE.
- Lower‑income households receive a larger loyalty return, with a simple income‑prediction model that estimates a relative
income tier from spending habits. This tier is shown in the user’s account tab.
- Users can link multiple bank accounts to a single person via a unique identifier code.
- A donation feature lets users transfer earned rewards to charities, and the app lists nearby charities with volunteer
opportunities.
- Gamification is applied to the donation process, providing points, badges, and leaderboards to encourage giving.

The core idea is a functional, needs‑focused rewards ecosystem that ties together core banking, personalized offers,
income‑aware benefits, charitable giving, and community volunteering.

---

**What's built:** a working web app and installable iPhone app (PWA) backed by a **simulated FIS core** that uses FIS-style data formats. It has needs-only offers chosen from real transaction history, income-tiered reward multipliers, multi-bank account linking by Helping Hands ID, real Jacksonville charities, Neighbor Funds that route gifts to model-detected lower-income households, and gamified giving. The site itself adapts to income: savings-first for lower-income members, giving-first for higher-income ones.

## Run it

```bash
npm install
npm run dev          # API + fake FIS core on :4000, web app on :5173
```

Open http://localhost:5173 and pick a demo member.

- **iPhone:** join the same Wi-Fi, open `http://<your-laptop-ip>:5173` in Safari, then Share → *Add to Home Screen*.
- **Single server:** `npm start` builds the client and serves everything from http://localhost:4000.
- **Deep link:** `/?member=HH-7KQ3-M2XA` signs straight in as Maya, which is handy for a QR code on a slide.

| Script | What it does |
|---|---|
| `npm run seed` | Regenerates the static DB and retrains the income and intent models (deterministic) |
| `npm run train` | Retrains the income model only |
| `npm run train-intent` | Retrains the intent model only and prints its test scores |
| `npm run pull-charities -- jacksonville-fl` | Refreshes a market's real charities from IRS data (ProPublica) and geocodes them (US Census) |
| `npm run reset` | Clears demo activity (points, offers, gifts, FIS postings) |
| `npm test` | Checks the static DB, both models, the nudge engine, needs filter, charity data and FIS API contract |

**Nudge settings** (environment variables, optional): `NUDGE_MAX_PER_DAY` (default 2 pop-ups a day), `NUDGE_COOLDOWN_HOURS` (default 48 before the same offer pops up again), `DEMO_MODE=false` to remove the simulator's *Ignore pop-up limits* option.

**Testing location on a phone:** browsers only share location with secure pages (https or localhost), so `http://<laptop-ip>:5173` can't use it. Run `npm start`, then open a temporary https tunnel to the laptop with `npx cloudflared tunnel --url http://localhost:4000` and use the https link it prints on the phone. Anyone with that link can open the demo while the tunnel runs; stop it with Ctrl+C.

## Demo walkthrough (about 4 minutes)

1. **Demo tab:** start here. The income spectrum puts the five members on one line by *predicted* income, from the two lowest-income members (Grace and Maya, whose order can swap depending on the day you seed) to Priya (99th percentile). The comparison table shows what changes: multiplier, offer values, and whether the site leads with savings or giving.
2. **Priya** (Summit, 1×, *giving first*): her Home leads with model-detected need. Springfield is 91% lower-income. Use *Give to neighbors*, pick **Arlington**, and her points are split among 10 lower-income households. She never sees who they are.
3. Switch to **Maya** in the Demo tab (Cornerstone, 3×, *savings first*). Her Home shows the gift from the Arlington Neighbor Fund. Maya was one of the 10.
4. **Rewards:** activate *Greenleaf Grocer*. It matches a grocery run she made last week (coupons are retroactive), and the partner settles through an FIS transfer. Wants are withheld.
5. **Give:** give to **Feeding Northeast Florida**, a real food bank with its IRS EIN shown. Harvest Table matches it 1:1.
6. **Moment of intent (Demo tab, as Maya):** the heatmap shows when she usually shops for groceries (Sunday mornings stand out). Press *Likeliest moment*: the simulator puts her at Greenleaf Grocer that morning and a nudge pops up with *Why?* reasons and two actions: activate the offer or pay with points (posted through FIS). Press *Check this moment* again: no new pop-up (no repeats within 48 hours), but *Open it again* brings the earlier nudge back, and Home's *Your nudges* list keeps every nudge for 7 days. Move *Where* to Meridian Fuel and press *Best time here* to see her best fill-up time. Try Tuesday 8 PM at the same store: no nudge, 1% chance.
7. **Demo tab again:** *How the model reads Maya* shows each spending signal pushing her estimate, where she lands in the community, the actual-vs-predicted scatter, need by neighborhood, the raw FIS API explorer, and the purchase simulator.

## How it works

```
React PWA ──/api──▶ Helping Hands API ──fisClient (HTTP)──▶ Fake FIS core /fis/v1 ──▶ static JSON DB
                    identity · income model · recommender     customers · accounts · transactions
                    wallet · points · donations              memo posts · transfers · ownership checks
                    neighbor funds · experience modes         + 264 synthetic households (expanded at start)
```

- **Fake FIS core** (`server/src/fis`): FIS IBS-style addressing (`instNbr`/`applCde`/`acctNbr`), abbreviated fields (`tranCde`, `drCrCde`, `postDt`, `mrchCatCde`, …), a metadata/status envelope, and `organization-id` + `x-api-key` headers. It's modeled on public conventions, not the licensed spec. All money movement is a posting in the core.
- **Swap in a real core:** `server/src/lib/fisClient.js` is the only code that talks to the core. Point `FIS_BASE_URL` at a gateway and remap fields there.
- **Static DB** (`server/data/seed`): 5 fictional FIS institutions, 5 demo members, and 264 synthetic households across 12 Jacksonville neighborhoods. The synthetic households are stored as deterministic recipes and expanded into about 62,000 transactions when the core starts. Dates slide forward on load in whole weeks, so the data is always current and weekday routines stay on the right weekday.
- **Real charities, by market:** `server/scripts/markets/jacksonville-fl.js` lists 16 Jacksonville nonprofits by EIN. `pull-charities` fetches their legal names and IRS addresses and geocodes them. Jacksonville is the first market; adding a city means adding a market file.
- **Income model:** ridge regression on log income over 12 spending features. It's sign-constrained so every explanation reads intuitively. Trained on 2,000 synthetic households from the same generator, it scores R² 0.93 on a holdout, with 99% of predictions within one tier. Percentiles map to tiers worth **3× / 2.25× / 1.6× / 1.25× / 1×**.
- **Shopping routines:** the generator gives every household habits: a usual grocery day and time, fuel and prescription refills on a rhythm, a bigger grocery run after payday for lower-income households, and about 1 in 8 trips off-routine. Every purchase carries a `tranTm` time.
- **Intent model:** logistic regression that estimates the chance a member buys groceries, fuel, pharmacy, home essentials or transit in a given time block (morning, midday, afternoon, evening). Clues: how often they buy, usual weekday, usual time, whether a routine is due, whether they just bought, payday timing, days of money left and spending pace. Trained on 320 synthetic households and tested on 80 households it never saw over 30 days it never saw: AUC 0.91 (frequency alone: 0.73), and its top 3 time slots of the week catch a real trip 80% of the time (hand-written rule of thumb: 72%, chance: 19%). Every score comes with plain-English reasons. Location is not a training input: the nudge engine applies it live at the moment of intent and doesn't store coordinates.
- **Nudge engine:** combines the intent model's timing, live distance to a partner store (a strong boost at the door that fades by a mile), and the offer's value on the member's typical purchase. It sends a nudge only when the member is at a partner store (within a quarter mile, about 400 m), never from home or down the street, when the live chance is at least 50% and the reward is worth $1 or more, at most 2 pop-ups a day and never the same offer within 48 hours, and returns the reasoning either way. The limits only control interruptions: every nudge stays in *Your nudges* on Home for 7 days. Coordinates are used inside the request and never saved; nudge history keeps the offer, its store and the time for 7 days (which is coarse location, so it's opt-in, capped and deletable via Reset). On Home, moment nudges are opt-in. *Pay with points* turns points into a statement credit posted through the core (Premium Payback style).
- **Experience modes:** Cornerstone and Foundation members get *savings first* (boosted offers lead). Keystone gets *save & give*. Pillar and Summit get *giving first*: Neighbor Funds, matches and charities lead, offers move down, and the nav puts Give ahead of Rewards.
- **Neighbor Funds:** a scoring job runs the model over every household through the FIS adapter. Donors pick an area (a neighborhood or the whole city) and a group (lower-income or lowest-income tiers), and points are split evenly. Groups under 10 households can't be targeted, and donors only see totals.
- **Coupons are backwards compatible:** they're card-linked (no new POS hardware), purchases from the 30 days *before* activation count, and a Code 39 barcode covers legacy registers.
- **Gamification without leaderboards:** impact score = points given. It drives levels, monthly streaks, badges (including *Good Neighbor*), partner matches and a community goal, with no dollar rankings.

## Notes

- **Charities are real** (names, EINs and IRS addresses from public records). Everything else is fictional: people, households, banks, merchants and routing numbers. Gifts, settlement accounts and impact figures are simulated for the demo; no money reaches any charity.
- Neighborhood income levels are illustrative inputs to the synthetic population, not census data.
- Showing an inferred income is sensitive. The app frames it as a benefit tier, explains the drivers, hides the dollar estimate by default and offers a review path. A real launch would need a fair-lending review and opt-in for Neighbor Fund eligibility.
- Photography is from Unsplash (see `client/public/images/CREDITS.md`).
