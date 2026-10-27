// Turns FIS-format account histories into "intent" clues: for a household, a category and a moment
// (day + time block), how likely is a purchase right now? Used by scripts/train-intent.js (synthetic
// households) and at runtime (a member's linked accounts). Only history before the moment is used.
import { categoryOf, CATEGORIES } from './mcc.js';
import { toDay } from './dates.js';

// Everyday needs with a routine worth predicting.
export const INTENT_CATEGORIES = ['groceries', 'fuel', 'pharmacy', 'household', 'transit'];

// A day split into four time blocks.
export const BLOCKS = [
  { key: 'morning', label: 'morning', from: 0, to: 11 },
  { key: 'midday', label: 'midday', from: 11, to: 15 },
  { key: 'afternoon', label: 'afternoon', from: 15, to: 19 },
  { key: 'evening', label: 'evening', from: 19, to: 24 },
];
export const blockOfHour = (hour) => BLOCKS.findIndex((b) => hour >= b.from && hour < b.to);
export const blockOf = (tranTm) => (tranTm ? blockOfHour(Number(tranTm.slice(0, 2))) : 1);
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const LOOKBACK = 120; // days of history the clues look at
const INCOME_CODES = new Set(['ACHC', 'DEP']);
const SPEND_CODES = new Set(['POS', 'ACHD', 'CCP']);

// The clues the model learns from. `hidden` features stay out of user-facing explanations.
export const INTENT_FEATURES = [
  { key: 'logRate', label: 'How often you buy this' },
  { key: 'dueClose', label: 'Due for a trip' },
  { key: 'tooSoon', label: 'Bought recently' },
  { key: 'dowLift', label: 'Usual day of the week' },
  { key: 'blockLift', label: 'Usual time of day' },
  { key: 'payWindow', label: 'Just got paid' },
  { key: 'logRunway', label: 'Days of money left' },
  { key: 'velocity', label: 'Spending pace this week' },
  { key: 'payGrocery', label: 'Payday grocery run' },
  { key: 'dueRoutine', label: 'Due for a refill or fill-up' },
  ...INTENT_CATEGORIES.map((c) => ({ key: `is_${c}`, label: CATEGORIES[c].label, hidden: true })),
];

const dayOfWeek = (n) => (n + 4) % 7; // 0 = Sunday (same as dates.js)

/**
 * Pre-sorts one household's history so clues for any moment are cheap to compute.
 * accounts: [{ applCde, txns }] with FIS fields (postDt, tranTm, tranCde, drCrCde, tranAmt, mrchCatCde, runBal, seqNbr).
 */
export function buildIndex(accounts) {
  const purchases = Object.fromEntries(INTENT_CATEGORIES.map((c) => [c, []]));
  const spendByDay = new Map();
  const paydays = [];
  const balances = []; // per checking account: [{ day, seq, runBal }] ascending
  let firstDay = Infinity;

  for (const acct of accounts) {
    const series = [];
    for (const t of acct.txns) {
      const day = toDay(t.postDt);
      firstDay = Math.min(firstDay, day);
      series.push({ day, seq: t.seqNbr ?? 0, tm: t.tranTm || '', runBal: t.runBal });
      if (t.drCrCde === 'C') {
        if (INCOME_CODES.has(t.tranCde)) paydays.push(day);
        continue;
      }
      if (!SPEND_CODES.has(t.tranCde)) continue;
      spendByDay.set(day, (spendByDay.get(day) || 0) + t.tranAmt);
      if (t.tranCde !== 'POS') continue;
      const cat = categoryOf(t);
      if (purchases[cat]) {
        const block = blockOf(t.tranTm);
        purchases[cat].push({ day, block, t: day * 4 + block });
      }
    }
    if (acct.applCde === 'DD' && series.length) {
      series.sort((a, b) => a.day - b.day || a.tm.localeCompare(b.tm) || a.seq - b.seq);
      balances.push(series);
    }
  }
  for (const c of INTENT_CATEGORIES) purchases[c].sort((a, b) => a.t - b.t);
  paydays.sort((a, b) => a - b);
  return { purchases, spendByDay, paydays, balances, firstDay: Number.isFinite(firstDay) ? firstDay : 0 };
}

// Checking balance at the end of `day` (sum across checking accounts).
function balanceAt(index, day) {
  let total = 0;
  for (const series of index.balances) {
    let lo = 0, hi = series.length - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (series[mid].day <= day) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    total += found >= 0 ? series[found].runBal : 0;
  }
  return total;
}

