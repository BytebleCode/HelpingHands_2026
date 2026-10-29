import express from 'express';
import { store, catalog, incomeModel, newId } from '../lib/store.js';
import { loadContext, HttpError, mask } from '../lib/context.js';
import { fis } from '../lib/fisClient.js';
import { CATEGORIES, categoryOf, OFFER_NEED_THRESHOLD } from '../lib/mcc.js';
import { TIERS } from '../lib/incomeModel.js';
import { recommend, activate, sync, cashOut, payWithPoints, POINTS_PER_DOLLAR, EVERYDAY_PTS_PER_DOLLAR } from '../lib/rewards.js';
import { checkNudge, weekView, placesFor, recentNudges } from '../lib/nudge.js';
import { journey, campaigns, community, donate } from '../lib/giving.js';
import { haversineMiles, originFor } from '../lib/geo.js';
import { experienceFor } from '../lib/experience.js';
import { neighborAreas, giveToNeighbors } from '../lib/community.js';
import { core } from '../fis/store.js';
import { wrap, member } from './http.js';

const router = express.Router();
router.use(express.json());

const pointsOf = (hhid) => store.state.points[hhid].balance;
const neighborGiftsOf = (hhid) => store.state.points[hhid].ledger.filter((e) => e.type === 'neighbor-gift');
export const meView = (ctx) => {
  const j = journey(ctx.hhid);
  const gifts = neighborGiftsOf(ctx.hhid);
  return {
    hhid: ctx.hhid, firstName: ctx.person.firstName, lastName: ctx.person.lastName, zipCde: ctx.person.zipCde, location: ctx.person.location,
    areaName: catalog.market.neighborhoods[ctx.person.location.label]?.name, market: { id: catalog.market.id, name: catalog.market.name },
    tier: ctx.estimate.tier, percentile: ctx.estimate.percentile, experience: experienceFor(ctx.estimate.tier),
    points: pointsOf(ctx.hhid), pointsValue: pointsOf(ctx.hhid) / POINTS_PER_DOLLAR,
    linkedAccounts: ctx.person.links.length,
    neighborGifts: { count: gifts.length, points: gifts.reduce((a, e) => a + e.points, 0) },
    journey: { level: j.level, nextLevel: j.nextLevel, progress: j.progress, impactScore: j.impactScore, streak: j.streak, toNext: j.toNext, neighborHouseholds: j.neighborHouseholds },
  };
};

const charityView = (c, origin) => ({
  id: c.id, name: c.name, legalName: c.legalName, cause: c.cause, causeLabel: c.causeLabel, mission: c.mission, image: c.image, ein: c.ein,
  website: c.website, impact: c.impact, address: c.address, mailingOnly: c.mailingOnly, approximate: c.location.approximate,
  distance: Math.round(haversineMiles(origin, c.location) * 10) / 10,
  institution: core.institution(c.settlement.instNbr).instNme,
});

// ------------------------------------------------------------------ session
router.get('/health', (req, res) => res.json({ ok: true, coreAsOf: core.meta.asOfDt }));

router.get('/personas', wrap(async (req, res) => {
  const list = await Promise.all(store.people().map(async (p) => {
    const ctx = await loadContext(p.hhid);
    return {
      hhid: p.hhid, firstName: p.firstName, lastName: p.lastName, blurb: p.blurb, tier: ctx.estimate.tier, percentile: ctx.estimate.percentile,
      linkedAccounts: p.links.length, experience: experienceFor(ctx.estimate.tier), areaName: catalog.market.neighborhoods[p.location.label]?.name,
    };
  }));
  res.json({ personas: list.sort((a, b) => a.percentile - b.percentile) });
}));

// Sign-in also syncs rewards so points reflect the latest FIS activity.
router.post('/session', wrap(async (req, res) => {
  const hhid = String(req.body?.hhid || '').toUpperCase().trim();
  const ctx = await loadContext(hhid);
  const result = await sync(ctx);
  res.json({ me: meView(ctx), sync: result });
}));

router.get('/me', member(async (req, res) => res.json({ me: meView(req.ctx) })));

router.get('/home', member(async (req, res) => {
  const ctx = req.ctx;
  const rec = recommend(ctx);
  res.json({
    me: meView(ctx),
    picks: rec.offers.filter((o) => o.status !== 'active').slice(0, 6),
    activeOffers: rec.offers.filter((o) => o.status === 'active').length,
    community: community(),
    campaigns: campaigns().filter((c) => c.remainingPoints > 0),
    activity: store.state.points[ctx.hhid].ledger.slice(0, 6),
    essentials: { share: ctx.summary.totals.spend ? ctx.summary.totals.need / ctx.summary.totals.spend : 0 },
    neighborAreas: (await neighborAreas()).areas.filter((a) => a.type === 'neighborhood' && a.targetable.lower).slice(0, 3),
    neighborGiftsReceived: neighborGiftsOf(ctx.hhid).slice(0, 3),
    charities: catalog.charities.map((c) => charityView(c, originFor(ctx.person))).sort((a, b) => a.distance - b.distance).slice(0, 4),
  });
}));

