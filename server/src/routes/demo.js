// Demo-only endpoints: a look inside the simulated FIS core, the synthetic population, the income
// model's reasoning for any member, and how the experience changes across income levels.
import express from 'express';
import { store, catalog, incomeModel, personaTruth, communityMembers } from '../lib/store.js';
import { loadContext, mask, HttpError } from '../lib/context.js';
import { fis } from '../lib/fisClient.js';
import { CATEGORIES } from '../lib/mcc.js';
import { FEATURES } from '../lib/features.js';
import { TIERS, predictLog } from '../lib/incomeModel.js';
import { recommend, sync, EVERYDAY_PTS_PER_DOLLAR } from '../lib/rewards.js';
import { journey } from '../lib/giving.js';
import { experienceFor, EXPERIENCES } from '../lib/experience.js';
import { scoredMembers, K_MIN } from '../lib/community.js';
import { core, keyOf } from '../fis/store.js';
import { toDay } from '../lib/dates.js';
import { wrap, member } from './http.js';
import { meView } from './api.js';

const router = express.Router();
const areaName = (id) => catalog.market.neighborhoods[id]?.name || id;

// Simulator introspection (the real core would not expose counts like this).
router.get('/overview', wrap(async (req, res) => {
  const accounts = [...core.accounts.values()];
  const byCode = {};
  let first = '9999', last = '0000', txTotal = 0;
  for (const txns of core.transactions.values()) {
    txTotal += txns.length;
    for (const t of txns) {
      byCode[t.tranCde] = (byCode[t.tranCde] || 0) + 1;
      if (t.postDt < first) first = t.postDt;
      if (t.postDt > last) last = t.postDt;
    }
  }
  const institutions = core.institutions.map((i) => {
    const mine = accounts.filter((a) => a.instNbr === i.instNbr);
    return {
      instNbr: i.instNbr, name: i.instNme, shortName: i.shortNme, rtnNbr: i.rtnNbr, coreSys: i.coreSys,
      customers: core.customers.filter((c) => c.instNbr === i.instNbr).length, accounts: mine.length,
      transactions: mine.reduce((a, x) => a + (core.transactions.get(keyOf(x.instNbr, x.applCde, x.acctNbr))?.length || 0), 0),
    };
  });
  const TRAN_LABELS = { POS: 'Card purchase', ACHD: 'ACH debit (bills)', ACHC: 'ACH credit (pay, benefits)', XFRO: 'Transfer out', XFRI: 'Transfer in', ATMW: 'ATM withdrawal', FEE: 'Fee', INT: 'Interest', MEMO: 'Memo credit' };
  const owner = (l) => core.customer(l.instNbr, core.account(l.instNbr, l.applCde, l.acctNbr)?.custNbr);
  const sample = [
    ...store.people().flatMap((p) => [...p.links, ...(p.demoUnlinked || [])].map((l) => ({ ...l, label: `${p.firstName} ${p.lastName} · ${l.applCde === 'SV' ? 'Savings' : 'Checking'}`, group: 'Demo members' }))),
    ...communityMembers.slice(0, 3).map((c) => ({ ...c.links[0], label: `${c.firstName} ${c.lastName} · Checking (synthetic, ${areaName(c.area)})`, group: 'Community' })),
    { ...catalog.rewardsPool, label: 'Helping Hands Rewards Pool', group: 'Program' },
    { ...catalog.neighborFund, label: 'Helping Hands Neighbor Fund', group: 'Program' },
    { ...catalog.partners[0].settlement, label: `${catalog.partners[0].name} · settlement`, group: 'Partners' },
    { ...catalog.charities[0].settlement, label: `${catalog.charities[0].name} · demo settlement`, group: 'Charities' },
  ].map((l) => ({ instNbr: l.instNbr, applCde: l.applCde, acctNbr: l.acctNbr, label: l.label, group: l.group, owner: owner(l)?.custNbr }));

  res.json({
    market: { id: catalog.market.id, name: catalog.market.name, state: catalog.market.state, neighborhoods: Object.keys(catalog.market.neighborhoods).length, charitiesPulledAt: catalog.market.charitiesPulledAt },
    totals: {
      institutions: core.institutions.length, customers: core.customers.length, accounts: accounts.length, transactions: txTotal,
      simulatedHouseholds: core.simulated, personas: store.people().length, partners: catalog.partners.length,
      offers: catalog.offers.length, charities: catalog.charities.length,
    },
    dateRange: { from: first, to: last },
    institutions,
    tranCodes: Object.entries(byCode).map(([code, n]) => ({ code, label: TRAN_LABELS[code] || code, count: n })).sort((a, b) => b.count - a.count),
    sampleAccounts: sample,
  });
}));

// Raw FIS responses, proxied through the adapter (read-only, allow-listed paths).
const ALLOWED = [/^\/institutions$/, /^\/customers\/\d{4}\/\d+(\/accounts)?$/, /^\/accounts\/\d{4}\/(DD|SV)\/\d+(\/transactions)?$/];
router.get('/fis', wrap(async (req, res) => {
  const path = String(req.query.path || '');
  if (!ALLOWED.some((r) => r.test(path))) throw new HttpError(400, 'Path not available in the explorer');
  const qs = path.endsWith('/transactions') ? `?pageSize=${Math.min(50, Number(req.query.pageSize) || 15)}` : '';
  res.json({ request: { method: 'GET', url: `/fis/v1${path}${qs}`, headers: { 'organization-id': 'HHDEMO', 'x-api-key': '••••••••', uuid: '<per request>' } }, response: await fis.raw(`${path}${qs}`) });
}));

