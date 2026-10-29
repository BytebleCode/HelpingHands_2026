// Nudge engine: decides whether to surface a reward at a given moment, and explains why (or why not).
//
// How a decision is made (checkNudge):
//   1. The intent model scores how likely this member is to buy each everyday category right now
//      (from their history alone: usual day, usual time, routines due, payday, spending pace).
//   2. Live location narrows it to partner stores within NUDGE_RULES.maxMiles and boosts the odds
//      for stores they're standing at (proximityBoost).
//   3. Each nearby offer gets a dollar value on the member's typical purchase in that category.
//   4. The best offer is sent only if it is likely enough, worth enough, and within the limits
//      (a daily cap on interruptions and a cooldown before the same offer interrupts again).
//
// Interruptions vs. access: the limits only control how often a nudge pops up. Every nudge that was
// shown stays in the member's recent nudges (recentNudges) for NUDGE_RULES.keepDays, so they can
// always go back to it and activate the offer later.
//
// Privacy: location is used only inside the request. Nudge history stores the offer, the time and the
// dollar figures shown, never coordinates, distances or the location-based reasons.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { catalog, store, newId } from './store.js';
import { recommend, POINTS_PER_DOLLAR } from './rewards.js';
import { HttpError } from './context.js';
import { haversineMiles } from './geo.js';
import { indexFromContext, blockOfHour, BLOCKS, WEEKDAYS, INTENT_CATEGORIES } from './intentFeatures.js';
import { scoreMoment } from './intentModel.js';
import { toDay, fromDay } from './dates.js';
import { CATEGORIES } from './mcc.js';

// ------------------------------------------------------------------ model loading
// The trained model lives in data/seed/intent-model.json (written by `npm run train-intent`).
// Loaded once on first use, so a missing file gives a clear error instead of crashing at startup.
const MODEL_PATH = fileURLToPath(new URL('../../data/seed/intent-model.json', import.meta.url));
let model = null;
export function intentModel() {
  if (!model) {
    if (!existsSync(MODEL_PATH)) throw new HttpError(503, 'The intent model has not been trained yet. Run npm run seed.');
    model = JSON.parse(readFileSync(MODEL_PATH, 'utf8'));
  }
  return model;
}

// ------------------------------------------------------------------ rules
// Every threshold in one place so they're easy to explain and tune. The interruption limits can be
// changed without code: NUDGE_MAX_PER_DAY and NUDGE_COOLDOWN_HOURS environment variables.
const envNumber = (name, fallback) => (Number.isFinite(Number(process.env[name])) && process.env[name] !== '' ? Number(process.env[name]) : fallback);
export const NUDGE_RULES = {
  minConfidence: 0.5, // live chance (after location) that they're about to buy in this category
  minValue: 1, // dollars the reward is worth on their typical purchase
  maxPerDay: envNumber('NUDGE_MAX_PER_DAY', 2), // pop-ups per member per day (seeing old nudges is never limited)
  cooldownHours: envNumber('NUDGE_COOLDOWN_HOURS', 48), // before the same offer can pop up again
  nearMiles: 0.25, // "at the store"
  maxMiles: 1, // a nudge always points to a store the member is close to right now
  horizonDays: 14, // how far ahead the demo simulator can look
  keepDays: 7, // how long shown nudges stay in the member's recent list
};
// The demo simulator may skip the interruption limits so a presenter can repeat a moment. Turn this
// off for anything real with DEMO_MODE=false.
const DEMO_MODE = process.env.DEMO_MODE !== 'false';

// ------------------------------------------------------------------ small helpers
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const logit = (p) => Math.log(Math.max(1e-6, p) / Math.max(1e-6, 1 - p));
const round2 = (x) => Math.round(x * 100) / 100;
const miles1 = (m) => (m < 0.1 ? 'less than 0.1 mi' : `${m.toFixed(1)} mi`);
const HOUR_MS = 3_600_000;

