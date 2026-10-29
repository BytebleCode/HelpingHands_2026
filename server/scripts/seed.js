// Builds the static DB: the fake FIS core (institutions, customers, accounts, transactions),
// the Helping Hands catalog (partners, offers, charities), demo identities and a
// synthetic community of Jacksonville households.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateHousehold, makeRandom, profileForIncome, PARTNER_MERCHANT_IDS } from './generator.js';
import {
  INSTITUTIONS, REWARDS_POOL, NEIGHBOR_FUND, PARTNERS, OFFERS, CAUSES, CAMPAIGNS, COMMUNITY_GOAL, FIRST_NAMES, LAST_NAMES,
} from './catalog-data.js';
import { CATEGORIES } from '../src/lib/mcc.js';
import { todayDay, fromDay } from '../src/lib/dates.js';

const dir = fileURLToPath(new URL('../data/seed/', import.meta.url));
mkdirSync(dir, { recursive: true });
const MARKET = 'jacksonville-fl';
const { market, charities: marketCharities, pulledAt } = JSON.parse(readFileSync(`${dir}markets/${MARKET}.json`, 'utf8'));
const END_DAY = todayDay();
const DAYS = 180;
const COMMUNITY_DAYS = 120;
const COMMUNITY_PER_AREA = 22;
const rnd = makeRandom(7);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const slug = (s) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const PRODUCTS = {
  DD: { prodCde: 'ECHK', prodDesc: 'Essential Checking' },
  SV: { prodCde: 'SSAV', prodDesc: 'Share Savings' },
  BIZ: { prodCde: 'BCHK', prodDesc: 'Business Checking' },
};

const customers = [];
const accounts = [];
const transactions = {};
const custSeq = {};
const acctKey = (a) => `${a.instNbr}-${a.applCde}-${a.acctNbr}`;

function addCustomer(instNbr, data) {
  custSeq[instNbr] = (custSeq[instNbr] || 400) + rnd.int(3, 40);
  const custNbr = `${instNbr.slice(2)}${String(custSeq[instNbr]).padStart(8, '0')}`;
  const c = { instNbr, custNbr, custTypCde: 'P', custStatCde: 'A', ...data };
  customers.push(c);
  return c;
}

function addAccount({ instNbr, applCde, acctNbr, custNbr, curBal, txns = [], biz = false, openDt }) {
  const prod = biz ? PRODUCTS.BIZ : PRODUCTS[applCde];
  const a = {
    instNbr, applCde, acctNbr, custNbr, ...prod, acctStatCde: 'A',
    openDt: openDt || fromDay(END_DAY - rnd.int(400, 3000)),
    curBal: Math.round(curBal * 100) / 100,
    availBal: Math.round(Math.max(0, curBal) * 100) / 100,
    rtnNbr: INSTITUTIONS.find((i) => i.instNbr === instNbr).rtnNbr,
  };
  accounts.push(a);
  transactions[acctKey(a)] = txns;
  return a;
}

