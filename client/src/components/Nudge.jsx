// Moment-of-intent nudges on the member side:
//   NudgeProvider / useNudge  shared state so any page can pop a nudge (the Demo simulator, Home's location check)
//   NudgeBanner               the pop-up itself, rendered once by the Shell (top right on desktop, top of screen on phones)
//   RecentNudges              Home list of nudges from the last week, so a dismissed nudge is never lost
//   MomentOptIn               Home card that asks before using location, then checks once per visit
//   MomentSettings            Account → Preferences switch, so nudges can be turned back on any time
// Server side lives in server/src/lib/nudge.js. Location never leaves the single /nudges/check request.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { MapPin, Sparkles, X, Clock3, CreditCard, ChevronDown, ChevronUp, ShieldCheck, BellRing, Check } from 'lucide-react';
import { SectionHead } from './ui.jsx';
import { api, useApi } from '../lib/api.js';
import { useSession, useToast } from '../lib/session.jsx';
import { useOfferActions } from './Offers.jsx';
import { money2, pts, time12 } from '../lib/format.js';

// ------------------------------------------------------------------ shared state
const NudgeContext = createContext(null);

export function NudgeProvider({ children }) {
  const [nudge, setNudge] = useState(null);
  // Bumped whenever a nudge is shown or acted on, so lists (RecentNudges) know to refetch.
  const [version, setVersion] = useState(0);
  const show = useCallback((n) => { setNudge(n ? { ...n, shownAt: Date.now() } : null); setVersion((v) => v + 1); }, []);
  const dismiss = useCallback(() => setNudge(null), []);
  const changed = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo(() => ({ nudge, show, dismiss, changed, version }), [nudge, show, dismiss, changed, version]);
  return <NudgeContext.Provider value={value}>{children}</NudgeContext.Provider>;
}

export const useNudge = () => useContext(NudgeContext);

// The server expects the member's local date and time ('YYYY-MM-DD', 'HH:MM').
const pad = (n) => String(n).padStart(2, '0');
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localTime = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// ------------------------------------------------------------------ actions shared by the banner and the list
/** Activate the nudge's offer, or pay with points at its store. Both refresh the member's balance. */
function useNudgeActions(onDone) {
  const { me, refreshMe } = useSession();
  const { changed } = useNudge();
  const toast = useToast();
  const { activate, busy } = useOfferActions();
  const [paying, setPaying] = useState(false);

  // Spend up to one typical trip's worth of points (never more than the balance).
  const pointsFor = (n) => Math.min(me?.points || 0, Math.round(n.typicalSpend * 100));

  const activateOffer = async (n) => {
    const r = await activate(n.offer);
    if (r) { changed(); onDone?.(); }
  };
  const payWithPoints = async (n) => {
    setPaying(true);
    try {
      const r = await api('/rewards/pay-with-points', { method: 'POST', body: { partnerId: n.offer.partner.id, points: pointsFor(n) } });
      toast.push({ title: `Paid with points · ${money2(r.dollars)} at ${r.partner}`, body: `Statement credit to ${r.account} · FIS ${r.transfer.tranRefNbr}`, duration: 6500 });
      await refreshMe();
      changed();
      onDone?.();
    } catch (e) {
      toast.error(e);
    } finally {
      setPaying(false);
    }
  };
  return { activateOffer, payWithPoints, pointsFor, busy, paying };
}

// The two action buttons. Once activated, Activate becomes "Offer active"; once a purchase has
// matched it, it becomes "Reward earned".
function NudgeButtons({ n, actions }) {
  const pointsToUse = actions.pointsFor(n);
  return (
    <>
      {n.offer.status === 'active' ? (
        <span className="badge gold"><Clock3 />Offer active · pay with any linked card</span>
      ) : n.offer.status === 'redeemed' ? (
        <span className="badge positive"><Check />Reward earned</span>
      ) : (
        <button className="btn btn-primary btn-sm" disabled={actions.busy === n.offer.id} onClick={() => actions.activateOffer(n)}>
          {actions.busy === n.offer.id ? 'Activating…' : 'Activate offer'}
        </button>
      )}
      {pointsToUse >= 100 && (
        <button className="btn btn-secondary btn-sm" disabled={actions.paying} onClick={() => actions.payWithPoints(n)}>
          <CreditCard />{actions.paying ? 'Applying…' : `Use ${money2(pointsToUse / 100)} in points`}
        </button>
      )}
    </>
  );
}

