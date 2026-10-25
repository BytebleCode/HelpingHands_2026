// Fake FIS core data store. The static DB is read-only; live postings (memo posts, transfers)
// go to a runtime overlay so `npm run reset` returns the core to its seeded state.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { toDay, fromDay, todayDay } from '../lib/dates.js';
import { generateHousehold } from '../../scripts/generator.js';

const SEED = fileURLToPath(new URL('../../data/seed/fis-core.json', import.meta.url));
const RUNTIME_DIR = fileURLToPath(new URL('../../data/runtime/', import.meta.url));
const OVERLAY = `${RUNTIME_DIR}fis-ledger.json`;

export const keyOf = (instNbr, applCde, acctNbr) => `${instNbr}-${applCde}-${acctNbr}`;
const round2 = (x) => Math.round(x * 100) / 100;
const nowTime = () => new Date().toTimeString().slice(0, 8); // local HH:MM:SS for live postings

class CoreStore {
  constructor() {
    this.load();
  }

  load() {
    const core = JSON.parse(readFileSync(SEED, 'utf8'));
    // Slide every seeded date forward so the newest data is "today". The slide is rounded up to whole
    // weeks so weekday routines (a Sunday grocery run) stay on the same weekday. Anything that lands
    // after today is dropped and the account balance is rolled back to match.
    const today = todayDay();
    const shift = Math.max(0, Math.ceil((today - toDay(core.meta.asOfDt)) / 7) * 7);
    const move = (iso) => (iso ? fromDay(toDay(iso) + shift) : iso);
    this.meta = { ...core.meta, asOfDt: fromDay(Math.min(today, toDay(core.meta.asOfDt) + shift)), dateShiftDays: shift };
    this.institutions = core.institutions;
    this.customers = core.customers;
    this.accounts = new Map(core.accounts.map((a) => [keyOf(a.instNbr, a.applCde, a.acctNbr), { ...a, openDt: move(a.openDt) }]));
    this.transactions = new Map();
    for (const [k, txns] of Object.entries(core.transactions)) {
      const moved = txns.map((t) => ({ ...t, postDt: move(t.postDt), effDt: move(t.effDt) }));
      const kept = moved.filter((t) => toDay(t.postDt) <= today);
      const acct = this.accounts.get(k);
      if (acct && kept.length < moved.length) {
        const dropped = moved.filter((t) => toDay(t.postDt) > today);
        acct.curBal = round2(acct.curBal - dropped.reduce((sum, t) => sum + (t.drCrCde === 'C' ? t.tranAmt : -t.tranAmt), 0));
        acct.availBal = round2(Math.max(0, acct.curBal));
      }
      this.transactions.set(k, kept);
    }
    this.expandSimulation(core.simulation);
    this.overlay = existsSync(OVERLAY) ? JSON.parse(readFileSync(OVERLAY, 'utf8')) : { postings: [], transfers: [] };
    for (const p of this.overlay.postings) this.applyPosting(p, false);
  }

  // Community households are stored as generation recipes; materialize their history ending today.
  expandSimulation(sim) {
    this.simulated = 0;
    if (!sim) return;
    const endDay = todayDay();
    for (const h of sim.households) {
      const routing = { accounts: h.accounts.map((a) => ({ key: a.key, applCde: a.applCde })), primary: 'dd', savings: 'sv' };
      for (const g of generateHousehold({ ...h.profile, routing }, { seed: h.seed, endDay, days: sim.windowDays })) {
        const a = h.accounts.find((x) => x.key === g.key);
        const k = keyOf(h.instNbr, a.applCde, a.acctNbr);
        const acct = this.accounts.get(k);
        acct.curBal = g.curBal;
        acct.availBal = round2(Math.max(0, g.curBal));
        this.transactions.set(k, g.txns);
      }
      this.simulated++;
    }
  }

  persist() {
    mkdirSync(RUNTIME_DIR, { recursive: true });
    writeFileSync(OVERLAY, JSON.stringify(this.overlay));
  }

  reset() {
    this.overlay = { postings: [], transfers: [] };
    this.persist();
    this.load();
  }

  institution(instNbr) {
    return this.institutions.find((i) => i.instNbr === instNbr);
  }

  customer(instNbr, custNbr) {
    return this.customers.find((c) => c.instNbr === instNbr && c.custNbr === custNbr);
  }

  customerAccounts(instNbr, custNbr) {
    return [...this.accounts.values()].filter((a) => a.instNbr === instNbr && a.custNbr === custNbr);
  }

