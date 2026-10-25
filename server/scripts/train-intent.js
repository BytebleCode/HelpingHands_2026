// Trains the intent model on synthetic households built by the same generator as the demo personas,
// then tests it honestly: on households it never saw, over the last 30 days it never saw.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeRandom, generateHousehold, randomProfile } from './generator.js';
import { buildIndex, intentFeatures, momentContext, INTENT_CATEGORIES, BLOCKS } from '../src/lib/intentFeatures.js';
import { fitLogistic, predictValues } from '../src/lib/intentModel.js';
import { toDay } from '../src/lib/dates.js';

const N = Number(process.env.TRAIN_N || 400);
const END_DAY = toDay('2026-06-30'); // fixed anchor so training is deterministic
const HISTORY_DAYS = 150; // 60 days of history before the first snapshot
const TRAIN_DAYS = 60; // snapshots used for training
const TEST_DAYS = 30; // later snapshots used for testing
const TEST_SHARE = 0.2; // households held out entirely
const out = fileURLToPath(new URL('../data/seed/intent-model.json', import.meta.url));

const rnd = makeRandom(20261024);
const t0 = Date.now();
const firstSnap = END_DAY - TRAIN_DAYS - TEST_DAYS + 1;
const testFrom = END_DAY - TEST_DAYS + 1;
const train = [];
const test = [];
const splitAt = Math.floor(N * (1 - TEST_SHARE));

// Build one row per household x day x time block x category. The label is 1 if they actually bought in
// that category during that block. Training households only contribute their first 60 days; test
// households only their last 30, so the test is on unseen people over an unseen period.
for (let i = 0; i < N; i++) {
  const profile = randomProfile(rnd);
  const accounts = generateHousehold(profile, { seed: 30000 + i, endDay: END_DAY, days: HISTORY_DAYS });
  const index = buildIndex(accounts);
  const heldOut = i >= splitAt;
  // Which (day, block) slots actually had a purchase, per category.
  const actual = Object.fromEntries(INTENT_CATEGORIES.map((c) => [c, new Set(index.purchases[c].map((e) => e.t))]));
  for (let day = heldOut ? testFrom : firstSnap; day <= (heldOut ? END_DAY : testFrom - 1); day++) {
    const shared = momentContext(index, day);
    for (let block = 0; block < BLOCKS.length; block++) {
      for (const category of INTENT_CATEGORIES) {
        const { values } = intentFeatures(index, category, day, block, shared);
        const row = { values, label: actual[category].has(day * 4 + block) ? 1 : 0, hh: i, category, day, block };
        (heldOut ? test : train).push(row);
      }
    }
  }
}
const tBuild = Date.now();
const model = fitLogistic(train, { lambda: 1 });

// ---------------------------------------------------------------- evaluation (held-out households, last 30 days)
function auc(scored) {
  const s = [...scored].sort((a, b) => a.score - b.score);
  let rank = 0, posRanks = 0, pos = 0;
  for (let i = 0; i < s.length;) {
    let j = i;
    while (j < s.length && s[j].score === s[i].score) j++;
    const avg = (i + j + 1) / 2; // average rank for ties
    for (let k = i; k < j; k++) if (s[k].label) { posRanks += avg; pos++; }
    rank = j;
    i = j;
  }
  const neg = s.length - pos;
  return (posRanks - (pos * (pos + 1)) / 2) / (pos * neg);
}

