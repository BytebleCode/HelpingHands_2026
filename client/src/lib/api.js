import { useCallback, useEffect, useRef, useState } from 'react';

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

export async function api(path, { method = 'GET', body } = {}) {
  const hhid = memberStore.get();
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(hhid && { 'x-hh-id': hhid }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
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
