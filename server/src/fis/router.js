// Fake FIS core banking API (demo only). Shapes follow FIS IBS / Code Connect conventions:
// abbreviated field names, institution + application code + account number addressing, and an
// envelope with metadata/status. Not the licensed FIS specification.
import express from 'express';
import { randomUUID } from 'node:crypto';
import { core } from './store.js';

export const FIS_API_KEY = process.env.FIS_API_KEY || 'demo-fis-key';
const router = express.Router();

const envelope = (req, data, extra = {}) => ({
  metadata: { uuid: req.fisUuid, timestamp: new Date().toISOString(), organizationId: req.get('organization-id') },
  status: { statusCode: '00', statusDesc: 'SUCCESS' },
  data,
  ...extra,
});

const fail = (req, res, http, statusCode, statusDesc) =>
  res.status(http).json({
    metadata: { uuid: req.fisUuid, timestamp: new Date().toISOString(), organizationId: req.get('organization-id') ?? null },
    status: { statusCode, statusDesc },
    data: null,
  });

const HTTP_FOR = { E400: 400, E404: 404, E409: 409, E422: 422 };
const guard = (fn) => (req, res) => {
  try {
    fn(req, res);
  } catch (err) {
    fail(req, res, HTTP_FOR[err.code] || 500, err.code || 'E500', err.message || 'SYSTEM ERROR');
  }
};

router.use(express.json());
router.use((req, res, next) => {
  req.fisUuid = req.get('uuid') || randomUUID();
  res.set('uuid', req.fisUuid);
  if (req.get('x-api-key') !== FIS_API_KEY) return fail(req, res, 401, 'E401', 'INVALID API KEY');
  if (!req.get('organization-id')) return fail(req, res, 400, 'E400', 'ORGANIZATION-ID HEADER REQUIRED');
  next();
});

const publicAccount = (a) => a && ({
  instNbr: a.instNbr, applCde: a.applCde, acctNbr: a.acctNbr, custNbr: a.custNbr, prodCde: a.prodCde, prodDesc: a.prodDesc,
  acctStatCde: a.acctStatCde, openDt: a.openDt, curBal: a.curBal, availBal: a.availBal, rtnNbr: a.rtnNbr,
});
const publicCustomer = (c) => c && ({ ...c, taxIdLast4: undefined, taxIdMasked: c.taxIdLast4 ? `***-**-${c.taxIdLast4}` : undefined });

router.get('/institutions', guard((req, res) => res.json(envelope(req, { institutions: core.institutions }))));

router.get('/customers/:instNbr/:custNbr', guard((req, res) => {
  const c = core.customer(req.params.instNbr, req.params.custNbr);
  if (!c) return fail(req, res, 404, 'E404', 'CUSTOMER NOT FOUND');
  res.json(envelope(req, { customer: publicCustomer(c) }));
}));

router.get('/customers/:instNbr/:custNbr/accounts', guard((req, res) => {
  const c = core.customer(req.params.instNbr, req.params.custNbr);
  if (!c) return fail(req, res, 404, 'E404', 'CUSTOMER NOT FOUND');
  res.json(envelope(req, { accounts: core.customerAccounts(c.instNbr, c.custNbr).map(publicAccount) }));
}));

router.get('/accounts/:instNbr/:applCde/:acctNbr', guard((req, res) => {
  const { instNbr, applCde, acctNbr } = req.params;
  const a = core.account(instNbr, applCde, acctNbr);
  if (!a) return fail(req, res, 404, 'E404', 'ACCOUNT NOT FOUND');
  res.json(envelope(req, { account: publicAccount(a) }));
}));

router.get('/accounts/:instNbr/:applCde/:acctNbr/transactions', guard((req, res) => {
  const { instNbr, applCde, acctNbr } = req.params;
  if (!core.account(instNbr, applCde, acctNbr)) return fail(req, res, 404, 'E404', 'ACCOUNT NOT FOUND');
  const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize) || 100));
  const pageNbr = Math.max(1, Number(req.query.pageNbr) || 1);
  const all = core.history(instNbr, applCde, acctNbr, { fromDt: req.query.fromDt, toDt: req.query.toDt });
  const totalPages = Math.max(1, Math.ceil(all.length / pageSize));
  res.json(envelope(req, { transactions: all.slice((pageNbr - 1) * pageSize, pageNbr * pageSize) }, {
    pagination: { pageNbr, pageSize, totalRecs: all.length, totalPages, moreDataInd: pageNbr < totalPages ? 'Y' : 'N' },
  }));
}));

// Ownership verification used when a member links an account to their Helping Hands ID.
router.post('/accounts/verify', guard((req, res) => {
  const { instNbr, acctNbr, taxIdLast4, zipCde } = req.body || {};
  const a = core.findAccount(instNbr, String(acctNbr || '').trim());
  const c = a && core.customer(a.instNbr, a.custNbr);
  const match = !!c && c.custTypCde === 'P' && c.taxIdLast4 === String(taxIdLast4) && c.addr?.zipCde === String(zipCde);
  if (!match) return fail(req, res, 422, 'E422', 'ACCOUNT OWNERSHIP NOT VERIFIED');
  res.json(envelope(req, {
    verifiedInd: 'Y',
    account: publicAccount(a),
    customer: { instNbr: c.instNbr, custNbr: c.custNbr, nme: c.nme },
  }));
}));

// Memo post: real-time single-account posting (card authorizations, statement credits).
router.post('/accounts/:instNbr/:applCde/:acctNbr/memo-posts', guard((req, res) => {
  const { instNbr, applCde, acctNbr } = req.params;
  const b = req.body || {};
  if (!['C', 'D'].includes(b.drCrCde) || !(Number(b.tranAmt) > 0)) return fail(req, res, 400, 'E400', 'INVALID POSTING');
  const txn = core.memoPost({ instNbr, applCde, acctNbr }, {
    tranCde: b.tranCde || (b.drCrCde === 'C' ? 'MEMO' : 'POS'), tranDesc: b.tranDesc || 'MEMO POST', drCrCde: b.drCrCde,
    tranAmt: Math.round(Number(b.tranAmt) * 100) / 100,
    ...(b.mrchId && { mrchId: b.mrchId, mrchNme: b.mrchNme, mrchCatCde: Number(b.mrchCatCde), mrchCityNme: b.mrchCityNme || 'JACKSONVILLE', mrchStCde: b.mrchStCde || 'FL' }),
    ...(b.payeeCatCde && { payeeCatCde: b.payeeCatCde }),
  });
  res.status(201).json(envelope(req, { transaction: txn }));
}));

// Funds transfer between accounts on FIS-core institutions.
router.post('/transfers', guard((req, res) => {
  const { fromAcct, toAcct, tranAmt, memo, creditTranCde, creditDesc, debitDesc } = req.body || {};
  const record = core.transfer({ fromAcct, toAcct, tranAmt: Number(tranAmt), memo, creditTranCde, creditDesc, debitDesc });
  res.status(201).json(envelope(req, { transfer: record }));
}));

router.get('/transfers/:tranRefNbr', guard((req, res) => {
  const t = core.overlay.transfers.find((x) => x.tranRefNbr === req.params.tranRefNbr);
  if (!t) return fail(req, res, 404, 'E404', 'TRANSFER NOT FOUND');
  res.json(envelope(req, { transfer: t }));
}));

export default router;