// How much being near a store raises the odds of a purchase, in log-odds: +2.8 at the door, about +0.7
// half a mile away, close to nothing by a mile. Added to the model's log-odds, so timing still matters:
// standing in Greenleaf on a Tuesday night (1% timing) stays below the bar.
export const proximityBoost = (miles) => (miles == null ? 0 : 2.8 * Math.exp(-miles / 0.35));

const partnerById = Object.fromEntries(catalog.partners.map((p) => [p.id, p]));

// Turns { date: 'YYYY-MM-DD', time: 'HH:MM' } into a day number and time block, with validation.
function parseMoment(ctx, { date, time }) {
  const day = date ? toDay(String(date)) : ctx.today;
  if (!Number.isFinite(day)) throw new HttpError(400, 'Choose a valid date');
  if (day < ctx.today || day > ctx.today + NUDGE_RULES.horizonDays) throw new HttpError(400, `Pick a day in the next ${NUDGE_RULES.horizonDays} days`);
  const [h, m] = String(time || '12:00').split(':').map(Number);
  if (!(h >= 0 && h < 24) || !(m >= 0 && m < 60)) throw new HttpError(400, 'Choose a valid time');
  const hour = h + m / 60;
  const block = blockOfHour(hour);
  return {
    day, date: fromDay(day), time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    hour, block, weekday: WEEKDAYS[(day + 4) % 7], blockLabel: BLOCKS[block].label,
  };
}

// Location is optional. Returns null when not shared, throws on garbage input.
function parseLocation({ lat, lng }) {
  if (lat === undefined || lat === null || lng === undefined || lng === null) return null;
  const la = Number(lat), ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180) throw new HttpError(400, 'Invalid location');
  return { lat: la, lng: ln };
}

// What a typical purchase in this category costs this household (last 90 days), never below the offer minimum.
function typicalSpend(ctx, category, offer) {
  const c = ctx.summary.byCategory[category];
  const avg = c?.count ? c.total / c.count : 0;
  return Math.max(avg, offer.minSpend || 0);
}

// Dollars back on a purchase of `spend` with this offer (already boosted by the member's tier).
function rewardOn(offer, spend) {
  const v = offer.value;
  return v.kind === 'percent' ? Math.min((spend * v.rate) / 100, v.cap) : v.amount;
}

// The member's nudge history (stored in app state, survives restarts, cleared by `npm run reset`).
// Old entries are pruned so the list never grows without bound.
function history(hhid, today) {
  const all = (store.state.nudges ||= {});
  const list = (all[hhid] ||= []);
  const cutoff = fromDay(today - NUDGE_RULES.keepDays);
  if (list.some((n) => n.date < cutoff)) all[hhid] = list.filter((n) => n.date >= cutoff);
  return all[hhid];
}

// The part of a nudge the member sees. `reasons` is passed in so the stored version can leave out
// anything location-based.
function nudgeView({ id, offer, partner, value, spend, points, reasons, confidence = null, modelConfidence = null, distance = null }) {
  return {
    id,
    headline: `$${value.toFixed(2)} back on ${offer.categoryLabel.toLowerCase()} at ${partner.name}`,
    offer: {
      id: offer.id, title: offer.title, status: offer.status, image: offer.image, category: offer.category, categoryLabel: offer.categoryLabel,
      partner: { id: partner.id, name: partner.name }, value: offer.value, multiplier: offer.multiplier,
      minSpend: offer.minSpend, lookbackDays: offer.lookbackDays,
    },
    expectedReward: round2(value),
    typicalSpend: round2(spend),
    confidence: confidence == null ? null : round2(confidence),
    modelConfidence: modelConfidence == null ? null : round2(modelConfidence),
    distanceMiles: distance == null ? null : round2(distance),
    points: { balance: points, value: round2(points / POINTS_PER_DOLLAR), usable: points / POINTS_PER_DOLLAR >= 1 },
    reasons,
  };
}