  account(instNbr, applCde, acctNbr) {
    return this.accounts.get(keyOf(instNbr, applCde, acctNbr));
  }

  findAccount(instNbr, acctNbr) {
    return [...this.accounts.values()].find((a) => a.instNbr === instNbr && a.acctNbr === acctNbr);
  }

  history(instNbr, applCde, acctNbr, { fromDt, toDt } = {}) {
    const all = this.transactions.get(keyOf(instNbr, applCde, acctNbr)) || [];
    return all
      .filter((t) => (!fromDt || t.postDt >= fromDt) && (!toDt || t.postDt <= toDt))
      .sort((a, b) => b.postDt.localeCompare(a.postDt) || b.seqNbr - a.seqNbr);
  }

  // Applies a single-account posting and returns the stored transaction.
  applyPosting(p, record = true) {
    const k = keyOf(p.instNbr, p.applCde, p.acctNbr);
    const acct = this.accounts.get(k);
    if (!acct) throw Object.assign(new Error('ACCOUNT NOT FOUND'), { code: 'E404' });
    const list = this.transactions.get(k) || [];
    const signed = p.txn.drCrCde === 'C' ? p.txn.tranAmt : -p.txn.tranAmt;
    acct.curBal = round2(acct.curBal + signed);
    acct.availBal = round2(Math.max(0, acct.curBal));
    const seqNbr = list.reduce((m, t) => Math.max(m, t.seqNbr), 0) + 1;
    const txn = { seqNbr, postDt: p.postDt, effDt: p.postDt, ...p.txn, runBal: acct.curBal, memoPostInd: 'Y', tranRefNbr: p.tranRefNbr };
    list.push(txn);
    this.transactions.set(k, list);
    if (record) {
      this.overlay.postings.push(p);
      this.persist();
    }
    return txn;
  }

  memoPost({ instNbr, applCde, acctNbr }, txn) {
    const tranRefNbr = `MP${Date.now().toString(36).toUpperCase()}${randomUUID().slice(0, 4).toUpperCase()}`;
    return this.applyPosting({ instNbr, applCde, acctNbr, postDt: fromDay(todayDay()), tranRefNbr, txn: { tranTm: nowTime(), ...txn } });
  }

  transfer({ fromAcct, toAcct, tranAmt, memo, creditTranCde = 'XFRI', creditDesc, debitDesc }) {
    const from = this.account(fromAcct.instNbr, fromAcct.applCde, fromAcct.acctNbr);
    const to = this.account(toAcct.instNbr, toAcct.applCde, toAcct.acctNbr);
    if (!from || !to) throw Object.assign(new Error('ACCOUNT NOT FOUND'), { code: 'E404' });
    if (!(tranAmt > 0)) throw Object.assign(new Error('INVALID AMOUNT'), { code: 'E400' });
    if (from.availBal < tranAmt) throw Object.assign(new Error('INSUFFICIENT AVAILABLE FUNDS'), { code: 'E422' });
    const tranRefNbr = `FT${fromDay(todayDay()).replaceAll('-', '')}${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
    const postDt = fromDay(todayDay());
    const toInst = this.institution(to.instNbr);
    const fromInst = this.institution(from.instNbr);
    const debit = this.applyPosting({
      ...fromAcct, postDt, tranRefNbr,
      txn: { tranTm: nowTime(), tranCde: 'XFRO', tranDesc: debitDesc || `TRANSFER TO ${toInst.shortNme.toUpperCase()} ${to.acctNbr.slice(-4)} ${memo || ''}`.trim(), drCrCde: 'D', tranAmt: round2(tranAmt) },
    });
    const credit = this.applyPosting({
      ...toAcct, postDt, tranRefNbr,
      txn: { tranTm: nowTime(), tranCde: creditTranCde, tranDesc: creditDesc || `TRANSFER FROM ${fromInst.shortNme.toUpperCase()} ${memo || ''}`.trim(), drCrCde: 'C', tranAmt: round2(tranAmt) },
    });
    const record = {
      tranRefNbr, postDt, tranAmt: round2(tranAmt), memo: memo || null, statusCde: 'POSTED',
      fromAcct: { ...fromAcct, rtnNbr: fromInst.rtnNbr }, toAcct: { ...toAcct, rtnNbr: toInst.rtnNbr },
      debitSeqNbr: debit.seqNbr, creditSeqNbr: credit.seqNbr, createdTs: new Date().toISOString(),
    };
    this.overlay.transfers.push(record);
    this.persist();
    return record;
  }
}

export const core = new CoreStore();
