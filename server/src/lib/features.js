// Turns FIS-format account histories into spending summaries and income-model features.
// Used both by scripts/train.js (synthetic households) and at runtime (linked accounts).
import { categoryOf, CATEGORIES, DISCRETIONARY, TRAVEL_LUXURY } from './mcc.js';
import { toDay } from './dates.js';

export const GOVERNMENT_ORIGINATORS = ['SSA TREAS 310', 'STATE REEMPLOY BENEFIT', 'STATE FAMILY ASSIST'];
const INCOME_CODES = new Set(['ACHC', 'DEP']);
const SPEND_CODES = new Set(['POS', 'ACHD', 'CCP']);

export const FEATURES = [
  { key: 'logInflow', label: 'Monthly deposits', fmt: 'money', raw: 'monthlyInflow' },
  { key: 'logSpend', label: 'Monthly spending', fmt: 'money', raw: 'monthlySpend' },
  { key: 'essentialShare', label: 'Share of spending on essentials', fmt: 'pct' },
  { key: 'discretionaryShare', label: 'Share of spending on discretionary items', fmt: 'pct' },
  { key: 'logTicket', label: 'Average purchase size', fmt: 'money', raw: 'avgTicket' },
  { key: 'incomeVolatility', label: 'Variability of deposits', fmt: 'ratio' },
  { key: 'benefitDeposits', label: 'Government benefit deposits', fmt: 'bool' },
  { key: 'feeRate', label: 'Overdraft fees per month', fmt: 'num' },
  { key: 'logAvgBalance', label: 'Average combined balance', fmt: 'money', raw: 'avgBalance' },
  { key: 'logAltFinance', label: 'Check cashing & pawn spending', fmt: 'money', raw: 'monthlyAltFinance' },
  { key: 'travelLuxuryShare', label: 'Share on travel & luxury', fmt: 'pct' },
  { key: 'cashShare', label: 'Share withdrawn as cash', fmt: 'pct' },
];

function avgDailyBalance(acct, start, end) {
  const txns = acct.txns.filter((t) => toDay(t.postDt) <= end).sort((a, b) => a.postDt.localeCompare(b.postDt) || a.seqNbr - b.seqNbr);
  if (!txns.length) return acct.curBal ?? 0;
  let i = 0;
  const first = txns.find((t) => toDay(t.postDt) >= start) || txns[txns.length - 1];
  let bal = first.runBal - (first.drCrCde === 'C' ? first.tranAmt : -first.tranAmt);
  // Use the last balance before the window when it exists.
  while (i < txns.length && toDay(txns[i].postDt) < start) bal = txns[i++].runBal;
  let sum = 0;
  for (let d = start; d <= end; d++) {
    while (i < txns.length && toDay(txns[i].postDt) <= d) bal = txns[i++].runBal;
    sum += bal;
  }
  return sum / (end - start + 1);
}

/** accounts: [{ applCde, curBal, txns: FIS transactions }] */
export function summarize(accounts, { endDay, windowDays = 90 }) {
  const start = endDay - windowDays + 1;
  const months = windowDays / 30.4;
  const byCategory = {};
  const deposits = [];
  let inflow = 0, spend = 0, cash = 0, fees = 0, posCount = 0, posTotal = 0, benefit = false;
  let need = 0, disc = 0, travelLux = 0, alt = 0;

  for (const acct of accounts) {
    for (const t of acct.txns) {
      const d = toDay(t.postDt);
      if (d < start || d > endDay) continue;
      if (t.drCrCde === 'C') {
        if (INCOME_CODES.has(t.tranCde)) {
          inflow += t.tranAmt;
          deposits.push(t.tranAmt);
          if (t.achCoNme && GOVERNMENT_ORIGINATORS.includes(t.achCoNme)) benefit = true;
        }
        continue;
      }
      if (t.tranCde === 'FEE') { fees++; continue; }
      if (t.tranCde === 'ATMW') { cash += t.tranAmt; continue; }
      if (!SPEND_CODES.has(t.tranCde)) continue;
      const cat = categoryOf(t);
      const c = (byCategory[cat] ||= { category: cat, total: 0, count: 0, lastDt: null, merchants: {} });
      c.total += t.tranAmt;
      c.count++;
      if (!c.lastDt || t.postDt > c.lastDt) c.lastDt = t.postDt;
      if (t.mrchNme) c.merchants[t.mrchNme] = (c.merchants[t.mrchNme] || 0) + t.tranAmt;
      spend += t.tranAmt;
      if (CATEGORIES[cat]?.group === 'need') need += t.tranAmt;
      if (DISCRETIONARY.has(cat)) disc += t.tranAmt;
      if (TRAVEL_LUXURY.has(cat)) travelLux += t.tranAmt;
      if (cat === 'altfinance') alt += t.tranAmt;
      if (t.tranCde === 'POS') { posCount++; posTotal += t.tranAmt; }
    }
  }

  const mean = deposits.reduce((a, b) => a + b, 0) / (deposits.length || 1);
  const sd = Math.sqrt(deposits.reduce((a, b) => a + (b - mean) ** 2, 0) / (deposits.length || 1));
  const avgBalance = accounts.reduce((a, acct) => a + avgDailyBalance(acct, start, endDay), 0);

  const raw = {
    monthlyInflow: inflow / months,
    monthlySpend: spend / months,
    avgTicket: posCount ? posTotal / posCount : 0,
    avgBalance,
    monthlyAltFinance: alt / months,
  };
  const features = {
    logInflow: Math.log1p(raw.monthlyInflow),
    logSpend: Math.log1p(raw.monthlySpend),
    essentialShare: spend ? need / spend : 0,
    discretionaryShare: spend ? disc / spend : 0,
    logTicket: Math.log1p(raw.avgTicket),
    incomeVolatility: mean ? sd / mean : 0,
    benefitDeposits: benefit ? 1 : 0,
    feeRate: fees / months,
    logAvgBalance: Math.sign(avgBalance) * Math.log1p(Math.abs(avgBalance)),
    logAltFinance: Math.log1p(raw.monthlyAltFinance),
    travelLuxuryShare: spend ? travelLux / spend : 0,
    cashShare: spend + cash ? cash / (spend + cash) : 0,
  };
  for (const c of Object.values(byCategory)) {
    c.share = spend ? c.total / spend : 0;
    c.topMerchant = Object.entries(c.merchants).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    delete c.merchants;
  }
  return { windowDays, start, endDay, features, raw, byCategory, totals: { inflow, spend, need, discretionary: disc, cash, fees } };
}
