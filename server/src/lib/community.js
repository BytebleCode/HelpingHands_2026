// Community scoring and Neighbor Funds. A batch job scores every household in the market with the
// income model (read through the FIS adapter, like a nightly job would); donors can then give to a
// model-detected group, e.g. lower-income households in Arlington, without seeing anyone's data.
import { fis } from './fisClient.js';
import { summarize } from './features.js';
import { estimate } from './incomeModel.js';
import { store, catalog, incomeModel, communityMembers, newId } from './store.js';
import { HttpError, loadContext } from './context.js';
import { journey, journeyDelta } from './giving.js';
import { POINTS_PER_DOLLAR } from './rewards.js';
import { todayDay, fromDay } from './dates.js';

export const K_MIN = 10; // smallest group a donor may target, so no gift can single out a household
export const GROUPS = {
  lower: { key: 'lower', label: 'Lower-income households', short: 'lower-income', tiers: ['cornerstone', 'foundation'] },
  lowest: { key: 'lowest', label: 'Lowest-income households', short: 'lowest-income', tiers: ['cornerstone'] },
};
const TIER_KEYS = ['cornerstone', 'foundation', 'keystone', 'pillar', 'summit'];

let communityScores = null;
let pending = null;

async function scoreLinks(links) {
  const today = todayDay();
  const fromDt = fromDay(today - 119);
  const accounts = await Promise.all(links.map(async (l) => {
    const [a, txns] = await Promise.all([fis.account(l), fis.transactions(l, { fromDt })]);
    return { applCde: a.applCde, curBal: a.curBal, txns };
  }));
  return estimate(incomeModel, summarize(accounts, { endDay: today, windowDays: 90 }));
}

/** Scores the synthetic community once (cached); runs at startup as a warm-up. */
export function scoreCommunity() {
  if (communityScores) return Promise.resolve(communityScores);
  if (!pending) {
    const started = Date.now();
    pending = (async () => {
      const out = new Array(communityMembers.length);
      let i = 0;
      const worker = async () => {
        while (i < communityMembers.length) {
          const idx = i++;
          const m = communityMembers[idx];
          const e = await scoreLinks(m.links);
          out[idx] = { hhid: m.hhid, area: m.area, persona: false, trueIncome: m.trueIncome, percentile: e.percentile, tier: e.tier, estimatedIncome: e.estimatedAnnualIncome };
        }
      };
      await Promise.all(Array.from({ length: 12 }, worker));
      communityScores = out;
      console.log(`Scored ${out.length} community households in ${Date.now() - started}ms`);
      return out;
    })().finally(() => { pending = null; });
  }
  return pending;
}

/** Community scores plus fresh scores for the demo members (whose links can change). */
export async function scoredMembers() {
  const community = await scoreCommunity();
  const personas = await Promise.all(store.people().map(async (p) => {
    const ctx = await loadContext(p.hhid);
    return { hhid: p.hhid, area: p.location.label, persona: true, name: `${p.firstName} ${p.lastName}`, percentile: ctx.estimate.percentile, tier: ctx.estimate.tier, estimatedIncome: ctx.estimate.estimatedAnnualIncome };
  }));
  return [...community, ...personas];
}

const areaName = (id) => (id === catalog.market.id ? `All of ${catalog.market.name}` : catalog.market.neighborhoods[id]?.name);

function stats(list) {
  const tiers = Object.fromEntries(TIER_KEYS.map((k) => [k, 0]));
  for (const m of list) tiers[m.tier.key]++;
  const sorted = list.map((m) => m.percentile).sort((a, b) => a - b);
  const lower = tiers.cornerstone + tiers.foundation;
  return {
    households: list.length, tiers, lower, lowest: tiers.cornerstone,
    needIndex: list.length ? lower / list.length : 0,
    medianPercentile: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    targetable: { lower: lower >= K_MIN, lowest: tiers.cornerstone >= K_MIN },
  };
}

export async function neighborAreas() {
  const members = await scoredMembers();
  const given = {};
  for (const d of store.state.donations) if (d.kind === 'neighbor') given[d.areaId] = (given[d.areaId] || 0) + d.points;
  const city = { id: catalog.market.id, type: 'city', name: areaName(catalog.market.id), zip: null, ...stats(members), givenPoints: given[catalog.market.id] || 0 };
  const hoods = Object.entries(catalog.market.neighborhoods).map(([id, n]) => ({
    id, type: 'neighborhood', name: n.name, zip: n.zip, ...stats(members.filter((m) => m.area === id)), givenPoints: given[id] || 0,
  })).sort((a, b) => b.needIndex - a.needIndex);
  return { kMin: K_MIN, groups: Object.values(GROUPS).map(({ key, label, short }) => ({ key, label, short })), areas: [city, ...hoods] };
}

export async function giveToNeighbors(ctx, { areaId, group = 'lower', points }) {
  points = Math.floor(Number(points));
  const g = GROUPS[group];
  const name = areaName(areaId);
  if (!g || !name) throw new HttpError(400, 'Choose an area and a group');
  if (!(points >= 100)) throw new HttpError(400, 'Minimum gift is 100 points ($1)');
  if (points > store.state.points[ctx.hhid].balance) throw new HttpError(422, 'Not enough points');

  const members = await scoredMembers();
  const recipients = members.filter((m) => (areaId === catalog.market.id || m.area === areaId) && g.tiers.includes(m.tier.key) && m.hhid !== ctx.hhid);
  if (recipients.length < K_MIN) throw new HttpError(422, `To protect privacy, a Neighbor Fund needs at least ${K_MIN} households. ${name} has fewer ${g.short} households.`);
  const per = Math.floor(points / recipients.length);
  if (per < 1) throw new HttpError(400, `Give at least ${recipients.length} points so every household receives something`);
  const total = per * recipients.length;

  const before = journey(ctx.hhid);
  const transfer = await fis.transfer({
    fromAcct: catalog.rewardsPool, toAcct: catalog.neighborFund, tranAmt: total / POINTS_PER_DOLLAR, memo: `NEIGHBOR ${areaId.toUpperCase()}`,
    debitDesc: `NEIGHBOR FUND ${name.toUpperCase()}`, creditDesc: `MEMBER GIFT ${g.short.toUpperCase()} ${name.toUpperCase()}`,
  });
  for (const r of recipients) {
    if (store.person(r.hhid)) {
      store.addPoints(r.hhid, { type: 'neighbor-gift', points: per, desc: `Gift from a neighbor \u00b7 ${name} Neighbor Fund`, ref: transfer.tranRefNbr });
    } else {
      store.state.neighborAllocations[r.hhid] = (store.state.neighborAllocations[r.hhid] || 0) + per;
    }
  }
  const donation = {
    id: newId('don'), kind: 'neighbor', hhid: ctx.hhid, areaId, areaName: name, group, recipients: recipients.length, perHousehold: per,
    points: total, dollars: total / POINTS_PER_DOLLAR, matchedPoints: 0, ts: new Date().toISOString(), fisRef: transfer.tranRefNbr,
  };
  store.state.donations.push(donation);
  store.addPoints(ctx.hhid, { type: 'donation', points: -total, desc: `${name} Neighbor Fund \u00b7 ${recipients.length} ${g.short} households`, ref: transfer.tranRefNbr });
  store.save();
  return {
    donation, transfer, recipients: recipients.length, perHousehold: per, group: g.label, areaName: name,
    personasReached: recipients.filter((r) => r.persona).map((r) => r.name),
    ...journeyDelta(ctx.hhid, before),
    balance: store.state.points[ctx.hhid].balance,
  };
}
