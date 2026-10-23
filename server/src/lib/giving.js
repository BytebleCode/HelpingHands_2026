// Donations (routed to charities' FIS-core accounts) and the giving journey: impact score, levels,
// streaks, badges, partner matching and the community goal. Volunteering counts toward impact so
// members with little money to spare can progress too. No absolute-dollar leaderboards.
import { store, catalog, newId } from './store.js';
import { fis } from './fisClient.js';
import { HttpError } from './context.js';
import { POINTS_PER_DOLLAR } from './rewards.js';
import { todayDay, fromDay } from './dates.js';

export const HOUR_VALUE = 500; // impact points per volunteer hour

export const LEVELS = [
  { key: 'kindred', name: 'Kindred', min: 0 },
  { key: 'steward', name: 'Steward', min: 1500 },
  { key: 'benefactor', name: 'Benefactor', min: 5000 },
  { key: 'patron', name: 'Patron', min: 15000 },
  { key: 'philanthropist', name: 'Philanthropist', min: 40000 },
];

const BADGES = [
  { key: 'first-gift', name: 'First Gift', desc: 'Made your first donation', test: (j) => j.gifts >= 1 },
  { key: 'neighbor', name: 'Neighbor', desc: 'Completed a volunteer shift', test: (j) => j.shifts >= 1 },
  { key: 'community-builder', name: 'Community Builder', desc: 'Gave both rewards and time', test: (j) => j.gifts >= 1 && j.shifts >= 1 },
  { key: 'explorer', name: 'Explorer', desc: 'Supported three different causes', test: (j) => j.causes >= 3 },
  { key: 'steady-hand', name: 'Steady Hand', desc: 'Gave three months in a row', test: (j) => j.streak >= 3 },
  { key: 'matched', name: 'Multiplied', desc: 'Unlocked a partner match', test: (j) => j.matched > 0 },
  { key: 'cause-champion', name: 'Cause Champion', desc: 'Five gifts to a single cause', test: (j) => j.maxPerCause >= 5 },
  { key: 'time-giver', name: 'Time Giver', desc: 'Ten volunteer hours', test: (j) => j.hours >= 10 },
  { key: 'good-neighbor', name: 'Good Neighbor', desc: 'Gave to a Neighbor Fund', test: (j) => j.neighborGifts >= 1 },
];

const charityById = () => Object.fromEntries(catalog.charities.map((c) => [c.id, c]));
const oppById = () => Object.fromEntries(catalog.opportunities.map((o) => [o.id, o]));
const monthKey = (iso) => iso.slice(0, 7);

function monthStreak(months) {
  const set = new Set(months);
  const d = new Date(`${fromDay(todayDay())}T00:00:00Z`);
  const key = () => d.toISOString().slice(0, 7);
  if (!set.has(key())) d.setUTCMonth(d.getUTCMonth() - 1); // this month isn't over; streak is still alive
  let n = 0;
  while (set.has(key())) { n++; d.setUTCMonth(d.getUTCMonth() - 1); }
  return n;
}

export function journey(hhid) {
  const charities = charityById();
  const opps = oppById();
  const gifts = store.state.donations.filter((d) => d.hhid === hhid);
  const shifts = store.state.signups.filter((s) => s.hhid === hhid && s.status === 'completed');
  const donated = gifts.reduce((a, g) => a + g.points, 0);
  const matched = gifts.reduce((a, g) => a + (g.matchedPoints || 0), 0);
  const hours = shifts.reduce((a, s) => a + s.hours, 0);
  const impactScore = Math.round(donated + hours * HOUR_VALUE);

  const levelIdx = LEVELS.reduce((idx, l, i) => (impactScore >= l.min ? i : idx), 0);
  const level = LEVELS[levelIdx];
  const next = LEVELS[levelIdx + 1] || null;
  const progress = next ? (impactScore - level.min) / (next.min - level.min) : 1;

  const causeOf = (g) => (g.kind === 'neighbor' ? 'neighbors' : charities[g.charityId]?.cause);
  const perCause = {};
  for (const g of gifts) perCause[causeOf(g)] = (perCause[causeOf(g)] || 0) + 1;
  const streak = monthStreak([...gifts.map((g) => monthKey(g.ts)), ...shifts.map((s) => monthKey(s.completedTs))]);
  const neighborGifts = gifts.filter((g) => g.kind === 'neighbor');
  const stats = { gifts: gifts.length, shifts: shifts.length, hours, matched, streak, neighborGifts: neighborGifts.length, causes: Object.keys(perCause).length, maxPerCause: Math.max(0, ...Object.values(perCause)) };
  const badges = BADGES.map((b) => ({ key: b.key, name: b.name, desc: b.desc, earned: b.test(stats) }));

  // Tangible impact, e.g. "126 meals", including partner matches.
  const impact = {};
  for (const g of gifts) {
    if (g.kind === 'neighbor') {
      impact['households supported'] = (impact['households supported'] || 0) + g.recipients;
      continue;
    }
    const c = charities[g.charityId];
    if (!c) continue;
    const units = ((g.points + (g.matchedPoints || 0)) / POINTS_PER_DOLLAR) * c.impact.perDollar;
    impact[c.impact.unit] = (impact[c.impact.unit] || 0) + units;
  }
  const history = [
    ...gifts.map((g) => ({
      type: 'gift', kind: g.kind || 'charity', id: g.id, ts: g.ts, points: g.points, matchedPoints: g.matchedPoints || 0, dollars: g.dollars, fisRef: g.fisRef,
      charity: g.kind === 'neighbor' ? `${g.areaName} Neighbor Fund` : charities[g.charityId]?.name, recipients: g.recipients,
    })),
    ...shifts.map((s) => ({ type: 'volunteer', id: s.id, ts: s.completedTs, charity: charities[opps[s.oppId]?.charityId]?.name, title: opps[s.oppId]?.title, hours: s.hours })),
  ].sort((a, b) => b.ts.localeCompare(a.ts));

  return {
    impactScore, donatedPoints: donated, matchedPoints: matched, volunteerHours: hours, hourValue: HOUR_VALUE,
    neighborHouseholds: neighborGifts.reduce((a, g) => a + g.recipients, 0),
    level: { ...level, index: levelIdx }, nextLevel: next, progress: Math.min(1, progress), toNext: next ? next.min - impactScore : 0,
    levels: LEVELS, streak, badges,
    impact: Object.entries(impact).map(([unit, n]) => ({ unit, amount: Math.floor(n) })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount),
    history: history.slice(0, 12),
  };
}