// The synthetic population as the model sees it, with ground truth for the accuracy view.
router.get('/population', wrap(async (req, res) => {
  const members = await scoredMembers();
  const q = incomeModel.populationQuantiles;
  res.json({
    members: members.map((m) => ({
      persona: m.persona, name: m.persona ? m.name : null, area: m.area, areaName: areaName(m.area),
      trueIncome: m.persona ? personaTruth[m.hhid] : m.trueIncome, predicted: m.estimatedIncome, percentile: m.percentile, tier: m.tier.key,
    })),
    tiers: TIERS.map((t, i) => ({
      key: t.key, name: t.name, multiplier: t.multiplier, fromPct: i ? TIERS[i - 1].maxPct : 0, toPct: Math.min(100, t.maxPct),
      fromIncome: i ? Math.round(Math.exp(q[TIERS[i - 1].maxPct])) : null, toIncome: t.maxPct <= 100 ? Math.round(Math.exp(q[t.maxPct])) : null,
    })),
    metrics: incomeModel.metrics,
    kMin: K_MIN,
  });
}));

// Step-by-step model reasoning for one member (defaults to the signed-in member).
router.get('/pipeline', member(async (req, res) => {
  const ctx = req.query.hhid && req.query.hhid !== req.ctx.hhid ? await loadContext(String(req.query.hhid)) : req.ctx;
  const { summary, estimate } = ctx;
  const { logIncome, contributions } = predictLog(incomeModel, summary.features);
  const features = FEATURES.map((f) => {
    const m = incomeModel.features.find((x) => x.key === f.key);
    const c = contributions.find((x) => x.key === f.key);
    return {
      key: f.key, label: f.label, fmt: f.fmt, value: f.raw ? summary.raw[f.raw] : summary.features[f.key],
      z: Math.round(c.z * 100) / 100, weight: Math.round(m.weight * 1000) / 1000, contribution: c.contribution,
      effectPct: Math.round((Math.exp(c.contribution) - 1) * 1000) / 10, used: m.weight !== 0,
    };
  }).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const rec = recommend(ctx);
  const windowTxns = ctx.accounts.reduce((a, x) => a + x.txns.filter((t) => toDay(t.postDt) >= summary.start).length, 0);
  res.json({
    member: { hhid: ctx.hhid, name: `${ctx.person.firstName} ${ctx.person.lastName}`, areaName: areaName(ctx.person.location.label) },
    accounts: ctx.accounts.map((a) => ({ institution: a.institution.instNme, type: a.account.applCde === 'SV' ? 'Savings' : 'Checking', masked: mask(a.account.acctNbr), transactions: a.txns.length })),
    window: { days: summary.windowDays, transactions: windowTxns },
    spending: Object.values(summary.byCategory).sort((a, b) => b.total - a.total).slice(0, 8)
      .map((c) => ({ category: c.category, label: CATEGORIES[c.category]?.label ?? c.category, share: c.share, needWeight: CATEGORIES[c.category]?.needWeight ?? 0, group: CATEGORIES[c.category]?.group })),
    features,
    baselineIncome: Math.round(Math.exp(incomeModel.intercept)),
    estimatedIncome: estimate.estimatedAnnualIncome, logIncome, percentile: estimate.percentile, tier: estimate.tier,
    experience: experienceFor(estimate.tier),
    offers: {
      shown: rec.offers.length, withheld: rec.withheld.count, everydayRate: EVERYDAY_PTS_PER_DOLLAR * estimate.tier.multiplier,
      top: rec.offers.slice(0, 3).map((o) => ({ partner: o.partner.name, title: o.title, headline: o.value.headline, base: o.value.kind === 'percent' ? `${o.value.baseRate}%` : `$${o.value.baseAmount}` })),
    },
    model: { type: incomeModel.type, lambda: incomeModel.lambda, ...incomeModel.metrics },
  });
}));

// The same site, five incomes: what changes for each demo member.
router.get('/compare', wrap(async (req, res) => {
  const rows = await Promise.all(store.people().map(async (p) => {
    const ctx = await loadContext(p.hhid);
    await sync(ctx); // same as signing in: credit everyday earning so balances are comparable
    const rec = recommend(ctx);
    const me = meView(ctx);
    const sample = rec.offers.find((o) => o.id === 'off-greenleaf');
    return {
      hhid: p.hhid, name: `${p.firstName} ${p.lastName}`, firstName: p.firstName, areaName: me.areaName,
      percentile: me.percentile, tier: me.tier, experience: me.experience,
      everydayRate: EVERYDAY_PTS_PER_DOLLAR * me.tier.multiplier,
      sampleOffer: sample && { partner: sample.partner.name, base: `${sample.value.baseRate}%`, boosted: sample.value.headline },
      topOffer: rec.offers[0] && { partner: rec.offers[0].partner.name, headline: rec.offers[0].value.headline },
      points: me.points, level: journey(p.hhid).level.name, neighborGifts: me.neighborGifts,
    };
  }));
  res.json({ rows: rows.sort((a, b) => a.percentile - b.percentile), experiences: Object.values(EXPERIENCES) });
}));

export default router;