// ------------------------------------------------------------------ the decision
/**
 * Should this member get a nudge at this moment? Returns the decision, the nudge (if any), the
 * candidates considered (so the demo can show the reasoning) and, when a limit stopped a pop-up, the
 * earlier nudge for the same offer so the member can open it again.
 *
 * input: { date: 'YYYY-MM-DD', time: 'HH:MM', lat?, lng?, record?, ignoreLimits? }
 *   record:       save the nudge to history (counts toward the limits). The demo and Home both set this.
 *   ignoreLimits: demo only (DEMO_MODE); skips the daily cap and cooldown so a moment can be replayed.
 */
export function checkNudge(ctx, input = {}) {
  const m = intentModel();
  const moment = parseMoment(ctx, input);
  const here = parseLocation(input);
  const skipLimits = DEMO_MODE && !!input.ignoreLimits;

  // 1. Timing: the intent model's chance per category for this day and time block.
  const index = indexFromContext(ctx);
  const intent = scoreMoment(m, index, { day: moment.day, block: moment.block });
  const byCat = Object.fromEntries(intent.map((s) => [s.category, s]));
  const points = store.state.points[ctx.hhid].balance;

  // 2-3. Candidates: needs-only offers (the existing recommender already withholds wants) at partner
  // stores with a known location, scored by live chance x dollar value.
  const offers = recommend(ctx).offers.filter((o) => INTENT_CATEGORIES.includes(o.category) && partnerById[o.partner.id]?.location);
  const candidates = offers.map((o) => {
    const s = byCat[o.category];
    const partner = partnerById[o.partner.id];
    const distance = here ? haversineMiles(here, partner.location) : null;
    const live = sigmoid(logit(s.probability) + proximityBoost(distance)); // timing + location
    const spend = typicalSpend(ctx, o.category, o);
    const value = rewardOn(o, spend);
    return { offer: o, partner, intent: s, distance, live, spend, value, score: live * value };
  }).sort((a, b) => b.score - a.score);

  // 4. Limits, measured in the moment's own time so the simulator behaves like a real day.
  const past = history(ctx.hhid, ctx.today);
  const momentTs = Date.parse(`${moment.date}T${moment.time}:00Z`);
  const shownToday = past.filter((n) => n.date === moment.date).length;
  const lastShown = (offerId) => past.filter((n) => n.offerId === offerId).sort((a, b) => b.ts - a.ts)[0];
  const coolingDown = (offerId) => {
    const prev = lastShown(offerId);
    return !!prev && Math.abs(momentTs - prev.ts) < NUDGE_RULES.cooldownHours * HOUR_MS;
  };

  // Only stores the member is actually near can nudge; then the bar for timing and value.
  const nearby = candidates.filter((c) => c.distance != null && c.distance <= NUDGE_RULES.maxMiles);
  // Stores they're standing at (within nearMiles) come first, so the nudge matches where they are;
  // a store down the street only wins when nothing at their current store qualifies.
  const atStore = (c) => c.distance <= NUDGE_RULES.nearMiles;
  const eligible = nearby
    .filter((c) => c.live >= NUDGE_RULES.minConfidence && c.value >= NUDGE_RULES.minValue)
    .sort((a, b) => Number(atStore(b)) - Number(atStore(a)) || b.score - a.score);

  let decision;
  let pick = null;
  let existing = null; // an earlier nudge for the best offer, when a limit stops a new pop-up
  if (!candidates.length) {
    decision = { sent: false, reason: 'No partner offers for the essentials this member usually buys' };
  } else if (!here) {
    decision = { sent: false, reason: 'No location shared, so there is no store to point to right now' };
  } else if (!nearby.length) {
    decision = { sent: false, reason: `No partner store within ${NUDGE_RULES.maxMiles} mile` };
  } else if (!eligible.length) {
    const top = nearby[0];
    decision = {
      sent: false,
      reason: top.live < NUDGE_RULES.minConfidence
        ? `Not confident enough: ${Math.round(top.live * 100)}% chance of buying ${top.intent.label.toLowerCase()} right now (needs ${Math.round(NUDGE_RULES.minConfidence * 100)}%)`
        : `Best reward nearby is worth only $${top.value.toFixed(2)}`,
    };
  } else if (!skipLimits && shownToday >= NUDGE_RULES.maxPerDay) {
    existing = lastShown(eligible[0].offer.id) || null;
    decision = { sent: false, limited: true, reason: `Already ${NUDGE_RULES.maxPerDay} pop-ups today, so this one waits. Earlier nudges are still in the member's list` };
  } else {
    pick = skipLimits ? eligible[0] : eligible.find((c) => !coolingDown(c.offer.id)) || null;
    if (pick) {
      decision = { sent: true, reason: 'Likely purchase, nearby partner, and a reward worth showing' };
    } else {
      existing = lastShown(eligible[0].offer.id) || null;
      decision = { sent: false, limited: true, reason: `Already shown in the last ${NUDGE_RULES.cooldownHours} hours. It's still in the member's list` };
    }
  }

  let nudge = null;
  if (pick) {
    const o = pick.offer;
    // Reasons, most concrete first: where they are, why now (from the model), what it's worth.
    const whyNow = pick.intent.reasons.slice(0, 2);
    const worth = o.multiplier > 1 ? `${o.value.headline} with your ${o.multiplier}× ${o.categoryLabel.toLowerCase()} boost` : `${o.value.headline} at ${pick.partner.name}`;
    const id = newId('ndg');
    nudge = nudgeView({
      id, offer: o, partner: pick.partner, value: pick.value, spend: pick.spend, points,
      reasons: [`You're ${miles1(pick.distance)} from ${pick.partner.name}`, ...whyNow, worth],
      confidence: pick.live, modelConfidence: pick.intent.probability, distance: pick.distance,
    });
    if (input.record) {
      // Stored without location: the offer, when, the figures shown and the timing reasons.
      past.push({ id, ts: momentTs, date: moment.date, time: moment.time, offerId: o.id, partnerId: pick.partner.id, value: round2(pick.value), spend: round2(pick.spend), whyNow, worth });
      store.save();
    }
  }

  return {
    moment: { date: moment.date, time: moment.time, weekday: moment.weekday, block: moment.blockLabel, located: !!here },
    decision: { ...decision, rules: NUDGE_RULES, demoMode: DEMO_MODE, limitsIgnored: skipLimits, shownToday: shownToday + (pick && input.record ? 1 : 0) },
    nudge,
    existing: existing ? recentView(ctx, existing, points) : null,
    // Best offer per store, so the demo table reads one row per place.
    candidates: candidates.filter((c, i) => candidates.findIndex((x) => x.partner.id === c.partner.id) === i).slice(0, 5).map((c) => ({
      offerId: c.offer.id, title: c.offer.title, category: c.offer.category, label: c.offer.categoryLabel, partner: c.partner.name,
      modelProbability: round2(c.intent.probability), liveProbability: round2(c.live),
      distanceMiles: c.distance == null ? null : round2(c.distance), value: round2(c.value),
    })),
    intent: intent.map((s) => ({ category: s.category, label: s.label, probability: round2(s.probability), reasons: s.reasons })),
  };
}

