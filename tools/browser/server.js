// Runs the Helping Hands server (main's server/src) inside the browser, so a static Apache site
// gets the full app: the moment simulator, the purchase simulator, giving, rewards and the FIS
// core all work, and every page reads from the same state.
import { preload } from './shims/fs.js';
import { decodeText } from './ebcdic.js';

// Seed data the server reads at startup, served as files next to index.html.
const SEEDS = ['catalog.json', 'income-model.json', 'identities.json', 'fis-core.json', 'intent-model.json'];

async function loadSeed(name) {
  const res = await fetch(`data/${name}`);
  if (!res.ok) throw new Error(`Couldn't load data/${name} (${res.status})`);
  preload(name, decodeText(await res.arrayBuffer()));
}

export async function start() {
  await Promise.all(SEEDS.map(loadSeed));
  const { app, scoreCommunity } = await import('./app.js');
  // The FIS client calls the core over HTTP; here that goes to the in-browser FIS router.
  globalThis.hhFisFetch = async (url, init = {}) => {
    const res = await app.request({
      method: init.method, url: String(url).replace(/^hh-local:/, ''), headers: init.headers,
      body: init.body ? JSON.parse(init.body) : undefined,
    });
    return new Response(JSON.stringify(res.body), { status: res.status, headers: { 'content-type': 'application/json' } });
  };
  scoreCommunity().catch((err) => console.error('Community scoring failed:', err.message));
  return app;
}