// ---------------------------------------------------------------- personas
const PERSONAS = [
  {
    hhid: 'HH-7KQ3-M2XA', first: 'Maya', last: 'Thompson', birthDt: '1991-04-12', taxIdLast4: '4417',
    addr: { line1: '1847 Lone Star Rd', cityNme: 'Jacksonville', stCde: 'FL', zipCde: '32211' }, place: 'arlington',
    blurb: 'Single parent of two, hourly retail. Childcare, groceries and an aging car.',
    accounts: [
      { key: 'fc', instNbr: '0101', applCde: 'DD', acctNbr: '1010042187', linked: true },
      { key: 'rb', instNbr: '0207', applCde: 'SV', acctNbr: '2070031955', linked: true, openBalScale: 0.15 },
      { key: 'hs', instNbr: '0315', applCde: 'DD', acctNbr: '3150077310', linked: false },
    ],
    profile: {
      income: 28500, hhSize: 3, kids: 2, youngKids: 1, hasCar: true, payFreq: 'biweekly', employer: 'PALMETTO HOME SUPPLY',
      benefitMonthly: 180, benefitSource: 'STATE FAMILY ASSIST', altFinance: false, partnerAffinity: 0.8, overdraftProb: 0.35,
      habits: { groceries: { dow: 0, hour: 10 }, pharmacy: { dow: 3, hour: 17.5 } }, // Sunday-morning grocery run
      routing: { primary: 'fc', savings: 'rb', depositSplit: { fc: 0.78, hs: 0.22 }, spendRoute: { groceries: { hs: 0.4 }, pharmacy: { hs: 0.4 }, childcare: { hs: 1 } } },
    },
  },
  {
    hhid: 'HH-R4DN-8VWE', first: 'Daniel', last: 'Reyes', birthDt: '1988-09-03', taxIdLast4: '2290',
    addr: { line1: '7643 103rd St', cityNme: 'Jacksonville', stCde: 'FL', zipCde: '32210' }, place: 'westside',
    blurb: 'Rideshare and delivery driver with week-to-week income. Fuel and repairs dominate.',
    accounts: [
      { key: 'rb', instNbr: '0207', applCde: 'DD', acctNbr: '2070058812', linked: true },
      { key: 'fc', instNbr: '0101', applCde: 'SV', acctNbr: '1010090034', linked: true, openBalScale: 0.3 },
    ],
    profile: {
      income: 38000, hhSize: 2, kids: 0, hasCar: true, isGig: true, altFinance: true, partnerAffinity: 0.7,
      taste: { fuel: 1.3, auto: 1.4 },
      habits: { fuel: { dow: 4, hour: 7.5 }, groceries: { dow: 2, hour: 19 } },
      routing: { primary: 'rb', savings: 'fc' },
    },
  },
  {
    hhid: 'HH-G9CE-3PHT', first: 'Grace', last: 'Okafor', birthDt: '1953-02-21', taxIdLast4: '7781',
    addr: { line1: '1612 N Pearl St', cityNme: 'Jacksonville', stCde: 'FL', zipCde: '32206' }, place: 'springfield',
    blurb: 'Retired, living on Social Security. Prescriptions, utilities and the bus.',
    accounts: [
      { key: 'sj', instNbr: '0533', applCde: 'DD', acctNbr: '5330012478', linked: true },
      { key: 'sv', instNbr: '0533', applCde: 'SV', acctNbr: '5330012479', linked: true, openBalScale: 0.5 },
    ],
    profile: {
      income: 22000, hhSize: 1, isRetiree: true, hasCar: false, ownsHome: false, partnerAffinity: 0.8,
      taste: { pharmacy: 1.3, medical: 1.2 },
      habits: { pharmacy: { dow: 2, hour: 11 }, groceries: { dow: 4, hour: 10.5 } },
      routing: { primary: 'sj', savings: 'sv' },
    },
  },
  {
    hhid: 'HH-J6WT-5BKR', first: 'James', last: 'Whitaker', birthDt: '1984-11-30', taxIdLast4: '6053',
    addr: { line1: '11240 San Jose Blvd', cityNme: 'Jacksonville', stCde: 'FL', zipCde: '32223' }, place: 'mandarin',
    blurb: 'Middle-school teacher, family of four. Steady paycheck, busy household.',
    accounts: [
      { key: 'fc', instNbr: '0101', applCde: 'DD', acctNbr: '1010066203', linked: true },
      { key: 'sv', instNbr: '0101', applCde: 'SV', acctNbr: '1010066204', linked: true },
    ],
    profile: {
      income: 64000, hhSize: 4, kids: 2, hasCar: true, payFreq: 'semimonthly', employer: 'DUVAL SCHOOLS', partnerAffinity: 0.55,
      habits: { groceries: { dow: 6, hour: 9.5 }, fuel: { dow: 1, hour: 17.5 } },
      routing: { primary: 'fc', savings: 'sv' },
    },
  },
  {
    hhid: 'HH-P2YN-9FZC', first: 'Priya', last: 'Natarajan', birthDt: '1987-06-08', taxIdLast4: '9124',
    addr: { line1: '1515 Hendricks Ave', cityNme: 'Jacksonville', stCde: 'FL', zipCde: '32207' }, place: 'sanMarco',
    blurb: 'Senior engineer. Travel, dining and design — few everyday needs to reward.',
    accounts: [
      { key: 'hs', instNbr: '0315', applCde: 'DD', acctNbr: '3150011845', linked: true },
      { key: 'sv', instNbr: '0315', applCde: 'SV', acctNbr: '3150011846', linked: true },
    ],
    profile: {
      income: 210000, hhSize: 1, hasCar: true, payFreq: 'monthly', employer: 'BAYMEADOWS TECH', partnerAffinity: 0.3,
      taste: { travel: 1.4, dining: 1.3, luxury: 1.5 },
      habits: { groceries: { dow: 3, hour: 19 } },
      routing: { primary: 'hs', savings: 'sv' },
    },
  },
];