// ------------------------------------------------------------------ account & identity
router.get('/me/accounts', member(async (req, res) => {
  const ctx = req.ctx;
  res.json({
    hhid: ctx.hhid,
    accounts: ctx.accounts.map(({ link, account, institution, txns }) => ({
      id: link.id, instNbr: link.instNbr, institution: institution.instNme, rtnNbr: institution.rtnNbr, coreSys: institution.coreSys,
      applCde: account.applCde, type: account.applCde === 'SV' ? 'Savings' : 'Checking', product: account.prodDesc,
      masked: mask(account.acctNbr), curBal: account.curBal, availBal: account.availBal, linkedAt: link.linkedAt,
      recent: txns.slice(0, 6).map((t) => ({
        postDt: t.postDt, desc: t.mrchNme || t.tranDesc, amount: t.drCrCde === 'C' ? t.tranAmt : -t.tranAmt,
        category: CATEGORIES[categoryOf(t)]?.label, tranCde: t.tranCde,
      })),
    })),
    institutions: ctx.institutions.map((i) => ({ instNbr: i.instNbr, name: i.instNme })),
    demoUnlinked: ctx.person.demoUnlinked || [],
  });
}));

router.post('/me/links', member(async (req, res) => {
  const ctx = req.ctx;
  const { instNbr, acctNbr, taxIdLast4, zipCde } = req.body || {};
  if (!instNbr || !acctNbr || !taxIdLast4 || !zipCde) throw new HttpError(400, 'All fields are required');
  const owner = store.people().find((p) => p.links.some((l) => l.instNbr === instNbr && l.acctNbr === String(acctNbr).trim()));
  if (owner) throw new HttpError(409, owner.hhid === ctx.hhid ? 'This account is already linked' : 'This account is linked to another Helping Hands ID');
  let verified;
  try {
    verified = await fis.verifyOwnership({ instNbr, acctNbr: String(acctNbr).trim(), taxIdLast4, zipCde });
  } catch (err) {
    if (err instanceof FisError && err.status === 422) throw new HttpError(422, 'The bank could not verify this account with those details');
    throw err;
  }
  const n = verified.customer.nme;
  if (n.frstNme?.toLowerCase() !== ctx.person.firstName.toLowerCase() || n.lstNme?.toLowerCase() !== ctx.person.lastName.toLowerCase()) {
    throw new HttpError(422, 'The account holder does not match this Helping Hands ID');
  }
  const link = {
    id: newId('lnk'), instNbr, applCde: verified.account.applCde, acctNbr: verified.account.acctNbr,
    custNbr: verified.customer.custNbr, linkedAt: new Date().toISOString(),
  };
  const before = ctx.estimate;
  ctx.person.links.push(link);
  ctx.person.demoUnlinked = (ctx.person.demoUnlinked || []).filter((u) => u.acctNbr !== link.acctNbr);
  store.save();
  const after = await loadContext(ctx.hhid);
  const syncResult = await sync(after);
  res.status(201).json({
    link: { ...link, masked: mask(link.acctNbr) },
    estimate: { before: { percentile: before.percentile, tier: before.tier }, after: { percentile: after.estimate.percentile, tier: after.estimate.tier } },
    sync: syncResult,
  });
}));

router.delete('/me/links/:id', member(async (req, res) => {
  const p = req.ctx.person;
  if (p.links.length <= 1) throw new HttpError(422, 'Keep at least one linked account');
  const link = p.links.find((l) => l.id === req.params.id);
  if (!link) throw new HttpError(404, 'Link not found');
  p.links = p.links.filter((l) => l.id !== link.id);
  store.save();
  res.json({ ok: true });
}));

router.get('/me/insights', member(async (req, res) => {
  const { summary, estimate } = req.ctx;
  const categories = Object.values(summary.byCategory)
    .map((c) => ({ category: c.category, label: CATEGORIES[c.category]?.label ?? c.category, group: CATEGORIES[c.category]?.group ?? 'flex', needWeight: CATEGORIES[c.category]?.needWeight ?? 0, total: Math.round(c.total), share: c.share, count: c.count, topMerchant: c.topMerchant }))
    .sort((a, b) => b.total - a.total);
  res.json({
    estimate,
    tiers: TIERS.map((t, i) => ({ ...t, minPct: i ? TIERS[i - 1].maxPct : 0, maxPct: Math.min(100, t.maxPct) })),
    spending: {
      windowDays: summary.windowDays, total: Math.round(summary.totals.spend), need: Math.round(summary.totals.need), discretionary: Math.round(summary.totals.discretionary),
      needShare: summary.totals.spend ? summary.totals.need / summary.totals.spend : 0, monthlyInflow: Math.round(summary.raw.monthlyInflow), monthlySpend: Math.round(summary.raw.monthlySpend), categories,
    },
    model: { ...incomeModel.metrics, features: incomeModel.features.length, type: incomeModel.type },
    rules: { offerNeedThreshold: OFFER_NEED_THRESHOLD, everydayPtsPerDollar: EVERYDAY_PTS_PER_DOLLAR, pointsPerDollar: POINTS_PER_DOLLAR },
  });
}));