function campaignUsage(c) {
  return store.state.donations.filter((d) => d.campaignId === c.id).reduce((a, d) => a + (d.matchedPoints || 0), 0);
}

export function campaigns() {
  const partners = Object.fromEntries(catalog.partners.map((p) => [p.id, p]));
  return catalog.campaigns.map((c) => {
    const used = campaignUsage(c);
    return { ...c, sponsor: partners[c.sponsorPartnerId].name, endsDt: fromDay(todayDay() + c.endsInDays), usedPoints: used, remainingPoints: Math.max(0, c.capPoints - used) };
  });
}

export function community() {
  const g = catalog.communityGoal;
  const live = store.state.donations.filter((d) => !d.historical);
  const dollars = live.reduce((a, d) => a + d.dollars + (d.matchedPoints || 0) / POINTS_PER_DOLLAR, 0);
  const contributors = new Set(live.map((d) => d.hhid)).size;
  const raised = g.baselineDollars + dollars;
  return { title: g.title, subtitle: g.subtitle, targetDollars: g.targetDollars, raisedDollars: Math.round(raised), progress: Math.min(1, raised / g.targetDollars), contributors: g.contributors + contributors };
}

export async function donate(ctx, { charityId, points }) {
  points = Math.floor(Number(points));
  const charity = catalog.charities.find((c) => c.id === charityId);
  if (!charity) throw new HttpError(404, 'Charity not found');
  if (!(points >= 100)) throw new HttpError(400, 'Minimum gift is 100 points ($1)');
  if (points > store.state.points[ctx.hhid].balance) throw new HttpError(422, 'Not enough points');

  const before = journey(ctx.hhid);
  const campaign = campaigns().find((c) => c.causes.includes(charity.cause) && c.remainingPoints > 0);
  const matchedPoints = campaign ? Math.min(Math.round(points * campaign.ratio), campaign.remainingPoints) : 0;
  const dollars = points / POINTS_PER_DOLLAR;

  const transfer = await fis.transfer({
    fromAcct: catalog.rewardsPool, toAcct: charity.settlement, tranAmt: dollars, memo: `GIFT ${ctx.hhid}`,
    debitDesc: `MEMBER GIFT TO ${charity.name.toUpperCase()}`, creditDesc: 'HELPING HANDS MEMBER GIFT',
  });
  let matchTransfer = null;
  if (matchedPoints) {
    const sponsor = catalog.partners.find((p) => p.id === campaign.sponsorPartnerId);
    matchTransfer = await fis.transfer({
      fromAcct: sponsor.settlement, toAcct: charity.settlement, tranAmt: matchedPoints / POINTS_PER_DOLLAR, memo: `MATCH ${campaign.id.toUpperCase()}`,
      debitDesc: `MATCHING GIFT ${charity.name.toUpperCase()}`, creditDesc: `MATCHING GIFT VIA HELPING HANDS ${sponsor.name.toUpperCase()}`,
    });
  }
  const donation = {
    id: newId('don'), hhid: ctx.hhid, charityId, points, dollars, matchedPoints, campaignId: matchedPoints ? campaign.id : null,
    ts: new Date().toISOString(), fisRef: transfer.tranRefNbr, matchRef: matchTransfer?.tranRefNbr ?? null,
  };
  store.state.donations.push(donation);
  store.addPoints(ctx.hhid, { type: 'donation', points: -points, desc: `Gift to ${charity.name}`, ref: transfer.tranRefNbr });
  store.save();

  const units = ((points + matchedPoints) / POINTS_PER_DOLLAR) * charity.impact.perDollar;
  return {
    donation, transfer, matchTransfer,
    impact: { unit: charity.impact.unit, amount: Math.round(units * 10) / 10 },
    ...journeyDelta(ctx.hhid, before),
    balance: store.state.points[ctx.hhid].balance,
  };
}

export function journeyDelta(hhid, before) {
  const after = journey(hhid);
  return {
    journey: after,
    newBadges: after.badges.filter((b) => b.earned && !before.badges.find((x) => x.key === b.key).earned),
    levelUp: after.level.index > before.level.index ? after.level : null,
  };
}