// Three ways to score a moment, compared on the same held-out rows. If the model can't beat a simple
// rule of thumb, it isn't earning its place.
const scorers = {
  model: (r) => predictValues(model, r.values).probability,
  // Rule of thumb: "how often + usual day + usual time", equal weights, no learning.
  rule: (r) => r.values.logRate + r.values.dowLift + r.values.blockLift,
  // Frequency only: "they buy this a lot".
  frequency: (r) => r.values.logRate,
};
const metrics = { n: N, trainRows: train.length, testRows: test.length, testHouseholds: N - splitAt, testDays: TEST_DAYS };
for (const [name, f] of Object.entries(scorers)) {
  const scored = test.map((r) => ({ score: f(r), label: r.label, r }));
  metrics[`auc_${name}`] = Math.round(auc(scored) * 1000) / 1000;
  // Of all real purchases, what share fall in the top 10% of moments this scorer flags?
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const cut = Math.floor(sorted.length * 0.1);
  const positives = scored.filter((x) => x.label).length;
  metrics[`capture10_${name}`] = Math.round((sorted.slice(0, cut).filter((x) => x.label).length / positives) * 1000) / 1000;
  // Weekly pick: for each household, category and week with a purchase, do the scorer's top 3 time slots
  // (out of 28) include a real purchase?
  const groups = new Map();
  for (const x of scored) {
    const key = `${x.r.hh}|${x.r.category}|${Math.floor((x.r.day - testFrom) / 7)}`;
    (groups.get(key) || groups.set(key, []).get(key)).push(x);
  }
  let weeks = 0, hits = 0, chance = 0;
  for (const g of groups.values()) {
    if (g.length < 28) continue;
    const m = g.filter((x) => x.label).length;
    if (!m) continue;
    weeks++;
    // Expected hit with ties broken at random (a scorer that can't tell slots apart scores like chance).
    const sorted = [...g].sort((a, b) => b.score - a.score);
    const s3 = sorted[2].score;
    const above = sorted.filter((x) => x.score > s3);
    const tied = sorted.filter((x) => x.score === s3);
    const k = 3 - above.length;
    const tiedNeg = tied.filter((x) => !x.label).length;
    let missAll = above.some((x) => x.label) ? 0 : 1;
    for (let j = 0; j < k && missAll; j++) missAll *= Math.max(0, tiedNeg - j) / (tied.length - j);
    hits += 1 - missAll;
    chance += 1 - ((28 - m) * (27 - m) * (26 - m)) / (28 * 27 * 26);
  }
  metrics[`weeklyTop3_${name}`] = Math.round((hits / weeks) * 1000) / 1000;
  metrics.weeklyTop3_chance = Math.round((chance / weeks) * 1000) / 1000;
}
const testPos = test.filter((r) => r.label).length;
metrics.baseRate = Math.round((testPos / test.length) * 10000) / 10000;
metrics.meanPredicted = Math.round((test.reduce((a, r) => a + scorers.model(r), 0) / test.length) * 10000) / 10000;
metrics.trainedAt = new Date().toISOString();
model.metrics = metrics;
writeFileSync(out, JSON.stringify(model, null, 2));

const pct = (x) => `${(x * 100).toFixed(1)}%`;
console.log(`Intent model trained on ${N - (N - splitAt)} synthetic households (${train.length.toLocaleString()} moments) in ${((Date.now() - t0) / 1000).toFixed(1)}s (features ${((tBuild - t0) / 1000).toFixed(1)}s)`);
console.log(`  tested on ${N - splitAt} unseen households over their last ${TEST_DAYS} days (${test.length.toLocaleString()} moments, ${testPos} real purchases)`);
console.log('                         model    rule of thumb   frequency only');
console.log(`  AUC                    ${metrics.auc_model.toFixed(3)}    ${metrics.auc_rule.toFixed(3)}           ${metrics.auc_frequency.toFixed(3)}`);
console.log(`  top 10% catches        ${pct(metrics.capture10_model).padEnd(8)} ${pct(metrics.capture10_rule).padEnd(15)} ${pct(metrics.capture10_frequency)}`);
console.log(`  weekly top-3 slot hit  ${pct(metrics.weeklyTop3_model).padEnd(8)} ${pct(metrics.weeklyTop3_rule).padEnd(15)} ${pct(metrics.weeklyTop3_frequency)}   (chance: ${pct(metrics.weeklyTop3_chance)})`);
console.log(`  calibration: predicted ${pct(metrics.meanPredicted)} vs actual ${pct(metrics.baseRate)} purchase rate per moment`);
console.log('  weights (standardized):');
for (const f of [...model.features].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))) {
  console.log(`    ${f.key.padEnd(16)} ${f.weight >= 0 ? '+' : ''}${f.weight.toFixed(3)}`);
}