router.get('/me/activity', member(async (req, res) => {
  res.json({ balance: pointsOf(req.ctx.hhid), ledger: store.state.points[req.ctx.hhid].ledger.slice(0, 50) });
}));

// ------------------------------------------------------------------ rewards
router.get('/rewards', member(async (req, res) => {
  const rec = recommend(req.ctx, { category: req.query.category });
  res.json({ ...rec, points: pointsOf(req.ctx.hhid) });
}));
router.post('/rewards/sync', member(async (req, res) => res.json(await sync(req.ctx))));
router.post('/rewards/:offerId/activate', member(async (req, res) => res.json(await activate(req.ctx, req.params.offerId))));
router.post('/rewards/cashout', member(async (req, res) => res.json(await cashOut(req.ctx, req.body || {}))));
// Pay with points at a partner (Premium Payback style): { partnerId, points } -> statement credit via the FIS core.
router.post('/rewards/pay-with-points', member(async (req, res) => res.json(await payWithPoints(req.ctx, req.body || {}))));

// ------------------------------------------------------------------ moment-of-intent nudges
// See lib/nudge.js for how decisions are made. Location in these requests is used for the decision
// only and is never stored.
// POST /nudges/check   { date, time, lat?, lng?, record?, ignoreLimits? } -> decision + nudge (or why not)
// GET  /nudges/recent  nudges shown in the last week, so a member can reopen one any time
// GET  /nudges/week    the intent model's next 7 days (demo heatmap) + model test scores
// GET  /nudges/places  home + partner stores the demo simulator can place the member at
router.post('/nudges/check', member(async (req, res) => res.json(checkNudge(req.ctx, req.body || {}))));
router.get('/nudges/recent', member(async (req, res) => res.json(recentNudges(req.ctx))));
router.get('/nudges/week', member(async (req, res) => res.json(weekView(req.ctx))));
router.get('/nudges/places', member(async (req, res) => res.json(placesFor(req.ctx))));

// ------------------------------------------------------------------ giving
router.get('/giving', member(async (req, res) => {
  const origin = originFor(req.ctx.person, req.query);
  const charities = catalog.charities.map((c) => charityView(c, origin)).sort((a, b) => a.distance - b.distance);
  res.json({
    journey: journey(req.ctx.hhid), charities, causes: catalog.causes, campaigns: campaigns(), community: community(),
    points: pointsOf(req.ctx.hhid), pointsPerDollar: POINTS_PER_DOLLAR, neighbors: await neighborAreas(),
    market: { id: catalog.market.id, name: catalog.market.name, state: catalog.market.state, charitiesPulledAt: catalog.market.charitiesPulledAt },
  });
}));
router.post('/giving/donations', member(async (req, res) => res.status(201).json(await donate(req.ctx, req.body || {}))));
router.get('/neighbors', member(async (req, res) => res.json(await neighborAreas())));
router.post('/neighbors/gifts', member(async (req, res) => res.status(201).json(await giveToNeighbors(req.ctx, req.body || {}))));

// ------------------------------------------------------------------ demo sandbox
// Posts a purchase into the fake core as a card authorization (memo post), then syncs rewards.
router.get('/sandbox/merchants', (req, res) => {
  res.json({ merchants: catalog.partners.map((p) => ({ id: p.id, name: p.name, category: p.categoryLabel, needs: CATEGORIES[p.category].needWeight >= OFFER_NEED_THRESHOLD })) });
});
router.post('/sandbox/purchase', member(async (req, res) => {
  const { linkId, partnerId, amount } = req.body || {};
  const link = req.ctx.person.links.find((l) => l.id === linkId);
  const partner = catalog.partners.find((p) => p.id === partnerId);
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!link || !partner || !(amt > 0)) throw new HttpError(400, 'Choose an account, a merchant and an amount');
  const posting = partner.payeeCatCde
    ? { drCrCde: 'D', tranCde: 'ACHD', tranDesc: `ACH DEBIT ${partner.name.toUpperCase()}`, tranAmt: amt, mrchId: partner.mrchId, mrchNme: partner.name.toUpperCase(), payeeCatCde: partner.payeeCatCde }
    : { drCrCde: 'D', tranCde: 'POS', tranDesc: `POS PURCHASE ${partner.name.toUpperCase()}`, tranAmt: amt, mrchId: partner.mrchId, mrchNme: partner.name.toUpperCase(), mrchCatCde: partner.mcc };
  const transaction = await fis.memoPost(link, posting);
  const ctx = await loadContext(req.ctx.hhid);
  res.status(201).json({ transaction, account: mask(link.acctNbr), sync: await sync(ctx) });
}));

router.post('/admin/reset', wrap(async (req, res) => {
  core.reset();
  store.reset();
  res.json({ ok: true });
}));

export default router;