// ------------------------------------------------------------------ the pop-up
/** The member-facing banner. Rendered once by the Shell; any page raises it with useNudge().show(nudge). */
export function NudgeBanner() {
  const { nudge, dismiss } = useNudge();
  const { me } = useSession();
  const [open, setOpen] = useState(false); // "Why?" expanded
  const actions = useNudgeActions(dismiss);
  useEffect(() => { setOpen(false); }, [nudge?.shownAt]);
  if (!nudge || !me) return null;

  const o = nudge.offer;
  // First reason shows up front (where they are, for a live nudge); the rest sit behind "Why?".
  const [lead, ...why] = nudge.reasons;

  return (
    // key: a new nudge remounts the banner so its slide-in plays again and it's clear something changed.
    <aside key={nudge.shownAt} className="nudge-banner" role="dialog" aria-label="Reward available now">
      <div className="row between gap-3" style={{ alignItems: 'flex-start' }}>
        <div className="row gap-2"><MapPin size={14} className="gold" /><span className="label gold">{nudge.confidence == null ? 'From your nudges' : 'Right now'} · {o.partner.name}</span></div>
        <button className="btn btn-ghost icon-btn nudge-close" onClick={dismiss} aria-label="Dismiss"><X size={16} /></button>
      </div>
      <div className="serif nudge-headline mt-2">{money2(nudge.expectedReward)} back on {o.categoryLabel.toLowerCase()}</div>
      <div className="small muted mt-1">{o.value.headline} on a typical {money2(nudge.typicalSpend)} trip{o.multiplier > 1 ? ` · ${o.multiplier}× boost` : ''}</div>
      {lead && <div className="reason mt-3"><Sparkles /><span>{lead}</span></div>}

      {open && (
        <div className="stack gap-2 mt-2 fade-in">
          {why.map((r) => <div key={r} className="reason"><Sparkles /><span>{r}</span></div>)}
          {nudge.confidence != null && (
            <div className="small muted mt-1 num">Model {Math.round(nudge.modelConfidence * 100)}% on timing · {Math.round(nudge.confidence * 100)}% with location</div>
          )}
          <div className="reason"><ShieldCheck /><span>Your location was used for this check only and isn't stored.</span></div>
        </div>
      )}

      <div className="row gap-2 wrap mt-4">
        <NudgeButtons n={nudge} actions={actions} />
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          Why?{open ? <ChevronUp /> : <ChevronDown />}
        </button>
      </div>
      {nudge.points?.usable && <div className="small muted mt-2 num">{pts(me.points)} points available · saved to your nudges for 7 days</div>}
    </aside>
  );
}

// ------------------------------------------------------------------ the list (Home)
/**
 * Nudges from the last week. Opening one here never counts as a new pop-up, so the daily limit only
 * controls interruptions, never access. Hidden when there's nothing to show.
 */
