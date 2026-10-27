// Needs-first offer recommendations, the card-linked coupon wallet, everyday earning and cash-out.
import { CATEGORIES, categoryOf, isOfferable, needWeightOf } from './mcc.js';
import { store, catalog } from './store.js';
import { fis } from './fisClient.js';
import { allTransactions, HttpError, mask } from './context.js';
import { toDay, fromDay } from './dates.js';

export const POINTS_PER_DOLLAR = 100; // 100 pts = $1
export const EVERYDAY_PTS_PER_DOLLAR = 1; // base 1 pt per $1 (1%) on essential card spend, before the tier multiplier
const EARNING_CODES = new Set(['POS', 'CCP']);

const partnerById = Object.fromEntries(catalog.partners.map((p) => [p.id, p]));
const money = (x) => `$${x.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const round2 = (x) => Math.round(x * 100) / 100;

export function offerValue(offer, multiplier) {
  if (offer.kind === 'percent') {
    return { kind: 'percent', baseRate: offer.baseRate, rate: round2(offer.baseRate * multiplier), cap: round2(offer.maxReward * multiplier), headline: `${round2(offer.baseRate * multiplier)}% back` };
  }
  return { kind: 'fixed', baseAmount: offer.baseAmount, amount: round2(offer.baseAmount * multiplier), headline: `$${round2(offer.baseAmount * multiplier).toFixed(2).replace(/\.00$/, '')} credit` };
}

function rewardFor(offer, amt, multiplier) {
  const boosted = offer.kind === 'percent'
    ? Math.min((amt * offer.baseRate * multiplier) / 100, offer.maxReward * multiplier)
    : offer.baseAmount * multiplier;
  return { boosted: round2(boosted), partnerFunded: round2(boosted / multiplier), programFunded: round2(boosted - boosted / multiplier) };
}

function activationView(act) {
  if (!act) return { status: 'available' };
  return { status: act.status, activatedTs: act.activatedTs, redemptions: act.redemptions };
}

export function recommend(ctx, { category } = {}) {
  const { summary, estimate, today } = ctx;
  const multiplier = estimate.tier.multiplier;
  const acts = store.state.activations[ctx.hhid];
  const txns = allTransactions(ctx).filter((t) => toDay(t.postDt) > today - 90 && t.drCrCde === 'D');
  const visits = {};
  for (const t of txns) if (t.mrchId) visits[t.mrchId] = (visits[t.mrchId] || 0) + 1;
  // Affinity is relative to the member's biggest *offer* category, so rent doesn't flatten every score.
  const offerCats = new Set(catalog.offers.map((o) => partnerById[o.partnerId].category));
  const shares = Object.values(summary.byCategory).filter((c) => offerCats.has(c.category) && isOfferable(c.category)).map((c) => c.share);
  const maxShare = Math.max(0.0001, ...shares);

  const offers = [];
  const withheld = [];
  for (const o of catalog.offers) {
    const partner = partnerById[o.partnerId];
    const cat = partner.category;
    if (!isOfferable(cat)) {
      withheld.push({ id: o.id, partner: partner.name, category: cat, categoryLabel: CATEGORIES[cat].label });
      continue;
    }
    const c = summary.byCategory[cat];
    const affinity = c ? c.share / maxShare : 0;
    const v = visits[partner.mrchId] || 0;
    const score = needWeightOf(cat) * (0.25 + affinity) * (1 + Math.min(v, 8) * 0.12);
    let reason;
    if (v) reason = `You paid ${partner.name} ${v} time${v > 1 ? 's' : ''} in the last 90 days`;
    else if (c && c.total > 20) reason = `You spent ${money(c.total)} on ${CATEGORIES[cat].label.toLowerCase()} in the last 90 days`;
    else reason = `An everyday essential for households like yours`;
    offers.push({
      id: o.id, title: o.title, description: o.desc, category: cat, categoryLabel: CATEGORIES[cat].label, needWeight: needWeightOf(cat),
      partner: { id: partner.id, name: partner.name, blurb: partner.blurb, institution: partner.settlement.instNbr },
      image: o.image, minSpend: o.minSpend, lookbackDays: o.lookbackDays, legacyCode: o.legacyCode,
      expiresDt: fromDay(today + o.expiresInDays),
      value: offerValue(o, multiplier), multiplier,
      score: round2(score), reason, ...activationView(acts[o.id]),
    });
  }
  // Greedy re-rank for variety: repeat partners and categories are gently demoted.
  const pool = [...offers];
  const ranked = [];
  const seenPartner = {}, seenCat = {};
  const adjusted = (o) => o.score * 0.6 ** (seenPartner[o.partner.id] || 0) * 0.85 ** (seenCat[o.category] || 0);
  while (pool.length) {
    pool.sort((a, b) => adjusted(b) - adjusted(a));
    const o = pool.shift();
    seenPartner[o.partner.id] = (seenPartner[o.partner.id] || 0) + 1;
    seenCat[o.category] = (seenCat[o.category] || 0) + 1;
    ranked.push(o);
  }
  offers.splice(0, offers.length, ...ranked);
  const categories = [...new Set(offers.map((o) => o.category))].map((k) => ({ key: k, label: CATEGORIES[k].label }));
  return {
    multiplier, tier: estimate.tier,
    offers: category ? offers.filter((o) => o.category === category) : offers,
    categories,
    withheld: { count: withheld.length, categories: [...new Set(withheld.map((w) => w.categoryLabel))] },
  };
}

/** Everyday earning on essential card purchases since enrollment. */
function earnEveryday(ctx) {
  const earned = store.state.earned[ctx.hhid];
  const mult = ctx.estimate.tier.multiplier;
  let total = 0, count = 0, spend = 0;
  for (const t of allTransactions(ctx)) {
    if (t.drCrCde !== 'D' || !EARNING_CODES.has(t.tranCde) || earned[t.key]) continue;
    if (toDay(t.postDt) < ctx.person.enrolledDay) continue;
    earned[t.key] = true;
    if (CATEGORIES[categoryOf(t)]?.group !== 'need') continue;
    total += t.tranAmt * EVERYDAY_PTS_PER_DOLLAR * mult;
    spend += t.tranAmt;
    count++;
  }
  if (!count) return null;
  return store.addPoints(ctx.hhid, {
    type: 'everyday', points: total,
    desc: `Everyday essentials \u00b7 ${count} purchase${count > 1 ? 's' : ''} (${money(spend)}) at ${mult}\u00d7`,
  });
}

/** Card-linked matching, including purchases made before activation (look-back window). */
async function matchActivations(ctx) {
  const acts = store.state.activations[ctx.hhid];
  const used = new Set(Object.values(acts).flatMap((a) => a.redemptions.map((r) => r.txnKey)));
  const txns = allTransactions(ctx).filter((t) => t.drCrCde === 'D' && t.mrchId);
  const mult = ctx.estimate.tier.multiplier;
  const out = [];
  for (const act of Object.values(acts)) {
    if (act.status !== 'active') continue;
    const offer = catalog.offers.find((o) => o.id === act.offerId);
    const partner = partnerById[offer.partnerId];
    const fromDayN = act.activatedDay - offer.lookbackDays;
    const match = txns
      .filter((t) => t.mrchId === partner.mrchId && t.tranAmt >= offer.minSpend && toDay(t.postDt) >= fromDayN && !used.has(t.key))
      .sort((a, b) => b.postDt.localeCompare(a.postDt) || b.seqNbr - a.seqNbr)[0];
    if (!match) continue;
    used.add(match.key);
    const r = rewardFor(offer, match.tranAmt, mult);
    // The partner funds the base offer through its FIS settlement account; the program funds the boost.
    const settlement = await fis.transfer({
      fromAcct: partner.settlement, toAcct: catalog.rewardsPool, tranAmt: r.partnerFunded,
      memo: `OFFER ${offer.id.toUpperCase()}`, debitDesc: `HELPING HANDS OFFER SETTLEMENT ${offer.id.toUpperCase()}`, creditDesc: `OFFER FUNDING ${partner.name.toUpperCase()}`,
    });
    const pts = Math.round(r.boosted * POINTS_PER_DOLLAR);
    const retroactive = toDay(match.postDt) < act.activatedDay;
    const redemption = {
      txnKey: match.key, postDt: match.postDt, tranAmt: match.tranAmt, merchant: match.mrchNme, account: mask(match.link.acctNbr),
      reward: r.boosted, partnerFunded: r.partnerFunded, programFunded: r.programFunded, points: pts, retroactive,
      settlementRef: settlement.tranRefNbr, ts: new Date().toISOString(),
    };
    act.redemptions.push(redemption);
    act.status = 'redeemed';
    store.addPoints(ctx.hhid, { type: 'offer', points: pts, desc: `${partner.name} \u00b7 ${offer.title}${retroactive ? ' (past purchase)' : ''}`, ref: settlement.tranRefNbr });
    out.push({ offerId: offer.id, partner: partner.name, title: offer.title, ...redemption });
  }
  return out;
}

export async function sync(ctx) {
  const everyday = earnEveryday(ctx);
  const redemptions = await matchActivations(ctx);
  store.save();
  return { everyday, redemptions, balance: store.state.points[ctx.hhid].balance };
}

export async function activate(ctx, offerId) {
  const offer = catalog.offers.find((o) => o.id === offerId);
  if (!offer) throw new HttpError(404, 'Offer not found');
  if (!isOfferable(partnerById[offer.partnerId].category)) throw new HttpError(422, 'Helping Hands only rewards essential needs');
  const acts = store.state.activations[ctx.hhid];
  const prev = acts[offerId];
  if (prev?.status === 'active') throw new HttpError(409, 'Offer already active');
  acts[offerId] = {
    offerId, status: 'active', activatedTs: new Date().toISOString(), activatedDay: ctx.today,
    redemptions: prev?.redemptions || [],
  };
  const result = await sync(ctx);
  return { activation: activationView(acts[offerId]), ...result };
}

export async function cashOut(ctx, { points, linkId }) {
  points = Math.floor(Number(points));
  const bal = store.state.points[ctx.hhid].balance;
  if (!(points >= 500)) throw new HttpError(400, 'Minimum cash-out is 500 points ($5)');
  if (points > bal) throw new HttpError(422, 'Not enough points');
  const link = ctx.person.links.find((l) => l.id === linkId);
  if (!link || link.applCde !== 'DD') throw new HttpError(400, 'Choose a linked checking account');
  const dollars = points / POINTS_PER_DOLLAR;
  const transfer = await fis.transfer({
    fromAcct: catalog.rewardsPool, toAcct: link, tranAmt: dollars, memo: `HH ${ctx.hhid}`,
    creditTranCde: 'MEMO', creditDesc: 'HELPING HANDS REWARD CREDIT', debitDesc: `REWARD CASH-OUT ${ctx.hhid}`,
  });
  const entry = store.addPoints(ctx.hhid, { type: 'cashout', points: -points, desc: `Statement credit to ${mask(link.acctNbr)}`, ref: transfer.tranRefNbr });
  store.save();
  return { entry, transfer, balance: store.state.points[ctx.hhid].balance };
}

/**
 * Pay with points at a partner (Premium Payback style): points become a statement credit on the
 * member's checking account, posted through the FIS core, labeled with the merchant.
 */
export async function payWithPoints(ctx, { partnerId, points }) {
  const partner = partnerById[partnerId];
  if (!partner) throw new HttpError(404, 'Partner not found');
  if (!isOfferable(partner.category)) throw new HttpError(422, 'Helping Hands only rewards essential needs');
  const bal = store.state.points[ctx.hhid].balance;
  points = Math.floor(Number(points ?? bal));
  if (!(points >= POINTS_PER_DOLLAR)) throw new HttpError(400, 'Apply at least 100 points ($1)');
  if (points > bal) throw new HttpError(422, 'Not enough points');
  const link = ctx.person.links.find((l) => l.applCde === 'DD');
  if (!link) throw new HttpError(400, 'Link a checking account first');
  const dollars = points / POINTS_PER_DOLLAR;
  const name = partner.name.toUpperCase();
  const transfer = await fis.transfer({
    fromAcct: catalog.rewardsPool, toAcct: link, tranAmt: dollars, memo: `PWP ${ctx.hhid}`,
    creditTranCde: 'MEMO', creditDesc: `PAY WITH POINTS ${name}`, debitDesc: `PAY WITH POINTS ${ctx.hhid} ${name}`,
  });
  const entry = store.addPoints(ctx.hhid, { type: 'pay-with-points', points: -points, desc: `Paid with points at ${partner.name}`, ref: transfer.tranRefNbr });
  store.save();
  return { entry, transfer, partner: partner.name, dollars, account: mask(link.acctNbr), balance: store.state.points[ctx.hhid].balance };
}
