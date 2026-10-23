// Basic, explainable income model: ridge regression on log(annual income) over standardized
// spending features. Training lives in scripts/train.js; this module fits, predicts and explains.
import { FEATURES } from './features.js';

export const TIERS = [
  { key: 'cornerstone', name: 'Cornerstone', maxPct: 20, multiplier: 3.0 },
  { key: 'foundation', name: 'Foundation', maxPct: 40, multiplier: 2.25 },
  { key: 'keystone', name: 'Keystone', maxPct: 60, multiplier: 1.6 },
  { key: 'pillar', name: 'Pillar', maxPct: 80, multiplier: 1.25 },
  { key: 'summit', name: 'Summit', maxPct: 101, multiplier: 1.0 },
];

export const tierForPercentile = (pct) => TIERS.find((t) => pct < t.maxPct) ?? TIERS[TIERS.length - 1];

const KEYS = FEATURES.map((f) => f.key);

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
 * rows: [{ features, income }] → fitted model (weights over standardized features).
 * Sign-constrained: a feature whose weight disagrees with its univariate correlation (an artifact of
 * collinearity) is dropped and the model refit, so every explanation reads in the intuitive direction.
 */
export function fitRidge(rows, lambda = 1.0) {
  const n = rows.length;
  const X = rows.map((r) => KEYS.map((k) => r.features[k]));
  const y = rows.map((r) => Math.log(r.income));
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  const mean = KEYS.map((_, j) => X.reduce((a, row) => a + row[j], 0) / n);
  const std = KEYS.map((_, j) => Math.sqrt(X.reduce((a, row) => a + (row[j] - mean[j]) ** 2, 0) / n) || 1);
  const Z = X.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));
  const expectedSign = KEYS.map((_, j) => Math.sign(Z.reduce((a, row, i) => a + row[j] * (y[i] - yMean), 0)));

  let active = KEYS.map((_, j) => j);
  let beta;
  for (let iter = 0; iter < KEYS.length; iter++) {
    const p = active.length + 1;
    const A = Array.from({ length: p }, () => new Array(p).fill(0));
    const b = new Array(p).fill(0);
    for (let i = 0; i < n; i++) {
      const zi = [1, ...active.map((j) => Z[i][j])];
      for (let a = 0; a < p; a++) {
        b[a] += zi[a] * y[i];
        for (let c = 0; c < p; c++) A[a][c] += zi[a] * zi[c];
      }
    }
    for (let a = 1; a < p; a++) A[a][a] += lambda; // intercept is not penalized
    beta = solve(A, b);
    const violators = active.filter((j, k) => Math.sign(beta[k + 1]) !== expectedSign[j] && Math.abs(beta[k + 1]) > 1e-9);
    if (!violators.length) break;
    active = active.filter((j) => !violators.includes(j));
  }
  const weightOf = (j) => { const k = active.indexOf(j); return k === -1 ? 0 : beta[k + 1]; };
  return {
    type: 'ridge-log-income',
    lambda,
    intercept: beta[0],
    features: KEYS.map((key, j) => ({ key, mean: mean[j], std: std[j], weight: weightOf(j) })),
  };
}

export function predictLog(model, features) {
  let y = model.intercept;
  const contributions = model.features.map((f) => {
    const z = ((features[f.key] ?? f.mean) - f.mean) / f.std;
    const c = f.weight * z;
    y += c;
    return { key: f.key, z, contribution: c };
  });
  return { logIncome: y, contributions };
}

// Percentile of a predicted log income within the reference population's predictions.
export function percentileOf(model, logIncome) {
  const q = model.populationQuantiles; // 101 sorted values (0th..100th percentile)
  if (logIncome <= q[0]) return 0;
  if (logIncome >= q[100]) return 100;
  let i = 0;
  while (q[i + 1] < logIncome) i++;
  return i + (logIncome - q[i]) / (q[i + 1] - q[i] || 1);
}

/** Full, user-facing estimate with tier and top drivers. */
export function estimate(model, summary) {
  const { logIncome, contributions } = predictLog(model, summary.features);
  const percentile = Math.round(percentileOf(model, logIncome) * 10) / 10;
  const tier = tierForPercentile(percentile);
  const meta = Object.fromEntries(FEATURES.map((f) => [f.key, f]));
  const drivers = contributions
    .filter((c) => Math.abs(c.contribution) > 0.01)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 4)
    .map((c) => {
      const f = meta[c.key];
      const value = f.raw ? summary.raw[f.raw] : summary.features[c.key];
      return { key: c.key, label: f.label, fmt: f.fmt, value, direction: c.contribution > 0 ? 'up' : 'down', weight: Math.abs(c.contribution) };
    });
  return {
    percentile,
    estimatedAnnualIncome: Math.round(Math.exp(logIncome) / 500) * 500,
    tier: { key: tier.key, name: tier.name, multiplier: tier.multiplier },
    drivers,
    model: { type: model.type, holdoutR2: model.metrics?.r2, trainedOn: model.metrics?.n },
  };
}