// ------------------------------------------------------------------ recent nudges (the member's list)
// Rebuilds a stored nudge with the offer's current status (active, redeemed...) and current points.
function recentView(ctx, entry, points, offersById = null) {
  const offers = offersById || Object.fromEntries(recommend(ctx).offers.map((o) => [o.id, o]));
  const offer = offers[entry.offerId];
  const partner = partnerById[entry.partnerId];
  if (!offer || !partner) return null; // the offer expired or was removed from the catalog
  return {
    shownAt: { date: entry.date, time: entry.time, weekday: WEEKDAYS[(toDay(entry.date) + 4) % 7] },
    nudge: nudgeView({ id: entry.id, offer, partner, value: entry.value, spend: entry.spend, points, reasons: [...(entry.whyNow || []), entry.worth].filter(Boolean) }),
  };
}

/** Nudges shown in the last NUDGE_RULES.keepDays days, newest first. Opening one never counts as a new pop-up. */
export function recentNudges(ctx) {
  const points = store.state.points[ctx.hhid].balance;
  const offersById = Object.fromEntries(recommend(ctx).offers.map((o) => [o.id, o]));
  // Newest first, one row per offer (a replayed demo moment shouldn't list the same offer twice).
  const seen = new Set();
  const items = [...history(ctx.hhid, ctx.today)]
    .sort((a, b) => b.ts - a.ts)
    .filter((e) => !seen.has(e.offerId) && seen.add(e.offerId))
    .map((e) => recentView(ctx, e, points, offersById))
    .filter(Boolean);
  return { nudges: items, rules: NUDGE_RULES };
}

