// Deterministic household + transaction generator. The seed (demo personas) and the income-model
// training set both use it, so features computed on personas match what the model was trained on.
import { PARTNERS, OTHER_MERCHANTS } from './catalog-data.js';
import { categoryOf } from '../src/lib/mcc.js';
import { fromDay, dayOfWeek, dayOfMonth } from '../src/lib/dates.js';

// ---------- randomness ----------
export function makeRandom(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = {
    next,
    uniform: (a, b) => a + (b - a) * next(),
    int: (a, b) => Math.floor(a + (b - a + 1) * next()),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    normal: () => {
      let u = 0;
      while (u === 0) u = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
    },
    lognormal: (mu, sigma) => Math.exp(mu + sigma * r.normal()),
    poisson: (lambda) => {
      if (lambda <= 0) return 0;
      if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * r.normal()));
      const L = Math.exp(-lambda);
      let k = 0, p = 1;
      do { k++; p *= next(); } while (p > L);
      return k - 1;
    },
  };
  return r;
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round2 = (x) => Math.round(x * 100) / 100;

// ---------- shopping habits ----------
// Real households shop on routines: a usual grocery day, a fuel stop every week or so, monthly refills,
// a usual time of day, a bigger run right after payday. The intent model learns to predict these
// routines, so the generator has to produce them (pure day-by-day dice rolls have no pattern to learn).
const HABIT_KIND = {
  groceries: 'weekly', household: 'weekly',
  fuel: 'interval', pharmacy: 'interval', medical: 'interval', auto: 'interval', school: 'interval', clothing: 'interval',
  transit: 'commute',
};
// Usual hour options per category: [mean hour, spread]. Each household settles on one.
const HOUR_OPTIONS = {
  groceries: [[10, 1.2], [18, 1]], household: [[11, 1.5], [18, 1]], fuel: [[7.5, 0.7], [17.5, 0.8]],
  pharmacy: [[13, 1.5], [17.5, 1]], medical: [[10, 1.5], [14, 1.5]], auto: [[9, 1], [13, 1.5]],
  school: [[16, 1.5]], clothing: [[14, 2]], transit: [[7.5, 0.6], [16.5, 0.8]],
  fastfood: [[12.5, 0.8], [18.5, 1]], dining: [[19, 0.8]], bars: [[21.5, 0.8]], entertainment: [[19.5, 1.2]],
  electronics: [[15, 2]], rideshare: [[21, 2]], travel: [[11, 3]], luxury: [[14, 2]], altfinance: [[12, 2]],
};
// Wants lean toward the weekend.
const WEEKEND_LEANING = new Set(['dining', 'bars', 'entertainment', 'fastfood']);
const DOW_WEIGHT = [1.2, 0.75, 0.75, 0.75, 0.75, 1.6, 1.6]; // Sun..Sat

