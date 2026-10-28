// Captures every read the client makes from a running Helping Hands server (on `main`) into
// static JSON files that Apache can serve.
// Usage: node capture.mjs <serverUrl> <outDir>    e.g. node capture.mjs http://localhost:4000 client/dist
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { frozenPath } from './frozenPath.js';

const [server, out] = process.argv.slice(2);
const RADII = [5, 10, 15, 30];
const FIS_KINDS = ['transactions', 'account', 'customer'];
const written = new Map();
let bytes = 0;

async function call(path, { hhid, method = 'GET', body } = {}) {
  const res = await fetch(`${server}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(hhid && { 'x-hh-id': hhid }) },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} (${hhid || 'shared'}): ${res.status} ${await res.text()}`);
  return res.json();
}

function save(path, hhid, data) {
  const file = frozenPath(path, hhid);
  if (written.has(file) && written.get(file) !== path) throw new Error(`${path} and ${written.get(file)} both map to ${file}`);
  written.set(file, path);
  const text = JSON.stringify(data);
  mkdirSync(dirname(join(out, file)), { recursive: true });
  writeFileSync(join(out, file), text);
  bytes += text.length;
}

const capture = async (path, hhid, auth = hhid) => { const data = await call(path, { hhid: auth }); save(path, hhid, data); return data; };

// Shared views. Some still require a signed-in member, though the response is the same for all.
const { personas } = await capture('/personas');
const anyone = personas[0].hhid;
for (const p of ['/neighbors', '/sandbox/merchants', '/demo/compare', '/demo/population']) await capture(p, undefined, anyone);
const overview = await capture('/demo/overview', undefined, anyone);
for (const a of overview.sampleAccounts) {
  for (const kind of FIS_KINDS) {
    const fis = kind === 'customer' ? `/customers/${a.instNbr}/${a.owner}/accounts` : `/accounts/${a.instNbr}/${a.applCde}/${a.acctNbr}${kind === 'transactions' ? '/transactions' : ''}`;
    await capture(`/demo/fis?path=${encodeURIComponent(fis)}&pageSize=12`, undefined, anyone);
  }
}

// Each member, as they'd see it right after signing in (sign-in syncs rewards from FIS).
for (const { hhid } of personas) {
  save('/session', hhid, await call('/session', { hhid, method: 'POST', body: { hhid } }));
  for (const p of ['/me', '/home', '/me/accounts', '/me/insights', '/me/activity', '/rewards', '/giving',
    '/nudges/recent', `/nudges/week?member=${hhid}`, `/nudges/places?member=${hhid}`, `/demo/pipeline?hhid=${hhid}`]) {
    await capture(p, hhid);
  }
  const { causes } = await call('/volunteer?radius=30', { hhid });
  for (const radius of RADII) {
    for (const cause of ['', ...Object.keys(causes)]) {
      await capture(`/volunteer?${new URLSearchParams({ radius: String(radius), ...(cause && { cause }) })}`, hhid);
    }
  }
}

console.log(`Captured ${written.size} responses (${(bytes / 1e6).toFixed(1)} MB) for ${personas.length} members`);