export function RecentNudges() {
  const { version, show } = useNudge();
  const { data, reload } = useApi('/nudges/recent');
  const actions = useNudgeActions(() => reload({ quiet: true }));
  useEffect(() => { if (version) reload({ quiet: true }); }, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = data?.nudges || [];
  if (!items.length) return null;
  return (
    <section className="section">
      <SectionHead label={`Kept for ${data.rules.keepDays} days`} title="Your nudges" />
      <div className="card pad">
        <div className="list">
          {items.map(({ shownAt, nudge: n }) => (
            <div key={n.id} className="list-item nudge-row">
              <div className={`list-icon ${n.offer.status === 'redeemed' ? '' : 'gold'}`}>{n.offer.status === 'redeemed' ? <Check /> : <BellRing />}</div>
              <div className="grow">
                <div className="small truncate">{n.headline}</div>
                <div className="small muted">{shownAt.weekday} · {time12(shownAt.time)}</div>
              </div>
              <div className="row gap-2 wrap nudge-row-actions">
                <NudgeButtons n={n} actions={actions} />
                <button className="btn btn-ghost btn-sm" onClick={() => show(n)}>Open</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ location preference
// One setting, two places to change it: the Home card (first visit) and Account > Preferences
// (any time after). Stored per browser: 'on' | 'off' | missing (not asked yet).
const OPT_KEY = 'hh.momentNudges';
const OPT_EVENT = 'hh:moment-pref'; // keeps Home and Account in sync when one of them changes it
const readOpt = () => { try { return localStorage.getItem(OPT_KEY); } catch { return null; } };
const writeOpt = (v) => {
  try { if (v) localStorage.setItem(OPT_KEY, v); else localStorage.removeItem(OPT_KEY); } catch { /* storage blocked: the choice lasts this session only */ }
  window.dispatchEvent(new CustomEvent(OPT_EVENT, { detail: v }));
};

/** The member's moment-nudge choice, shared by every component that shows or changes it. */
function useMomentPref() {
  const [pref, setPref] = useState(readOpt);
  useEffect(() => {
    const onChange = (e) => setPref(e.detail ?? readOpt());
    window.addEventListener(OPT_EVENT, onChange);
    return () => window.removeEventListener(OPT_EVENT, onChange);
  }, []);
  return [pref, writeOpt];
}

/**
 * Reads this device's location once and asks the engine whether a reward is worth showing.
 * Browsers only allow location on secure pages (https or localhost); `supported` says whether we can.
 */
function useMomentCheck() {
  const { show } = useNudge();
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator && window.isSecureContext;

  const check = useCallback(({ quiet } = {}) => {
    if (!supported) return;
    setChecking(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const r = await api('/nudges/check', {
          method: 'POST',
          body: { date: localDate(), time: localTime(), lat: pos.coords.latitude, lng: pos.coords.longitude, record: true },
        });
        if (r.nudge) show(r.nudge);
        else if (!quiet) toast.push({ title: 'No reward to surface right now', body: r.decision.reason });
      } catch (e) {
        if (!quiet) toast.error(e);
      } finally {
        setChecking(false);
      }
    }, () => {
      setChecking(false);
      if (!quiet) toast.push({ title: 'Location is off for this site', body: 'Allow location in your browser settings to get moment nudges.', tone: 'error' });
    }, { maximumAge: 60_000, timeout: 10_000 });
  }, [supported, show, toast]);

  return { check, checking, supported };
}

// Tells the member where the setting lives whenever they switch nudges off.
function useTurnOff() {
  const [, setPref] = useMomentPref();
  const toast = useToast();
  return () => {
    setPref('off');
    toast.push({ title: 'Moment nudges are off', body: 'We won’t read your location. Turn them back on any time in Account → Preferences.' });
  };
}

// ------------------------------------------------------------------ Home card
/**
 * Asks once on Home. After that, Home shows a slim "on" notice, or nothing when the member said no,
 * and the setting lives in Account → Preferences (MomentSettings below).
 */
export function MomentOptIn() {
  const [pref, setPref] = useMomentPref();
  const { check, checking, supported } = useMomentCheck();
  const turnOff = useTurnOff();

  // Already opted in: check quietly once when Home opens.
  useEffect(() => { if (pref === 'on') check({ quiet: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (pref === 'off') return null; // respect "no" on Home; Account still has the switch
  if (pref === 'on') {
    return (
      <section className="section">
        <div className="notice moment-on">
          <MapPin />
          <div className="small grow">Moment nudges are on. We'll surface a reward when you're at a partner store at a time you usually shop.</div>
          <div className="row gap-2">
            <button className="btn btn-ghost btn-sm" disabled={checking || !supported} onClick={() => check()}>{checking ? 'Checking…' : 'Check now'}</button>
            <button className="btn btn-ghost btn-sm" onClick={turnOff}>Turn off</button>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="section">
      <div className="card pad gold-edge moment-optin">
        <div className="list-icon gold"><MapPin /></div>
        <div className="grow">
          <div className="label gold">Rewards at the right moment</div>
          <div className="mt-1">Get a heads-up when you're at a partner store you'd shop at anyway.</div>
          <div className="small muted mt-1">Your location is checked on this visit only and never stored. At most two pop-ups a day; every nudge stays in your list for a week.</div>
          {!supported && <div className="small muted mt-1">Location needs a secure connection (https or localhost) on this device.</div>}
        </div>
        <div className="row gap-2 moment-actions">
          <button className="btn btn-gold btn-sm" disabled={!supported} onClick={() => { setPref('on'); check(); }}>Turn on</button>
          <button className="btn btn-ghost btn-sm" onClick={turnOff}>Not now</button>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Account → Preferences
/** The permanent on/off switch for moment nudges. Always visible, whatever the member chose before. */
export function MomentSettings() {
  const [pref, setPref] = useMomentPref();
  const { check, checking, supported } = useMomentCheck();
  const turnOff = useTurnOff();
  const on = pref === 'on';
  return (
    <div className="card pad moment-settings">
      <div className="list-icon gold"><MapPin /></div>
      <div className="grow">
        <div className="row gap-2 wrap">
          <span style={{ fontWeight: 500 }}>Moment nudges</span>
          <span className={`badge ${on ? 'gold' : ''}`}>{on ? 'On' : 'Off'}</span>
        </div>
        <div className="small muted mt-1">
          {on
            ? 'When you open Home, we check your location once and surface a reward if you’re at a partner store at a time you usually shop. Your location is never stored.'
            : 'We don’t read your location. Turn this on to get a heads-up at partner stores you’d shop at anyway.'}
        </div>
        {!supported && <div className="small muted mt-1">Location needs a secure connection (https or localhost) on this device.</div>}
      </div>
      <div className="row gap-2 moment-actions">
        {on ? (
          <>
            <button className="btn btn-ghost btn-sm" disabled={checking || !supported} onClick={() => check()}>{checking ? 'Checking…' : 'Check now'}</button>
            <button className="btn btn-secondary btn-sm" onClick={turnOff}>Turn off</button>
          </>
        ) : (
          <button className="btn btn-gold btn-sm" disabled={!supported} onClick={() => { setPref('on'); check(); }}>Turn on</button>
        )}
      </div>
    </div>
  );
}