const clampHour = (h) => clamp(h, 6, 22.9);
const fmtTime = (hour) => {
  const mins = Math.round(clampHour(hour) * 60);
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:00`;
};

function gammaGap(hr, mean, shape = 6) {
  let s = 0;
  for (let i = 0; i < shape; i++) s -= Math.log(1 - hr.next());
  return Math.max(1, Math.round((s * mean) / shape));
}

// Move a day to the household's usual weekday when it is within maxShift days.
function snapToDow(d, dow, maxShift = 2) {
  const fwd = (dow - dayOfWeek(d) + 7) % 7;
  const shift = fwd > 3 ? fwd - 7 : fwd;
  return Math.abs(shift) <= maxShift ? d + shift : d;
}

/** Each household's routines: usual day(s), usual hour and trip rhythm per category. Profiles may override. */
function buildHabits(p, B, hr) {
  const habits = {};
  for (const [cat, monthly] of Object.entries(B.pos)) {
    if (monthly <= 0) continue;
    const opts = HOUR_OPTIONS[cat] || [[13, 2]];
    const [mean, spread] = hr.pick(opts);
    const hour = clampHour(mean + hr.normal() * spread * 0.6);
    const morning = hour < 12.5;
    // Weekend-morning shoppers mostly pick Saturday or Sunday; evening shoppers mostly pick a weekday.
    const dow = morning ? (hr.chance(0.75) ? hr.pick([0, 6]) : hr.int(1, 5)) : (hr.chance(0.75) ? hr.int(1, 5) : hr.pick([0, 6]));
    const dow2 = (dow + 3 + hr.int(0, 1)) % 7;
    habits[cat] = { kind: HABIT_KIND[cat] || 'random', hour, dow, dow2, tripsPerMonth: monthly / ticketFor(cat, p), ...(p.habits?.[cat] || {}) };
  }
  // Home essentials usually ride along on the grocery trip.
  if (habits.household && habits.groceries) {
    habits.household = { ...habits.household, dow: habits.groceries.dow, hour: habits.groceries.hour, ...(p.habits?.household || {}) };
  }
  return habits;
}

/** Trip days for one routine category: [{ d, weight }], weight scales the ticket. */
function scheduleTrips(h, { startDay, endDay, paydays, stockUpAfterPay }, hr) {
  const trips = [];
  const inRange = (d) => d >= startDay && d <= endDay;
  let kind = h.kind;
  if (kind === 'weekly' && h.tripsPerMonth < 2.2) kind = 'interval';

  if (kind === 'weekly') {
    const twice = h.tripsPerMonth >= 7;
    const anchors = twice ? [[h.dow, 1], [h.dow2, 0.55]] : [[h.dow, 1]];
    for (const [dow, weight] of anchors) {
      for (let a = startDay - dayOfWeek(startDay) + dow; a <= endDay + 3; a += 7) {
        const r = hr.next();
        if (r < (weight < 1 ? 0.2 : 0.06)) continue; // skipped this week
        let d = a;
        if (r < 0.22) d += hr.pick([-1, 1]); // slipped a day
        else if (r < 0.3) d += hr.int(-3, 3); // off-routine week
        // Lower-income households often do the big run right after payday.
        if (weight === 1 && stockUpAfterPay) {
          const pd = paydays.find((x) => x >= a - 6 && x < a - 1);
          if (pd !== undefined && hr.chance(0.45)) d = pd + hr.int(0, 1);
        }
        if (inRange(d)) trips.push({ d, weight });
      }
    }
    const routineUnits = 4.35 * (twice ? 0.94 + 0.55 * 0.8 : 0.94);
    const extraPerMonth = Math.max(0, h.tripsPerMonth - (twice ? 4.35 * 1.74 : 4.35 * 0.94));
    for (let d = startDay; d <= endDay; d++) {
      const n = hr.poisson(extraPerMonth / 30.4);
      for (let i = 0; i < n; i++) trips.push({ d, weight: 0.4, random: true });
    }
    return { trips, units: routineUnits + extraPerMonth * 0.4 };
  }

  if (kind === 'interval') {
    const gap = 30.4 / Math.max(0.2, h.tripsPerMonth);
    let d = startDay - hr.int(0, Math.max(1, Math.round(gap)));
    while (d <= endDay) {
      d += gammaGap(hr, gap);
      const day = hr.chance(0.5) ? snapToDow(d, h.dow) : d;
      if (inRange(day)) trips.push({ d: day, weight: 1 });
    }
    return { trips, units: h.tripsPerMonth };
  }

  if (kind === 'commute') {
    const pWeekday = Math.min(0.95, h.tripsPerMonth / 21.7);
    let expected = 0;
    for (let d = startDay; d <= endDay; d++) {
      const weekday = dayOfWeek(d) >= 1 && dayOfWeek(d) <= 5;
      const pr = weekday ? pWeekday : pWeekday * 0.15;
      expected += pr;
      if (hr.chance(pr)) trips.push({ d, weight: 1 });
    }
    return { trips, units: (expected / (endDay - startDay + 1)) * 30.4 || 1 };
  }
  return null;
}

// ---------- merchant registry ----------
export const PARTNER_MERCHANT_IDS = Object.fromEntries(
  PARTNERS.map((p, i) => [p.id, `4451${String(i + 1).padStart(11, '0')}`]),
);

const MERCHANTS_BY_CAT = {};
function addMerchant(m) {
  const cat = categoryOf({ mrchCatCde: m.mcc });
  (MERCHANTS_BY_CAT[cat] ||= []).push({ ...m, category: cat });
}
PARTNERS.filter((p) => !p.payee).forEach((p) =>
  addMerchant({ mrchId: PARTNER_MERCHANT_IDS[p.id], mrchNme: p.name.toUpperCase(), mcc: p.mcc, partnerId: p.id }));
OTHER_MERCHANTS.forEach(([name, mcc], i) =>
  addMerchant({ mrchId: `4459${String(i + 1).padStart(11, '0')}`, mrchNme: name, mcc }));

// ACH payees per bill category. Partner payees carry their merchant id so card-linked offers can match.
const partnerPayee = (id) => {
  const p = PARTNERS.find((x) => x.id === id);
  return { name: p.name.toUpperCase(), mrchId: PARTNER_MERCHANT_IDS[id], partnerId: id };
};
const PAYEES = {
  housing: [{ name: 'OAKWOOD APARTMENTS' }, { name: 'PALMETTO PROPERTY MGMT' }, { name: 'RIVERWALK LOFTS' }],
  mortgage: [{ name: 'FIRSTHOME MORTGAGE' }, { name: 'COASTAL HOME LOANS' }],
  utilities: [partnerPayee('coastal-power'), { name: 'NORTHBANK GAS CO' }],
  telecom: [partnerPayee('bridge-wireless'), { name: 'TELCO ONE WIRELESS' }],
  insurance: [{ name: 'SHIELDPOINT INSURANCE' }, { name: 'HARBORLINE MUTUAL' }],
  childcare: [partnerPayee('little-oaks'), { name: 'SUNNY DAYS PRESCHOOL' }],
};
const PAYEE_CODE = { housing: 'RENT', mortgage: 'MTG', utilities: 'UTIL', telecom: 'PHONE', insurance: 'INS', childcare: 'CHILDCARE' };

// ---------- household economics ----------
const S = (I, e) => Math.pow(I / 50000, e);

export function netMonthly(p) {
  const tax = p.isRetiree ? 0.05 : clamp(0.08 + 0.07 * Math.log2(p.income / 20000), 0.06, 0.35);
  return (p.income * (1 - tax)) / 12;
}

// Typical ticket size per POS category.
function ticketFor(cat, p) {
  const I = p.income;
  return {
    groceries: (26 + 9 * p.hhSize) * S(I, 0.15), pharmacy: 21, medical: 40, fuel: p.isGig ? 46 : 38, transit: 2.25,
    school: 16, auto: 140, household: 22, clothing: 35 * S(I, 0.3), rideshare: 16, fastfood: 11,
    electronics: 70 * S(I, 0.4), dining: 32 * S(I, 0.35), entertainment: 28 * S(I, 0.3), bars: 28 * S(I, 0.3),
    travel: 280 * S(I, 0.4), luxury: 240 * S(I, 0.5), altfinance: 18, medicalBig: 120,
  }[cat] ?? 25;
}

function monthlyBudgets(p, rnd) {
  const I = p.income, hh = p.hhSize, net = netMonthly(p);
  const pos = {
    groceries: (170 + 105 * hh) * S(I, 0.28),
    pharmacy: (22 + 10 * hh) * S(I, 0.15) * (p.isRetiree ? 2.6 : 1),
    medical: 35 * S(I, 0.35) * (p.isRetiree ? 2.2 : 1),
    fuel: p.hasCar ? 115 * S(I, 0.25) * (p.isGig ? 2.8 : 1) : 0,
    transit: p.hasCar ? 3 : 62,
    school: p.kids ? 14 * p.kids * S(I, 0.3) : 0,
    auto: p.hasCar ? 45 * S(I, 0.35) * (p.isGig ? 2 : 1) : 0,
    household: (50 + 18 * hh) * S(I, 0.3),
    clothing: (28 + 16 * hh) * S(I, 0.65),
    rideshare: (p.hasCar ? 6 : 25) * S(I, 0.9),
    fastfood: (40 + 12 * hh) * S(I, 0.15),
    electronics: 22 * S(I, 1.0),
    dining: 45 * S(I, 1.15),
    entertainment: 22 * S(I, 1.1),
    bars: 18 * S(I, 1.0) * (p.isRetiree ? 0.3 : 1),
    travel: 45 * S(I, 1.55),
    luxury: 12 * S(I, 1.9),
    altfinance: p.altFinance ? 30 : 0,
  };
  const bills = {
    utilities: (95 + 28 * hh) * S(I, 0.25),
    telecom: (45 + 18 * Math.sqrt(hh)) * S(I, 0.25),
    insurance: (p.hasCar ? 95 : 25) * S(I, 0.4),
    childcare: p.youngKids ? 520 * p.youngKids * S(I, 0.55) : 0,
    streaming: 18 * S(I, 0.45),
  };
  for (const k of Object.keys(pos)) pos[k] *= (p.taste?.[k] ?? 1) * rnd.lognormal(0, 0.3);
  for (const k of Object.keys(bills)) bills[k] *= (p.taste?.[k] ?? 1) * rnd.lognormal(0, 0.2);

  const ownsHome = p.ownsHome ?? (p.isRetiree ? rnd.chance(0.5) : I > 90000 && rnd.chance(0.7));
  const housingShare = p.isRetiree && ownsHome ? 0.1 : clamp(0.42 - 0.11 * Math.log2(I / 30000), 0.16, 0.5);
  const housing = housingShare * net * rnd.uniform(0.9, 1.1);

  // Lower-income households spend nearly everything; higher incomes save.
  const spendRatio = (p.spendRatio ?? clamp(1.0 - 0.09 * Math.log2(I / 30000), 0.55, 1.0)) * rnd.uniform(0.96, 1.02);
  const flexTotal = Object.values(pos).reduce((a, b) => a + b, 0) + Object.values(bills).reduce((a, b) => a + b, 0);
  const atmMonthly = (I < 40000 ? 3 : I < 80000 ? 1.5 : 0.6) * 60;
  const scale = clamp((spendRatio * net - housing - atmMonthly) / flexTotal, 0.35, 2.5);
  for (const k of Object.keys(pos)) pos[k] *= scale;
  for (const k of Object.keys(bills)) bills[k] *= scale;
  return { pos, bills, housing, ownsHome, spendRatio, net, atmMonthly };
}

// ---------- generation ----------
/**
 * profile: { income, hhSize, kids, youngKids, hasCar, isGig, isRetiree, benefitMonthly, payFreq, employer,
 *            altFinance, partnerAffinity, observedShare, taste, routing? }
 * routing (personas): { accounts:[{key, applCde}], primary, savings, depositSplit:{key:share}, spendRoute:{cat:{key:prob}} }
 */
export function generateHousehold(profile, { seed, endDay, days = 180 }) {
  const rnd = makeRandom(seed);
  const p = { hhSize: 1, kids: 0, youngKids: 0, hasCar: true, partnerAffinity: 0.35, observedShare: 1, ...profile };
  const startDay = endDay - days + 1;
  const B = monthlyBudgets(p, rnd);
  const hr = makeRandom((seed ^ 0x2545f491) >>> 0); // separate stream for routines and times of day
  const habits = buildHabits(p, B, hr);
  const events = [];
  const add = (e) => events.push(e);
  const observe = () => p.observedShare >= 1 || rnd.chance(p.observedShare);

  // Each household keeps 1–2 favorite merchants per category.
  const favorites = {};
  const merchantFor = (cat) => {
    const list = MERCHANTS_BY_CAT[cat] || MERCHANTS_BY_CAT.household;
    if (!favorites[cat]) {
      const partners = list.filter((m) => m.partnerId);
      const others = list.filter((m) => !m.partnerId);
      const favs = [];
      if (partners.length && (rnd.chance(p.partnerAffinity) || !others.length)) favs.push(rnd.pick(partners));
      if (others.length) favs.push(rnd.pick(others));
      if (!favs.length) favs.push(rnd.pick(list));
      favorites[cat] = favs;
    }
    return rnd.chance(0.85) ? favorites[cat][0] : rnd.pick(list);
  };
  const payeeFor = (cat) => {
    const key = `payee:${cat}`;
    if (!favorites[key]) {
      const opts = PAYEES[cat];
      const partner = opts.find((o) => o.partnerId);
      favorites[key] = partner && rnd.chance(p.partnerAffinity + 0.25) ? partner : rnd.pick(opts.filter((o) => !o.partnerId));
    }
    return favorites[key];
  };

  // Income.
  const net = B.net * (p.observedShare < 1 ? p.observedShare : 1);
  const benefit = p.benefitMonthly || 0;
  const wageMonthly = Math.max(0, net - benefit);
  const employer = p.employer || rnd.pick(['COASTLINE LOGISTICS', 'ST JOHNS HEALTH', 'DUVAL SCHOOLS', 'BAYMEADOWS TECH', 'FIRST COAST RETAIL GRP', 'PORTSIDE MFG']);
  const anchorFriday = startDay + ((5 - dayOfWeek(startDay) + 7) % 7);
  for (let d = startDay; d <= endDay; d++) {
    const dom = dayOfMonth(d), dow = dayOfWeek(d);
    if (p.isRetiree) {
      if (dom === 3) add({ d, kind: 'C', tranCde: 'ACHC', achCoNme: 'SSA TREAS 310', desc: 'SSA TREAS 310 XXSOC SEC', amt: wageMonthly });
    } else if (p.isGig) {
      if (rnd.chance(3 / 7)) add({ d, kind: 'C', tranCde: 'ACHC', achCoNme: 'ROUTERUNNER INC', desc: 'ROUTERUNNER INC PAYOUT', amt: (wageMonthly * 12 / 52 / 3) * rnd.lognormal(-0.12, 0.5) });
    } else if (p.payFreq === 'weekly') {
      if (dow === 5) add({ d, kind: 'C', tranCde: 'ACHC', achCoNme: employer, desc: `${employer} PAYROLL`, amt: (wageMonthly * 12 / 52) * rnd.uniform(0.9, 1.1) });
    } else if (p.payFreq === 'semimonthly') {
      if (dom === 1 || dom === 15) add({ d, kind: 'C', tranCde: 'ACHC', achCoNme: employer, desc: `${employer} PAYROLL`, amt: (wageMonthly / 2) * rnd.uniform(0.99, 1.01) });
    } else if (p.payFreq === 'monthly') {
      if (dom === 28) add({ d, kind: 'C', tranCde: 'ACHC', achCoNme: employer, desc: `${employer} PAYROLL`, amt: wageMonthly });
    } else if (dow === 5 && (d - anchorFriday) % 14 === 0) {
      const hourlyVar = p.income < 45000 ? rnd.uniform(0.88, 1.1) : rnd.uniform(0.99, 1.01);
      add({ d, kind: 'C', tranCde: 'ACHC', achCoNme: employer, desc: `${employer} PAYROLL`, amt: (wageMonthly * 12 / 26) * hourlyVar });
    }
    if (benefit && dom === 10) {
      const org = p.benefitSource || 'STATE FAMILY ASSIST';
      add({ d, kind: 'C', tranCde: 'ACHC', achCoNme: org, desc: `${org} BENEFIT`, amt: benefit });
    }

    // Bills (ACH debits).
    if (dom === 1 && B.housing > 50) {
      const cat = B.ownsHome ? 'mortgage' : 'housing';
      const payee = payeeFor(cat);
      add({ d, kind: 'D', tranCde: 'ACHD', desc: `ACH DEBIT ${payee.name}`, amt: B.housing, payeeCatCde: PAYEE_CODE[cat], payee, essential: true });
    }
    for (const [cat, day] of [['insurance', 5], ['utilities', 15], ['telecom', 20]]) {
      if (dom === day && B.bills[cat] > 5 && observe()) {
        const payee = payeeFor(cat);
        add({ d, kind: 'D', tranCde: 'ACHD', desc: `ACH DEBIT ${payee.name}`, amt: B.bills[cat] * rnd.uniform(0.92, 1.08), payeeCatCde: PAYEE_CODE[cat], payee, essential: true });
      }
    }
    if (B.bills.childcare > 0 && dow === 5 && observe()) {
      const payee = payeeFor('childcare');
      add({ d, kind: 'D', tranCde: 'ACHD', desc: `ACH DEBIT ${payee.name}`, amt: (B.bills.childcare * 12) / 52, payeeCatCde: 'CHILDCARE', payee, essential: true });
    }
    if (dom === 12 && B.bills.streaming > 3) {
      const m = merchantFor('streaming');
      add({ d, kind: 'D', tranCde: 'POS', merchant: m, amt: B.bills.streaming, essential: false });
    }

    if (rnd.chance(B.atmMonthly / 60 / 30.4) && observe()) add({ d, kind: 'D', tranCde: 'ATMW', desc: 'ATM WITHDRAWAL', amt: rnd.pick([40, 60, 80, 100]), essential: false, hour: 9 + hr.next() * 12 });

    // Monthly savings sweep for households that save.
    if (dom === 2 && B.spendRatio < 0.97) add({ d, kind: 'X', amt: (1 - B.spendRatio) * net * 0.8 });
  }

  // Card purchases. Routine categories follow each household's habits; the rest arrive at random,
  // with wants leaning toward the weekend. Every purchase gets a time of day near the household's usual hour.
  const paydays = events.filter((e) => e.kind === 'C').map((e) => e.d).sort((a, b) => a - b);
  const NON_ESSENTIAL = ['dining', 'bars', 'entertainment', 'travel', 'luxury', 'electronics', 'fastfood', 'rideshare'];
  const purchase = (d, cat, amt) => {
    if (!observe()) return;
    const h = habits[cat];
    const hour = hr.chance(0.12) ? 8 + hr.next() * 13 : h.hour + hr.normal() * 0.75;
    add({ d, kind: 'D', tranCde: 'POS', merchant: merchantFor(cat), amt, essential: !NON_ESSENTIAL.includes(cat), hour });
  };
  for (const [cat, monthly] of Object.entries(B.pos)) {
    if (monthly <= 0) continue;
    const plan = HABIT_KIND[cat] && scheduleTrips(habits[cat], { startDay, endDay, paydays, stockUpAfterPay: p.income < 45000 && !p.isRetiree }, hr);
    if (plan) {
      const ticket = monthly / Math.max(0.5, plan.units);
      for (const t of plan.trips) purchase(t.d, cat, ticket * t.weight * hr.lognormal(-0.03, 0.25));
      continue;
    }
    const rate = monthly / ticketFor(cat, p) / 30.4;
    for (let d = startDay; d <= endDay; d++) {
      const n = rnd.poisson(rate * (WEEKEND_LEANING.has(cat) ? DOW_WEIGHT[dayOfWeek(d)] : 1));
      for (let i = 0; i < n; i++) purchase(d, cat, ticketFor(cat, p) * rnd.lognormal(-0.08, 0.4));
    }
  }

  return simulate(events, p, rnd, { startDay, endDay, B });
}

function simulate(events, p, rnd, { startDay, endDay, B }) {
  const routing = p.routing || { accounts: [{ key: 'dd', applCde: 'DD' }, { key: 'sv', applCde: 'SV' }], primary: 'dd', savings: 'sv' };
  const accts = Object.fromEntries(routing.accounts.map((a) => [a.key, { ...a, bal: 0, txns: [], seq: 0, lastOdDay: -1 }]));
  const I = p.income;
  for (const a of Object.values(accts)) {
    a.bal = a.applCde === 'SV'
      ? round2(B.net * rnd.uniform(0.1, 2.5) * S(I, 1.0) * (a.openBalScale ?? 1))
      : round2(Math.max(40, B.net * rnd.uniform(0.15, 0.6) * S(I, 0.5)) * (a.openBalScale ?? 1));
    a.openBal = a.bal;
  }
  const primary = accts[routing.primary];
  const savings = routing.savings ? accts[routing.savings] : null;
  const overdraftProb = p.overdraftProb ?? (I < 40000 ? 0.9 : 0.6);

  const pickKey = (weights) => {
    let r = rnd.next(), acc = 0;
    for (const [k, w] of Object.entries(weights || {})) { acc += w; if (r < acc) return k; }
    return routing.primary;
  };
  const post = (a, d, t) => {
    const signed = t.drCrCde === 'C' ? t.tranAmt : -t.tranAmt;
    a.bal = round2(a.bal + signed);
    a.txns.push({ seqNbr: ++a.seq, postDt: fromDay(d), effDt: fromDay(d), tranTm: t.tranTm ?? '06:30:00', ...t, runBal: a.bal });
  };

  // Posting times: ACH settles early morning, card purchases and ATM at their time of day, fees overnight.
  const hourOf = (e) => e.hour ?? (e.kind === 'C' ? 6 : e.kind === 'X' ? 7 : 6.5);
  events.sort((x, y) => x.d - y.d || (x.kind === 'C' ? -1 : 1) - (y.kind === 'C' ? -1 : 1) || hourOf(x) - hourOf(y));
  for (const e of events) {
    const amt = round2(e.amt);
    if (amt <= 0) continue;
    if (e.kind === 'C') {
      const split = routing.depositSplit || { [routing.primary]: 1 };
      for (const [key, share] of Object.entries(split)) {
        const a = accts[key];
        post(a, e.d, { tranCde: e.tranCde, tranDesc: e.desc, drCrCde: 'C', tranAmt: round2(amt * share), achCoNme: e.achCoNme, achSecCde: 'PPD', tranTm: '06:00:00' });
      }
      continue;
    }
    if (e.kind === 'X') {
      if (!savings || primary.bal < amt + 200) continue;
      post(primary, e.d, { tranCde: 'XFRO', tranDesc: `TRANSFER TO ${savings.label || 'SAVINGS'}`, drCrCde: 'D', tranAmt: amt, tranTm: '07:00:00' });
      post(savings, e.d, { tranCde: 'XFRI', tranDesc: `TRANSFER FROM ${primary.label || 'CHECKING'}`, drCrCde: 'C', tranAmt: amt, tranTm: '07:00:00' });
      continue;
    }
    const cat = e.merchant ? e.merchant.category : e.payeeCatCde ? categoryOf({ payeeCatCde: e.payeeCatCde }) : 'other';
    const a = accts[pickKey(routing.spendRoute?.[cat])] || primary;
    if (!e.essential && a.bal < 25) continue; // households cut back on wants when money is tight
    const t = { tranCde: e.tranCde, drCrCde: 'D', tranAmt: amt, tranTm: fmtTime(hourOf(e)) };
    if (e.merchant) {
      Object.assign(t, {
        tranDesc: `POS PURCHASE ${e.merchant.mrchNme}`, mrchNme: e.merchant.mrchNme, mrchId: e.merchant.mrchId,
        mrchCatCde: e.merchant.mcc, mrchCityNme: cat === 'travel' ? rnd.pick(['ATLANTA', 'NEW YORK', 'CHICAGO', 'MIAMI']) : 'JACKSONVILLE', mrchStCde: cat === 'travel' ? '' : 'FL',
      });
    } else if (e.payee) {
      Object.assign(t, { tranDesc: e.desc, payeeCatCde: e.payeeCatCde, mrchNme: e.payee.name, ...(e.payee.mrchId ? { mrchId: e.payee.mrchId } : {}) });
    } else {
      t.tranDesc = e.desc;
    }
    post(a, e.d, t);
    if (a.bal < 0 && a.lastOdDay !== e.d && rnd.chance(overdraftProb)) {
      a.lastOdDay = e.d;
      post(a, e.d, { tranCde: 'FEE', tranDesc: 'OVERDRAFT ITEM FEE', drCrCde: 'D', tranAmt: 35, tranTm: '23:30:00' });
    }
  }
  // Monthly interest on savings.
  if (savings) {
    for (let d = startDay; d <= endDay; d++) {
      if (dayOfMonth(d) === 28 && savings.bal > 0) post(savings, d, { tranCde: 'INT', tranDesc: 'INTEREST PAID', drCrCde: 'C', tranAmt: round2(savings.bal * 0.035 / 12), tranTm: '23:00:00' });
    }
    savings.txns.sort((x, y) => x.postDt.localeCompare(y.postDt) || x.seqNbr - y.seqNbr);
    savings.txns.forEach((t, i) => { t.seqNbr = i + 1; });
    let bal = savings.openBal;
    for (const t of savings.txns) { bal = round2(bal + (t.drCrCde === 'C' ? t.tranAmt : -t.tranAmt)); t.runBal = bal; }
  }
  return Object.values(accts).map((a) => ({ key: a.key, applCde: a.applCde, openBal: a.openBal, curBal: a.bal, txns: a.txns }));
}

// Random training household drawn from a realistic income distribution.
export function randomProfile(rnd) {
  const isRetiree = rnd.chance(0.15);
  const income = clamp(rnd.lognormal(Math.log(isRetiree ? 36000 : 60000), 0.62), 12000, 450000);
  return profileForIncome(rnd, income, { isRetiree });
}

// Household with a given income; everything else drawn to fit it.
export function profileForIncome(rnd, income, { isRetiree = rnd.chance(0.15) } = {}) {
  const hhSize = isRetiree ? rnd.int(1, 2) : rnd.int(1, 5);
  const kids = isRetiree ? 0 : Math.max(0, hhSize - rnd.int(1, 2));
  const youngKids = kids ? (rnd.chance(0.45) ? 1 : 0) : 0;
  const lowIncome = income < 35000;
  return {
    income, hhSize, kids, youngKids, isRetiree,
    hasCar: rnd.chance(clamp(0.55 + income / 150000, 0.55, 0.97)),
    isGig: !isRetiree && rnd.chance(income < 60000 ? 0.12 : 0.04),
    payFreq: rnd.pick(['biweekly', 'biweekly', 'weekly', 'semimonthly', 'monthly']),
    benefitMonthly: !isRetiree && lowIncome && kids && rnd.chance(0.5) ? rnd.uniform(120, 320) : 0,
    benefitSource: rnd.chance(0.3) ? 'STATE REEMPLOY BENEFIT' : 'STATE FAMILY ASSIST',
    altFinance: rnd.chance(income < 30000 ? 0.45 : income < 45000 ? 0.2 : income < 70000 ? 0.06 : 0.01),
    partnerAffinity: rnd.uniform(0.2, 0.5),
    observedShare: rnd.chance(0.5) ? 1 : rnd.uniform(0.55, 1),
  };
}