const identities = [];
PERSONAS.forEach((p, idx) => {
  const routing = {
    ...p.profile.routing,
    accounts: p.accounts.map((a) => ({ key: a.key, applCde: a.applCde, openBalScale: a.openBalScale, label: INSTITUTIONS.find((i) => i.instNbr === a.instNbr).shortNme.toUpperCase() })),
  };
  const generated = generateHousehold({ ...p.profile, routing }, { seed: 500 + idx * 17, endDay: END_DAY, days: DAYS });
  const custByInst = {};
  const links = [];
  for (const a of p.accounts) {
    custByInst[a.instNbr] ||= addCustomer(a.instNbr, {
      nme: { frstNme: p.first, lstNme: p.last }, taxIdLast4: p.taxIdLast4, birthDt: p.birthDt, addr: p.addr,
      phoneNbr: `904555${String(1000 + idx * 37).slice(-4)}`, emailAddr: `${p.first.toLowerCase()}.${p.last.toLowerCase()}@example.com`,
      custSinceDt: fromDay(END_DAY - rnd.int(700, 5000)),
    });
    const g = generated.find((x) => x.key === a.key);
    addAccount({ instNbr: a.instNbr, applCde: a.applCde, acctNbr: a.acctNbr, custNbr: custByInst[a.instNbr].custNbr, curBal: g.curBal, txns: g.txns });
    if (a.linked) links.push({ instNbr: a.instNbr, applCde: a.applCde, acctNbr: a.acctNbr, custNbr: custByInst[a.instNbr].custNbr });
  }
  const unlinked = p.accounts.filter((a) => !a.linked).map((a) => ({ instNbr: a.instNbr, applCde: a.applCde, acctNbr: a.acctNbr, taxIdLast4: p.taxIdLast4, zipCde: p.addr.zipCde }));
  identities.push({
    hhid: p.hhid, firstName: p.first, lastName: p.last, blurb: p.blurb, zipCde: p.addr.zipCde, place: p.place, trueIncome: p.profile.income,
    location: { lat: market.neighborhoods[p.place].center[0], lng: market.neighborhoods[p.place].center[1], label: p.place },
    links, demoUnlinked: unlinked,
  });
});

// ---------------------------------------------------------------- program, partner and charity accounts
const bizCustomer = (instNbr, name) => addCustomer(instNbr, {
  custTypCde: 'B', nme: { bizNme: name }, addr: { line1: '—', cityNme: 'Jacksonville', stCde: 'FL', zipCde: '32202' },
  custSinceDt: fromDay(END_DAY - rnd.int(1500, 6000)),
});

