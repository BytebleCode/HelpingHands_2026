import { useCallback, useEffect, useRef, useState } from 'react';

// Static-hosting build: requests go to the Helping Hands server running in this page
// (see server.js) instead of over HTTP, with the same paths, headers and responses.

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

let server = null;
const boot = () => (server ??= import('../browser/server.js').then((m) => m.start()));

export async function api(path, { method = 'GET', body } = {}) {
  const hhid = memberStore.get();
  const app = await boot();
  const res = await app.request({
    method, url: `/api${path}`, body,
    headers: { 'content-type': 'application/json', ...(hhid && { 'x-hh-id': hhid }) },
  });
  const data = res.body ?? {};
  if (res.status >= 400) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
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
