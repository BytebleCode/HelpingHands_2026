import { useCallback, useEffect, useRef, useState } from 'react';
import { frozenPath } from './frozenPath.js';

// Frozen build for static hosting (Apache): every read comes from a JSON snapshot captured from
// the real server, so nothing a member does is saved.

const KEY = 'hh.member';

// Storage can be unavailable (private mode, previews); the app still works for the session.
let memoryHhid = null;
export const memberStore = {
  get() {
    try { return localStorage.getItem(KEY) || memoryHhid; } catch { return memoryHhid; }
  },
  set(hhid) {
    memoryHhid = hhid;
    try { localStorage.setItem(KEY, hhid); } catch { /* ignore */ }
  },
  clear() {
    memoryHhid = null;
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  },
};

const READ_ONLY = 'This demo is a read-only snapshot, so changes can\u2019t be saved.';

export async function api(path, { method = 'GET', body } = {}) {
  let url;
  if (method === 'GET') url = frozenPath(path, memberStore.get());
  else if (path === '/session') url = frozenPath('/session', String(body?.hhid || '').toUpperCase().trim());
  else throw Object.assign(new Error(READ_ONLY), { status: 405 });

  const res = await fetch(url);
  const data = res.ok ? await res.json().catch(() => null) : null;
  if (!data) {
    const error = path === '/session' ? 'No member with that Helping Hands ID' : 'Not available in this demo snapshot';
    throw Object.assign(new Error(error), { status: res.ok ? 500 : res.status });
  }
  return data;
}

/** Fetches `path` on mount and whenever it changes. */
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const latest = useRef(path);
  const load = useCallback(async ({ quiet = false } = {}) => {
    latest.current = path;
    if (!quiet) setState((s) => ({ ...s, loading: true }));
    try {
      const data = await api(path);
      if (latest.current === path) setState({ data, error: null, loading: false });
    } catch (error) {
      if (latest.current === path) setState((s) => ({ ...s, error, loading: false }));
    }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load, setData: (fn) => setState((s) => ({ ...s, data: fn(s.data) })) };
}