const poolCust = bizCustomer(REWARDS_POOL.instNbr, REWARDS_POOL.nme);
addAccount({ ...REWARDS_POOL, custNbr: poolCust.custNbr, curBal: 2_500_000, biz: true });
const fundCust = bizCustomer(NEIGHBOR_FUND.instNbr, NEIGHBOR_FUND.nme);
addAccount({ ...NEIGHBOR_FUND, custNbr: fundCust.custNbr, curBal: 0, biz: true });

let acctSeq = 7000;
const nextAcct = (instNbr) => `${instNbr.slice(1)}00${++acctSeq}`.padEnd(10, '0').slice(0, 10);

const partners = PARTNERS.map((p) => {
  const cust = bizCustomer(p.settleInst, p.name);
  const acct = addAccount({ instNbr: p.settleInst, applCde: 'DD', acctNbr: nextAcct(p.settleInst), custNbr: cust.custNbr, curBal: rnd.uniform(80_000, 600_000), biz: true });
  return {
    id: p.id, name: p.name, category: p.category, categoryLabel: CATEGORIES[p.category].label, mcc: p.mcc, blurb: p.blurb,
    mrchId: PARTNER_MERCHANT_IDS[p.id], payeeCatCde: p.payee || null, location: p.location || null,
    settlement: { instNbr: acct.instNbr, applCde: acct.applCde, acctNbr: acct.acctNbr, rtnNbr: acct.rtnNbr },
    image: `cat-${p.category === 'household' ? 'home' : p.category}`,
  };
});

// Real Jacksonville charities (pulled from IRS data). Their accounts in the fake core are demo-only
// settlement accounts; no real funds move.
const SETTLE_INSTS = ['0101', '0207', '0315', '0533'];
const charities = marketCharities.map((c, i) => {
  const inst = SETTLE_INSTS[i % SETTLE_INSTS.length];
  const cust = bizCustomer(inst, c.name);
  const acct = addAccount({ instNbr: inst, applCde: 'DD', acctNbr: nextAcct(inst), custNbr: cust.custNbr, curBal: 0, biz: true });
  return {
    id: slug(c.name), name: c.name, legalName: c.irs.legalName, ein: c.ein, cause: c.cause, causeLabel: CAUSES[c.cause],
    mission: c.mission, website: c.website, image: c.image, impact: c.impact,
    address: c.address, mailingOnly: /^po box/i.test(c.irs.address), ntee: c.irs.ntee, latestFiling: c.irs.latestFiling,
    location: { lat: c.location.lat, lng: c.location.lng, approximate: !c.location.geocoded },
    market: market.id,
    settlement: { instNbr: acct.instNbr, applCde: acct.applCde, acctNbr: acct.acctNbr, rtnNbr: acct.rtnNbr, simulated: true },
  };
});

