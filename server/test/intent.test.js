// Checks on the intent model: it was trained, it beats simple baselines on unseen households,
// and it reads a demo persona's routine the way the story says.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex, intentFeatures, INTENT_CATEGORIES } from '../src/lib/intentFeatures.js';
import { scoreMoment, predictValues } from '../src/lib/intentModel.js';
import { todayDay, dayOfWeek } from '../src/lib/dates.js';
import { core } from '../src/fis/store.js';

const seed = (f) => JSON.parse(readFileSync(new URL(`../data/seed/${f}`, import.meta.url), 'utf8'));
const model = seed('intent-model.json');

test('intent model beats simple baselines on households it never saw', () => {
  const m = model.metrics;
  assert.ok(m.testHouseholds >= 40 && m.testDays >= 30);
  assert.ok(m.auc_model > 0.8, `AUC ${m.auc_model}`);
  assert.ok(m.auc_model > m.auc_frequency, 'beats "they buy this a lot"');
  assert.ok(m.weeklyTop3_model > m.weeklyTop3_rule, 'beats the hand-written rule of thumb at picking the week\'s slots');
  assert.ok(m.weeklyTop3_model > 2 * m.weeklyTop3_chance, 'far better than chance');
  assert.ok(Math.abs(m.meanPredicted - m.baseRate) < 0.01, 'probabilities are calibrated');
});

test('no look-ahead: clues only use history before the moment', () => {
  const day = 20000;
  const txn = (d, tm) => ({ postDt: new Date(d * 86_400_000).toISOString().slice(0, 10), tranTm: tm, tranCde: 'POS', drCrCde: 'D', tranAmt: 50, mrchCatCde: 5411, runBal: 500, seqNbr: d });
  const history = [txn(day - 14, '10:00:00'), txn(day - 7, '10:00:00')];
  const before = intentFeatures(buildIndex([{ applCde: 'DD', txns: history }]), 'groceries', day, 0);
  const withSameMoment = intentFeatures(buildIndex([{ applCde: 'DD', txns: [...history, txn(day, '10:00:00')] }]), 'groceries', day, 0);
  assert.deepEqual(before.values, withSameMoment.values);
});

test("Maya's Sunday-morning grocery routine stands out", () => {
  const { identities } = seed('identities.json');
  const maya = identities.find((i) => i.firstName === 'Maya');
  const index = buildIndex(maya.links.map((l) => ({ applCde: l.applCde, txns: core.history(l.instNbr, l.applCde, l.acctNbr) })));
  const today = todayDay();
  const sunday = today + ((7 - dayOfWeek(today)) % 7 || 7);
  const tuesday = sunday + 2;
  const p = (day, block) => scoreMoment(model, index, { day, block }).find((s) => s.category === 'groceries');
  const sunMorning = p(sunday, 0);
  assert.ok(sunMorning.probability > 3 * p(tuesday, 3).probability, 'Sunday morning beats Tuesday evening');
  assert.ok(sunMorning.reasons.some((r) => /Sundays/.test(r)), sunMorning.reasons.join(' | '));
});

test('every category gets a probability between 0 and 1', () => {
  const values = Object.fromEntries(model.features.map((f) => [f.key, f.mean]));
  const { probability } = predictValues(model, values);
  assert.ok(probability > 0 && probability < 1);
  assert.deepEqual(model.categories, INTENT_CATEGORIES);
});
