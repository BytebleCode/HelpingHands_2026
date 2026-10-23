// Read-only checks on the static DB, the income model, the needs filter and the fake FIS API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import { INSTITUTIONS, aba } from '../scripts/catalog-data.js';
import { summarize } from '../src/lib/features.js';
import { estimate } from '../src/lib/incomeModel.js';
import { isOfferable } from '../src/lib/mcc.js';
import { todayDay } from '../src/lib/dates.js';
import fisRouter, { FIS_API_KEY } from '../src/fis/router.js';
import { core } from '../src/fis/store.js';

const seed = (f) => JSON.parse(readFileSync(new URL(`../data/seed/${f}`, import.meta.url), 'utf8'));

test('routing numbers carry valid ABA check digits', () => {
  for (const i of INSTITUTIONS) assert.equal(aba(i.rtnNbr.slice(0, 8)), i.rtnNbr, i.instNme);
});

test('income model ranks personas from lowest to highest income and maps tiers', () => {
  const { identities } = seed('identities.json');
  const model = seed('income-model.json');
  const pct = {};
  for (const id of identities) {
    const accounts = id.links.map((l) => ({ ...core.account(l.instNbr, l.applCde, l.acctNbr), txns: core.history(l.instNbr, l.applCde, l.acctNbr) }));
    const e = estimate(model, summarize(accounts, { endDay: todayDay() }));
    pct[id.firstName] = e;
  }
  assert.ok(pct.Maya.percentile < pct.Daniel.percentile && pct.Grace.percentile < pct.Daniel.percentile);
  assert.ok(pct.Daniel.percentile < pct.James.percentile && pct.James.percentile < pct.Priya.percentile);
  assert.equal(pct.Maya.tier.name, 'Cornerstone');
  assert.equal(pct.Priya.tier.name, 'Summit');
  assert.ok(pct.Maya.tier.multiplier > pct.Priya.tier.multiplier, 'lower income earns a larger multiplier');
  assert.ok(model.metrics.r2 > 0.8 && model.metrics.tierWithinOne > 0.9);
});

test('offers for wants are never offerable', () => {
  const { offers, partners } = seed('catalog.json');
  const cat = (o) => partners.find((p) => p.id === o.partnerId).category;
  const withheld = offers.filter((o) => !isOfferable(cat(o))).map(cat);
  assert.deepEqual(new Set(withheld), new Set(['dining', 'luxury', 'entertainment', 'travel', 'bars']));
  assert.ok(offers.filter((o) => isOfferable(cat(o))).length >= 12);
});

test('charities are real Jacksonville nonprofits and the community covers every neighborhood', () => {
  const { market, charities } = seed('catalog.json');
  const { community } = seed('identities.json');
  assert.equal(market.id, 'jacksonville-fl');
  assert.ok(charities.length >= 12);
  for (const c of charities) {
    assert.match(c.ein, /^\d{2}-\d{7}$/, c.name);
    assert.match(c.website, /^https:\/\//, c.name);
    assert.ok(c.legalName && c.settlement.simulated, c.name);
  }
  const areas = new Set(community.map((m) => m.area));
  assert.deepEqual(areas, new Set(Object.keys(market.neighborhoods)));
  assert.equal(core.simulated, community.length, 'core expands every community household at load');
});

test('fake FIS API enforces headers, paginates and verifies ownership', async (t) => {
  const app = express().use('/fis/v1', fisRouter);
  const server = app.listen(0);
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/fis/v1`;
  const headers = { 'x-api-key': FIS_API_KEY, 'organization-id': 'TEST', 'content-type': 'application/json' };

  const denied = await fetch(`${base}/institutions`);
  assert.equal(denied.status, 401);
  assert.equal((await denied.json()).status.statusCode, 'E401');

  const page = await (await fetch(`${base}/accounts/0101/DD/1010042187/transactions?pageSize=25`, { headers })).json();
  assert.equal(page.status.statusCode, '00');
  assert.equal(page.data.transactions.length, 25);
  assert.equal(page.pagination.moreDataInd, 'Y');
  assert.ok(page.data.transactions.every((x) => x.tranCde && x.postDt && ['C', 'D'].includes(x.drCrCde)));

  const ok = await fetch(`${base}/accounts/verify`, { method: 'POST', headers, body: JSON.stringify({ instNbr: '0315', acctNbr: '3150077310', taxIdLast4: '4417', zipCde: '32211' }) });
  assert.equal((await ok.json()).data.verifiedInd, 'Y');
  const bad = await fetch(`${base}/accounts/verify`, { method: 'POST', headers, body: JSON.stringify({ instNbr: '0315', acctNbr: '3150077310', taxIdLast4: '0000', zipCde: '32211' }) });
  assert.equal(bad.status, 422);
});