// ------------------------------------------------------------------ week view and places (demo tab)
/** The member's next 7 days, 4 time blocks each, with the model's chance per category (no location). */
export function weekView(ctx) {
  const m = intentModel();
  const index = indexFromContext(ctx);
  const days = [];
  let best = null; // the single likeliest (day, block, category) of the week
  for (let day = ctx.today + 1; day <= ctx.today + 7; day++) {
    const blocks = BLOCKS.map((b, block) => {
      const scores = scoreMoment(m, index, { day, block });
      const probs = Object.fromEntries(scores.map((s) => [s.category, round2(s.probability)]));
      for (const s of scores) {
        if (!best || s.probability > best.probability) {
          best = { date: fromDay(day), weekday: WEEKDAYS[(day + 4) % 7], block: b.key, blockLabel: b.label, category: s.category, label: s.label, probability: round2(s.probability), reasons: s.reasons };
        }
      }
      return { block: b.key, label: b.label, probs };
    });
    days.push({ date: fromDay(day), weekday: WEEKDAYS[(day + 4) % 7], blocks });
  }
  const mt = m.metrics;
  return {
    categories: m.categories.map((c) => ({ key: c, label: CATEGORIES[c].label })),
    blocks: BLOCKS.map((b) => ({ key: b.key, label: b.label })),
    days,
    best,
    // Test scores saved by train-intent.js, shown on the demo's "How well it predicts" card.
    model: {
      type: m.type, trainedOn: mt.n - mt.testHouseholds, testHouseholds: mt.testHouseholds, testDays: mt.testDays,
      auc: mt.auc_model, aucRule: mt.auc_rule, aucFrequency: mt.auc_frequency,
      weeklyTop3: mt.weeklyTop3_model, weeklyTop3Rule: mt.weeklyTop3_rule, weeklyTop3Chance: mt.weeklyTop3_chance,
      meanPredicted: mt.meanPredicted, baseRate: mt.baseRate,
    },
    rules: NUDGE_RULES,
    demoMode: DEMO_MODE,
  };
}

/** Places the demo can "stand" at: home, plus every partner store for the categories the model predicts. */
export function placesFor(ctx) {
  const home = ctx.person.location;
  return {
    home: { id: 'home', name: 'Home', lat: home.lat, lng: home.lng, area: catalog.market.neighborhoods[home.label]?.name || null },
    stores: catalog.partners
      .filter((p) => p.location && INTENT_CATEGORIES.includes(p.category))
      .map((p) => ({ id: p.id, name: p.name, category: p.category, categoryLabel: CATEGORIES[p.category].label, lat: p.location.lat, lng: p.location.lng, milesFromHome: round2(haversineMiles(home, p.location)) }))
      .sort((a, b) => a.milesFromHome - b.milesFromHome),
  };
}
