import { HttpError, loadContext } from '../lib/context.js';
import { FisError } from '../lib/fisClient.js';

export const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof FisError) return res.status(502).json({ error: `Core banking: ${err.message}`, fisStatus: err.statusCode });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

// Demo session: the member's Helping Hands ID travels in a header.
export const member = (fn) => wrap(async (req, res) => {
  const hhid = req.get('x-hh-id');
  if (!hhid) throw new HttpError(401, 'Sign in required');
  req.ctx = await loadContext(hhid);
  return fn(req, res);
});
