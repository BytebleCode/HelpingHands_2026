// Loads everything known about a member: linked FIS accounts, their history, the spending summary
// and the income-model estimate. All analytics aggregate across every linked account.
import { fis } from './fisClient.js';
import { summarize } from './features.js';
import { estimate } from './incomeModel.js';
import { store, incomeModel } from './store.js';
import { todayDay, fromDay } from './dates.js';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

export const txnKey = (link, t) => `${link.instNbr}-${link.applCde}-${link.acctNbr}-${t.seqNbr}`;

export async function loadContext(hhid) {
  const person = store.person(hhid);
  if (!person) throw new HttpError(401, 'Unknown Helping Hands ID');
  const today = todayDay();
  const fromDt = fromDay(today - 179);
  const institutions = await fis.institutions();
  const accounts = await Promise.all(person.links.map(async (link) => {
    const [account, txns] = await Promise.all([fis.account(link), fis.transactions(link, { fromDt })]);
    return { link, account, institution: institutions.find((i) => i.instNbr === link.instNbr), txns };
  }));
  const summary = summarize(accounts.map((a) => ({ applCde: a.account.applCde, curBal: a.account.curBal, txns: a.txns })), { endDay: today, windowDays: 90 });
  return { hhid, person, accounts, summary, estimate: estimate(incomeModel, summary), today, institutions };
}

/** Every transaction across linked accounts, tagged with its link and a stable key. */
export function allTransactions(ctx) {
  return ctx.accounts.flatMap((a) => a.txns.map((t) => ({ ...t, link: a.link, key: txnKey(a.link, t) })));
}

export const mask = (acctNbr) => `•••• ${String(acctNbr).slice(-4)}`;
