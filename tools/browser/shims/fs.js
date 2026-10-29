// In-browser stand-in for node:fs. Seed files are preloaded into memory before the server loads;
// the server's runtime state files (points, offers, FIS postings) persist in localStorage, so a
// viewer's demo activity survives reloads until they press Reset in the Demo tab.

const memory = new Map();
const nameOf = (path) => String(path).split('/').filter(Boolean).pop();
const KEY = `hh.state.${__HH_BUILD__}.`;

const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* memory only */ } },
};

export function preload(name, text) {
  memory.set(name, text);
}

export function readFileSync(path) {
  const name = nameOf(path);
  if (memory.has(name)) return memory.get(name);
  const saved = storage.get(KEY + name);
  if (saved !== null) return saved;
  throw Object.assign(new Error(`ENOENT: ${name}`), { code: 'ENOENT' });
}

export function existsSync(path) {
  try { readFileSync(path); return true; } catch { return false; }
}

export function writeFileSync(path, text) {
  const name = nameOf(path);
  memory.set(name, String(text));
  storage.set(KEY + name, String(text));
}

export function mkdirSync() {}

export default { preload, readFileSync, existsSync, writeFileSync, mkdirSync };
