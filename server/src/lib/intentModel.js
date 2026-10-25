// Intent model: logistic regression that estimates the chance a household buys in an everyday-needs
// category during a given time block, from the clues in intentFeatures.js. Training lives in
// scripts/train-intent.js; this module fits, predicts and explains. Location is not a training input:
// it is applied live by the nudge engine and never stored.
import { INTENT_FEATURES, INTENT_CATEGORIES, BLOCKS, intentFeatures, momentContext } from './intentFeatures.js';
import { CATEGORIES } from './mcc.js';

const KEYS = INTENT_FEATURES.map((f) => f.key);
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

// Solve A x = b with Gaussian elimination and partial pivoting.
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

/**
 * rows: [{ values, label }] → fitted model. L2-regularized logistic regression on standardized features,
 * fit with Newton's method (iteratively reweighted least squares).
 */
export function fitLogistic(rows, { lambda = 1, iterations = 25 } = {}) {
  const n = rows.length;
  const d = KEYS.length;
  const mean = KEYS.map((k) => rows.reduce((a, r) => a + r.values[k], 0) / n);
  const std = KEYS.map((k, j) => Math.sqrt(rows.reduce((a, r) => a + (r.values[k] - mean[j]) ** 2, 0) / n) || 1);
  const Z = rows.map((r) => [1, ...KEYS.map((k, j) => (r.values[k] - mean[j]) / std[j])]);
  const y = rows.map((r) => r.label);
  const p = d + 1;
  let w = new Array(p).fill(0);
  const base = y.reduce((a, b) => a + b, 0) / n;
  w[0] = Math.log(base / (1 - base));

  // Newton's method: each step solves (H + lambda*I) step = gradient, where H weighs each row by
  // mu*(1-mu). Converges in a handful of iterations for a model this size.
  for (let it = 0; it < iterations; it++) {
    const H = Array.from({ length: p }, () => new Array(p).fill(0));
    const g = new Array(p).fill(0);
    for (let i = 0; i < n; i++) {
      const zi = Z[i];
      let s = 0;
      for (let a = 0; a < p; a++) s += w[a] * zi[a];
      const mu = sigmoid(s);
      const wt = Math.max(mu * (1 - mu), 1e-9);
      const r = y[i] - mu;
      for (let a = 0; a < p; a++) {
        g[a] += zi[a] * r;
        const za = zi[a] * wt;
        for (let b = a; b < p; b++) H[a][b] += za * zi[b];
      }
    }
    for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) H[a][b] = H[b][a];
    for (let a = 1; a < p; a++) { H[a][a] += lambda; g[a] -= lambda * w[a]; } // intercept is not penalized
    const step = solve(H, g);
    w = w.map((v, a) => v + step[a]);
    if (Math.max(...step.map(Math.abs)) < 1e-6) break;
  }
  return {
    type: 'logistic-intent',
    lambda,
    intercept: w[0],
    categories: INTENT_CATEGORIES,
    blocks: BLOCKS,
    features: KEYS.map((key, j) => ({ key, mean: mean[j], std: std[j], weight: w[j + 1] })),
  };
}

/**
 * Probability for one row of clues, plus each clue's contribution to the log-odds (used for "Why?").
 * Missing clues fall back to the training mean, so they contribute nothing.
 */
export function predictValues(model, values) {
  let z = model.intercept;
  const contributions = model.features.map((f) => {
    const c = f.weight * (((values[f.key] ?? f.mean) - f.mean) / f.std);
    z += c;
    return { key: f.key, contribution: c };
  });
  return { probability: sigmoid(z), logit: z, contributions };
}

// How each category reads in a sentence.
const VERB = {
  groceries: 'shop for groceries', fuel: 'fill up', pharmacy: 'stop at the pharmacy',
  household: 'pick up home essentials', transit: 'ride transit',
};

