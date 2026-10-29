// Helping Hands application state (identities, points, activations, donations).
// Seeded from data/seed/*.json; mutations persist to data/runtime/app-state.json.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { todayDay, fromDay } from './dates.js';

const seedPath = (f) => fileURLToPath(new URL(`../../data/seed/${f}`, import.meta.url));
const RUNTIME_DIR = fileURLToPath(new URL('../../data/runtime/', import.meta.url));
const STATE = `${RUNTIME_DIR}app-state.json`;

export const catalog = JSON.parse(readFileSync(seedPath('catalog.json'), 'utf8'));
export const incomeModel = JSON.parse(readFileSync(seedPath('income-model.json'), 'utf8'));
const { identities, community } = JSON.parse(readFileSync(seedPath('identities.json'), 'utf8'));
export const personaTruth = Object.fromEntries(identities.map((i) => [i.hhid, i.trueIncome]));
export const communityMembers = community;
const STATE_VERSION = 3;

export const newId = (prefix) => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const daysAgoTs = (n, hour = 15) => `${fromDay(todayDay() - n)}T${String(hour).padStart(2, '0')}:00:00.000Z`;

// Prior giving so the journey, streaks and badges have history on day one of the demo.
const HISTORY = {
  'HH-7KQ3-M2XA': {
    donations: [[52, 'feeding-northeast-florida', 500], [24, 'ronald-mcdonald-house-jacksonville', 400]],
  },
  'HH-G9CE-3PHT': {
    donations: [[88, 'eldersource', 300], [58, 'volunteers-in-medicine-jacksonville', 300], [27, 'eldersource', 350]],
  },
  'HH-R4DN-8VWE': { donations: [[35, 'everypet', 600]] },
  'HH-J6WT-5BKR': { donations: [] },
  'HH-P2YN-9FZC': { donations: [[64, 'big-brothers-big-sisters-of-northeast-florida', 12000], [20, 'st-johns-riverkeeper', 8000]] },
};

function initialState() {
  const s = { version: STATE_VERSION, people: {}, points: {}, earned: {}, activations: {}, donations: [], neighborAllocations: {} };
  for (const id of identities) {
    s.people[id.hhid] = {
      hhid: id.hhid, firstName: id.firstName, lastName: id.lastName, blurb: id.blurb, zipCde: id.zipCde, location: id.location,
      links: id.links.map((l) => ({ id: newId('lnk'), ...l, linkedAt: daysAgoTs(120) })),
      demoUnlinked: id.demoUnlinked,
      enrolledDay: todayDay() - 30, // everyday earning starts with the last 30 days of card spend
    };
    s.points[id.hhid] = { balance: 0, ledger: [] };
    s.earned[id.hhid] = {};
    s.activations[id.hhid] = {};
    const h = HISTORY[id.hhid] || { donations: [] };
    for (const [ago, charityId, pts] of h.donations) {
      s.donations.push({ id: newId('don'), hhid: id.hhid, charityId, points: pts, matchedPoints: 0, dollars: pts / 100, ts: daysAgoTs(ago), fisRef: `FT-HIST-${ago}${pts}`, historical: true });
    }
  }
  return s;
}

class AppStore {
  constructor() {
    const saved = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null;
    this.state = saved?.version === STATE_VERSION ? saved : initialState();
    if (this.state !== saved) this.save();
  }
  save() {
    mkdirSync(RUNTIME_DIR, { recursive: true });
    writeFileSync(STATE, JSON.stringify(this.state, null, 1));
  }
  reset() {
    this.state = initialState();
    this.save();
  }
  person(hhid) {
    return this.state.people[hhid];
  }
  people() {
    return Object.values(this.state.people);
  }
  addPoints(hhid, { type, points, desc, ref = null, meta = {} }) {
    const acct = this.state.points[hhid];
    const entry = { id: newId('pts'), ts: new Date().toISOString(), type, points: Math.round(points), desc, ref, ...meta };
    acct.balance += entry.points;
    acct.ledger.unshift(entry);
    return entry;
  }
}

export const store = new AppStore();