// ---------------------------------------------------------------- synthetic community
// Households across Jacksonville neighborhoods, stored in the core as deterministic generation recipes
// (the core expands them into transactions at startup) so the population stays small on disk.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const hhidCode = () => `HH-${Array.from({ length: 4 }, () => rnd.pick([...CROCKFORD])).join('')}-${Array.from({ length: 4 }, () => rnd.pick([...CROCKFORD])).join('')}`;
const STREETS = ['Oak St', 'Palm Ave', 'Magnolia Dr', 'Cedar Ln', 'Pine St', 'Live Oak Ct', 'Cypress Rd', 'Bay St', 'Willow Way', 'Dogwood Dr'];
const community = [];
const simulation = { windowDays: COMMUNITY_DAYS, note: 'Synthetic households stored as generation recipes; the core expands them into transactions at startup.', households: [] };
let hhSeq = 0;
for (const [areaKey, area] of Object.entries(market.neighborhoods)) {
  for (let i = 0; i < COMMUNITY_PER_AREA; i++, hhSeq++) {
    const income = Math.round(clamp(rnd.lognormal(Math.log(area.medianIncome), 0.5), 12000, 400000));
    const profile = profileForIncome(rnd, income);
    const inst = rnd.pick(SETTLE_INSTS);
    const firstName = rnd.pick(FIRST_NAMES), lastName = rnd.pick(LAST_NAMES);
    const cust = addCustomer(inst, {
      nme: { frstNme: firstName, lstNme: lastName }, taxIdLast4: String(rnd.int(1000, 9999)),
      addr: { line1: `${rnd.int(100, 9999)} ${rnd.pick(STREETS)}`, cityNme: 'Jacksonville', stCde: 'FL', zipCde: area.zip },
      custSinceDt: fromDay(END_DAY - rnd.int(300, 6000)), synthetic: true,
    });
    const base = `${inst.slice(1)}${String(500000 + hhSeq * 2).padStart(7, '0')}`;
    const links = [
      { instNbr: inst, applCde: 'DD', acctNbr: base, custNbr: cust.custNbr },
      { instNbr: inst, applCde: 'SV', acctNbr: String(Number(base) + 1), custNbr: cust.custNbr },
    ];
    for (const l of links) addAccount({ ...l, curBal: 0 });
    simulation.households.push({ custNbr: cust.custNbr, instNbr: inst, accounts: links.map((l) => ({ key: l.applCde === 'DD' ? 'dd' : 'sv', applCde: l.applCde, acctNbr: l.acctNbr })), profile, seed: 9000 + hhSeq });
    community.push({ hhid: hhidCode(), firstName, lastName, area: areaKey, links, trueIncome: income });
  }
}

const offers = OFFERS.map((o) => {
  const partner = partners.find((p) => p.id === o.partnerId);
  return {
    ...o, category: partner.category, image: o.image || partner.image,
    lookbackDays: 30, expiresInDays: 30 + rnd.int(0, 45),
    legacyCode: `HH${partner.mcc}${o.id.slice(4, 8).toUpperCase().replace(/[^A-Z]/g, 'X')}${rnd.int(10, 99)}`,
  };
});

// ---------------------------------------------------------------- write
const meta = { asOfDt: fromDay(END_DAY), generatedAt: new Date().toISOString(), organizationId: 'HHDEMO', fictional: true, windowDays: DAYS };
const core = { meta, institutions: INSTITUTIONS, customers, accounts, transactions, simulation };
writeFileSync(`${dir}fis-core.json`, JSON.stringify(core));
writeFileSync(`${dir}catalog.json`, JSON.stringify({
  market: { ...market, charitiesPulledAt: pulledAt }, partners, offers, charities, causes: CAUSES,
  campaigns: CAMPAIGNS, communityGoal: COMMUNITY_GOAL, rewardsPool: REWARDS_POOL, neighborFund: NEIGHBOR_FUND,
}, null, 2));
writeFileSync(`${dir}identities.json`, JSON.stringify({ meta, identities, community }, null, 2));

const txCount = Object.values(transactions).reduce((a, t) => a + t.length, 0);
console.log(`Static DB written (as of ${meta.asOfDt}): ${INSTITUTIONS.length} institutions, ${customers.length} customers, ${accounts.length} accounts, ${txCount} stored transactions`);
console.log(`Community: ${community.length} synthetic households across ${Object.keys(market.neighborhoods).length} ${market.name} neighborhoods (expanded at startup)`);
console.log(`Catalog: ${partners.length} partners, ${offers.length} offers, ${charities.length} real charities`);
for (const id of identities) {
  const bal = id.links.map((l) => accounts.find((a) => a.acctNbr === l.acctNbr).curBal);
  console.log(`  ${id.hhid}  ${id.firstName.padEnd(7)} linked ${id.links.length}, balances ${bal.map((b) => b.toFixed(0)).join(' / ')}${id.demoUnlinked.length ? `, +${id.demoUnlinked.length} unlinked` : ''}`);
}