// Plain-English reason for a clue, or null when there is nothing worth saying.
function describe(key, raw, direction) {
  const verb = VERB[raw.category] || `buy ${CATEGORIES[raw.category].label.toLowerCase()}`;
  const label = CATEGORIES[raw.category].label;
  const days = (n) => `${Math.round(n)} day${Math.round(n) === 1 ? '' : 's'}`;
  const dowShare = raw.trips ? raw.dowCount / raw.trips : 0;
  const blockShare = raw.purchases ? raw.blockCount / raw.purchases : 0;
  const paid = raw.daysSincePay === 0 ? 'today' : raw.daysSincePay === 1 ? 'yesterday' : `${raw.daysSincePay} days ago`;
  switch (key) {
    case 'dowLift':
      if (direction === 'down') return raw.trips >= 4 && dowShare < 0.08 ? `You rarely ${verb} on ${raw.weekday}s` : null;
      return dowShare >= 0.35 ? `You usually ${verb} on ${raw.weekday}s` : dowShare >= 0.2 ? `You often ${verb} on ${raw.weekday}s` : null;
    case 'blockLift':
      if (direction === 'down') return raw.purchases >= 4 && blockShare < 0.08 ? `You rarely ${verb} in the ${raw.blockLabel}` : null;
      return blockShare >= 0.4 ? `The ${raw.blockLabel} is when you usually ${verb}` : null;
    case 'logRate':
      return direction === 'up' && raw.perWeek >= 0.5 ? `You ${verb} about ${raw.perWeek.toFixed(1)} times a week` : null;
    case 'tooSoon':
      return direction === 'down' ? `You already ${verb === 'fill up' ? 'filled up' : `went (${label.toLowerCase()})`} ${raw.since === 0 ? 'today' : `${days(raw.since)} ago`}` : null;
    case 'dueClose':
    case 'dueRoutine':
      return direction === 'up' && raw.ratio >= 0.85 && raw.ratio <= 1.4 ? `Due: last time was ${days(raw.since)} ago, and you usually go every ${days(raw.usualGap)}` : null;
    case 'payWindow':
    case 'payGrocery':
      return direction === 'up' ? `Payday was ${paid}, when you usually stock up` : null;
    case 'logRunway':
      return `About ${days(raw.runwayDays)} of money left at your usual pace`;
    case 'velocity':
      return raw.spend7 > (raw.spend30 * 7) / 30 ? 'Spending is running ahead of your usual pace this week' : 'Spending is lighter than usual this week';
    default:
      return null;
  }
}

/** Probability plus the top drivers in plain English, in the same shape as the income model's drivers. */
export function explain(model, values, raw, { top = 3 } = {}) {
  const { probability, contributions } = predictValues(model, values);
  const meta = Object.fromEntries(INTENT_FEATURES.map((f) => [f.key, f]));
  const drivers = contributions
    .filter((c) => !meta[c.key].hidden && Math.abs(c.contribution) > 0.05)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .map((c) => {
      const direction = c.contribution > 0 ? 'up' : 'down';
      return { key: c.key, label: meta[c.key].label, direction, weight: Math.abs(c.contribution), text: describe(c.key, raw, direction) };
    })
    .filter((dv) => dv.text)
    .slice(0, top);
  return { probability, drivers };
}

/**
 * Scores every intent category for one moment. Returns categories sorted by probability, each with
 * its plain-English reasons. `index` comes from buildIndex / indexFromContext.
 */
export function scoreMoment(model, index, { day, block }) {
  const shared = momentContext(index, day);
  return model.categories
    .map((category) => {
      const { values, raw } = intentFeatures(index, category, day, block, shared);
      const { probability, drivers } = explain(model, values, raw);
      return { category, label: CATEGORIES[category].label, probability, reasons: drivers.filter((dv) => dv.direction === 'up').map((dv) => dv.text), drivers };
    })
    .sort((a, b) => b.probability - a.probability);
}