function spendBetween(index, from, to) {
  let s = 0;
  for (let d = from; d <= to; d++) s += index.spendByDay.get(d) || 0;
  return s;
}

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Shared, category-independent clues for a moment (money and pay timing). */
export function momentContext(index, day) {
  const lastPay = (() => {
    for (let i = index.paydays.length - 1; i >= 0; i--) if (index.paydays[i] <= day) return index.paydays[i];
    return null;
  })();
  const daysSincePay = lastPay === null ? 30 : day - lastPay;
  const spend30 = spendBetween(index, day - 30, day - 1);
  const spend7 = spendBetween(index, day - 7, day - 1);
  const avgDaily = spend30 / 30;
  const balance = balanceAt(index, day - 1);
  const runwayDays = avgDaily > 1 ? Math.min(60, Math.max(0, balance / avgDaily)) : 60;
  return {
    daysSincePay,
    runwayDays,
    balance,
    spend7,
    spend30,
    payWindow: daysSincePay <= 2 ? 1 : 0,
    logRunway: Math.log1p(runwayDays),
    velocity: Math.log((spend7 + 10) / ((spend30 * 7) / 30 + 10)),
  };
}

/**
 * Clues for one category at one moment. Returns { values, raw }: `values` feed the model, `raw` feeds
 * the plain-English explanation.
 */
export function intentFeatures(index, category, day, block, shared = momentContext(index, day)) {
  const tNow = day * 4 + block;
  const all = index.purchases[category];
  const events = [];
  for (const e of all) {
    if (e.t >= tNow) break;
    if (e.day >= day - LOOKBACK) events.push(e);
  }
  const histDays = Math.max(7, Math.min(LOOKBACK, day - index.firstDay));
  const tripDays = [...new Set(events.map((e) => e.day))];
  const gaps = tripDays.slice(1).map((d, i) => d - tripDays[i]);
  const usualGap = median(gaps) ?? Math.min(30, histDays);
  const lastDay = tripDays.length ? tripDays[tripDays.length - 1] : null;
  const since = lastDay === null ? histDays : day - lastDay;
  const ratio = since / Math.max(1, usualGap);
  const dow = dayOfWeek(day);
  const dowCount = tripDays.filter((d) => dayOfWeek(d) === dow).length;
  const blockCount = events.filter((e) => e.block === block).length;
  const perBlock = (events.length + 0.25) / (histDays * 4 + 4);

  // Each clue is a number the model weighs. "Lift" clues are log ratios against an even spread, so 0
  // means "no preference", positive means "more than usual", negative means "less than usual".
  // The small constants (0.3, 0.25...) are priors that keep new members with little history at 0.
  const values = {
    // Base rate: purchases in this category per time block over the lookback (log scale).
    logRate: Math.log(perBlock),
    // 1.0 when the time since the last trip equals their usual gap, fading either side (bell curve).
    dueClose: lastDay === null ? 0 : Math.exp(-((ratio - 1) ** 2) / (2 * 0.35 ** 2)),
    // How recently they already bought: 1 = earlier today, 0 = at or past the usual gap.
    tooSoon: lastDay === null ? 0 : since === 0 ? 1 : Math.max(0, 1 - ratio),
    // Share of their trips on this weekday vs. 1 in 7.
    dowLift: Math.log(((dowCount + 0.3) / (tripDays.length + 2.1)) * 7),
    // Share of their purchases in this time block vs. 1 in 4.
    blockLift: Math.log(((blockCount + 0.25) / (events.length + 1)) * 4),
    // Money clues, shared by every category for this moment (see momentContext).
    payWindow: shared.payWindow, // paid in the last 2 days
    logRunway: shared.logRunway, // days of money left at their usual pace (log)
    velocity: shared.velocity, // this week's spending vs. their normal pace (log ratio)
    // Category-specific effects: the big grocery run right after payday, and interval routines
    // (fuel, prescriptions) coming due.
    payGrocery: category === 'groceries' || category === 'household' ? shared.payWindow : 0,
    dueRoutine: category === 'fuel' || category === 'pharmacy' ? (lastDay === null ? 0 : Math.exp(-((ratio - 1) ** 2) / (2 * 0.35 ** 2))) : 0,
  };
  // One-hot category flags let the model learn a different baseline per category.
  for (const c of INTENT_CATEGORIES) values[`is_${c}`] = c === category ? 1 : 0;

  // Raw values for the plain-English reasons ("last trip 6 days ago, usually every 7").
  const raw = {
    category, day, block, weekday: WEEKDAYS[dow], blockLabel: BLOCKS[block].label,
    trips: tripDays.length, perWeek: (tripDays.length / histDays) * 7, since, usualGap, ratio,
    dowCount, blockCount, purchases: events.length,
    daysSincePay: shared.daysSincePay, runwayDays: shared.runwayDays, spend7: shared.spend7, spend30: shared.spend30,
  };
  return { values, raw };
}

/** Builds the index from a runtime member context (see context.js). */
export function indexFromContext(ctx) {
  return buildIndex(ctx.accounts.map((a) => ({ applCde: a.account.applCde, txns: a.txns })));
}
