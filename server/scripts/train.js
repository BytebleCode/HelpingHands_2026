// Trains the income model on synthetic households built by the same generator as the demo personas.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeRandom, generateHousehold, randomProfile } from './generator.js';
import { summarize } from '../src/lib/features.js';
import { fitRidge, predictLog, tierForPercentile, percentileOf } from '../src/lib/incomeModel.js';
import { toDay } from '../src/lib/dates.js';

const N = Number(process.env.TRAIN_N || 2000);
const END_DAY = toDay('2026-06-30'); // features are date-agnostic, any anchor works
const out = fileURLToPath(new URL('../data/seed/income-model.json', import.meta.url));

const rnd = makeRandom(20261023);
const rows = [];
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const profile = randomProfile(rnd);
  const accounts = generateHousehold(profile, { seed: 1000 + i, endDay: END_DAY, days: 120 });
  rows.push({ income: profile.income, features: summarize(accounts, { endDay: END_DAY, windowDays: 90 }).features });
}

const split = Math.floor(N * 0.8);
const train = rows.slice(0, split);
const test = rows.slice(split);
const model = fitRidge(train, 200);

const yTest = test.map((r) => Math.log(r.income));
const pTest = test.map((r) => predictLog(model, r.features).logIncome);
const yMean = yTest.reduce((a, b) => a + b, 0) / yTest.length;
const ssRes = yTest.reduce((a, y, i) => a + (y - pTest[i]) ** 2, 0);
const ssTot = yTest.reduce((a, y) => a + (y - yMean) ** 2, 0);
const r2 = 1 - ssRes / ssTot;
const mape = test.reduce((a, r, i) => a + Math.abs(Math.exp(pTest[i]) - r.income) / r.income, 0) / test.length;

// Reference distribution of predictions \u2192 percentile ranking.
const allPred = rows.map((r) => predictLog(model, r.features).logIncome).sort((a, b) => a - b);
model.populationQuantiles = Array.from({ length: 101 }, (_, q) => allPred[Math.min(allPred.length - 1, Math.round((q / 100) * (allPred.length - 1)))]);

// Tier agreement on holdout: predicted tier vs tier from true income percentile.
const trueSorted = rows.map((r) => r.income).sort((a, b) => a - b);
const truePct = (inc) => (trueSorted.findIndex((x) => x >= inc) / trueSorted.length) * 100;
let exact = 0, within1 = 0;
const tierIdx = (pct) => ['cornerstone', 'foundation', 'keystone', 'pillar', 'summit'].indexOf(tierForPercentile(pct).key);
test.forEach((r, i) => {
  const a = tierIdx(truePct(r.income));
  const b = tierIdx(percentileOf(model, pTest[i]));
  if (a === b) exact++;
  if (Math.abs(a - b) <= 1) within1++;
});

model.metrics = {
  n: N, trainN: train.length, testN: test.length,
  r2: Math.round(r2 * 1000) / 1000,
  mape: Math.round(mape * 1000) / 1000,
  tierExact: Math.round((exact / test.length) * 1000) / 1000,
  tierWithinOne: Math.round((within1 / test.length) * 1000) / 1000,
  trainedAt: new Date().toISOString(),
};
writeFileSync(out, JSON.stringify(model, null, 2));

console.log(`Income model trained on ${N} synthetic households in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`  holdout R\u00b2 (log income): ${model.metrics.r2}   MAPE: ${(model.metrics.mape * 100).toFixed(1)}%`);
console.log(`  benefit tier exact: ${(model.metrics.tierExact * 100).toFixed(1)}%   within one tier: ${(model.metrics.tierWithinOne * 100).toFixed(1)}%`);
console.log('  weights (standardized):');
for (const f of [...model.features].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))) {
  console.log(`    ${f.key.padEnd(20)} ${f.weight >= 0 ? '+' : ''}${f.weight.toFixed(3)}`);
}
