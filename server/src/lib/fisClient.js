// The only module that talks to the core. Swap FIS_BASE_URL (and the field mapping below) to point
// Helping Hands at a real FIS gateway.
import { randomUUID } from 'node:crypto';

const ORG_ID = process.env.FIS_ORGANIZATION_ID || 'HHDEMO';
const API_KEY = process.env.FIS_API_KEY || 'demo-fis-key';
const baseUrl = () => process.env.FIS_BASE_URL || `http://127.0.0.1:${process.env.PORT || 4000}/fis/v1`;

export class FisError extends Error {
  constructor(status, statusCode, statusDesc) {
    super(statusDesc);
    this.status = status;
    this.statusCode = statusCode;
  }
}

async function call(method, path, body) {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'organization-id': ORG_ID, 'x-api-key': API_KEY, uuid: randomUUID() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.status?.statusCode !== '00') {
    throw new FisError(res.status, json?.status?.statusCode || `HTTP${res.status}`, json?.status?.statusDesc || 'FIS REQUEST FAILED');
  }
  return json;
}

// Short-lived cache so one page load doesn't refetch the same history repeatedly.
const cache = new Map();
const TTL_MS = 4000;
const cached = async (key, fn) => {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
};
export const invalidate = () => cache.clear();

const acctPath = (a) => `/accounts/${a.instNbr}/${a.applCde}/${a.acctNbr}`;

export const fis = {
  /** Uncached raw envelope, for the demo's API explorer. */
  raw: (path) => call('GET', path),

  institutions: () => cached('inst', async () => (await call('GET', '/institutions')).data.institutions),

  account: (a) => cached(`acct:${acctPath(a)}`, async () => (await call('GET', acctPath(a))).data.account),

  customer: (instNbr, custNbr) => cached(`cust:${instNbr}:${custNbr}`, async () => (await call('GET', `/customers/${instNbr}/${custNbr}`)).data.customer),

  /** All transactions for an account in [fromDt, toDt], following pagination. */
  transactions: (a, { fromDt, toDt } = {}) => cached(`tx:${acctPath(a)}:${fromDt}:${toDt}`, async () => {
    const out = [];
    for (let page = 1; ; page++) {
      const qs = new URLSearchParams({ pageNbr: page, pageSize: 500, ...(fromDt && { fromDt }), ...(toDt && { toDt }) });
      const json = await call('GET', `${acctPath(a)}/transactions?${qs}`);
      out.push(...json.data.transactions);
      if (json.pagination.moreDataInd !== 'Y') break;
    }
    return out;
  }),

  verifyOwnership: async ({ instNbr, acctNbr, taxIdLast4, zipCde }) =>
    (await call('POST', '/accounts/verify', { instNbr, acctNbr, taxIdLast4, zipCde })).data,

  memoPost: async (a, posting) => {
    const json = await call('POST', `${acctPath(a)}/memo-posts`, posting);
    invalidate();
    return json.data.transaction;
  },

  transfer: async ({ fromAcct, toAcct, tranAmt, memo, creditTranCde, creditDesc, debitDesc }) => {
    const strip = ({ instNbr, applCde, acctNbr }) => ({ instNbr, applCde, acctNbr });
    const json = await call('POST', '/transfers', { fromAcct: strip(fromAcct), toAcct: strip(toAcct), tranAmt, memo, creditTranCde, creditDesc, debitDesc });
    invalidate();
    return json.data.transfer;
  },
};
