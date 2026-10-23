import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, memberStore } from './api.js';

const SessionContext = createContext(null);
const ToastContext = createContext(null);

export function SessionProvider({ children }) {
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);

  const signIn = useCallback(async (hhid) => {
    memberStore.set(hhid);
    try {
      const r = await api('/session', { method: 'POST', body: { hhid } });
      setMe(r.me);
      return r;
    } catch (e) {
      memberStore.clear();
      throw e;
    }
  }, []);

  const refreshMe = useCallback(async () => {
    const r = await api('/me');
    setMe(r.me);
    return r.me;
  }, []);

  const signOut = useCallback(() => {
    memberStore.clear();
    setMe(null);
  }, []);

  useEffect(() => {
    // Deep link for demos: /?member=HH-XXXX-XXXX signs in directly.
    const url = new URL(window.location.href);
    const linked = url.searchParams.get('member');
    if (linked) {
      url.searchParams.delete('member');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    const hhid = linked || memberStore.get();
    if (!hhid) { setReady(true); return; }
    signIn(hhid).catch(() => {}).finally(() => setReady(true));
  }, [signIn]);

  const value = useMemo(() => ({ me, ready, signIn, signOut, refreshMe, setMe }), [me, ready, signIn, signOut, refreshMe]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);
  const push = useCallback((t) => {
    const id = ++seq.current;
    const toast = typeof t === 'string' ? { title: t } : t;
    setToasts((list) => [...list, { id, ...toast }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), toast.duration || 4200);
  }, []);
  const error = useCallback((e) => push({ title: e?.message || String(e), tone: 'error' }), [push]);
  const value = useMemo(() => ({ push, error }), [push, error]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'error' ? 'error' : ''}`}>
            <div className="title">{t.title}</div>
            {t.body && <div className="small muted mt-1">{t.body}</div>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
