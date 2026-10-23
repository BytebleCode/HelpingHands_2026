import { useMemo, useState } from 'react';
import { LocateFixed, MapPin, Clock, Users, Baby, Check, X, ExternalLink } from 'lucide-react';
import { Hero, SectionHead, Img, Modal, PageLoading, PageError, Notice } from '../components/ui.jsx';
import { api, useApi } from '../lib/api.js';
import { useSession, useToast } from '../lib/session.jsx';
import { dayNum, monthShort, weekday, longDate, time12, pts, plural } from '../lib/format.js';

const AREA = { riverside: 'Riverside', sanMarco: 'San Marco', springfield: 'Springfield', arlington: 'Arlington', mandarin: 'Mandarin', northside: 'Northside', westside: 'Westside', beaches: 'the Beaches', southside: 'Southside', murrayHill: 'Murray Hill', downtown: 'Downtown', orangePark: 'Orange Park' };

function ShiftCard({ o, onSignup, onCheckin, onCancel, busy }) {
  const full = o.spotsLeft === 0;
  return (
    <article className="card">
      <div className="row gap-4 shift-row">
        <div className="date-block">
          <div className="m">{monthShort(o.dateIso)}</div>
          <div className="d num">{dayNum(o.dateIso)}</div>
          <div className="small muted">{weekday(o.dateIso)}</div>
        </div>
        <div className="grow stack gap-2">
          <div className="label">{o.charity.name} · {o.charity.causeLabel}</div>
          <h3 className="card-title">{o.title}</h3>
          <p className="small muted clamp-2">{o.description}</p>
          <div className="row gap-4 wrap small muted">
            <span className="row gap-1"><Clock size={13} />{time12(o.start)} · {o.hours} hr</span>
            <span className="row gap-1"><MapPin size={13} />{o.charity.mailingOnly ? 'Location private' : `${o.distance} mi`}</span>
            <span className="row gap-1"><Users size={13} />{full ? 'Full' : `${o.spotsLeft} of ${o.spots} spots left`}</span>
          </div>
          <div className="row gap-2 wrap">
            {o.familyFriendly && <span className="badge"><Baby />Family friendly</span>}
            {o.skills.map((s) => <span key={s} className="badge">{s}</span>)}
            <span className="badge gold">+{pts(o.impactPoints)} impact</span>
            {o.sample && <span className="badge" title="Illustrative shift for the demo">Sample shift</span>}
          </div>
          <div className="row gap-2 wrap mt-2">
            {!o.signup && <button className="btn btn-primary btn-sm" disabled={full || busy} onClick={() => onSignup(o)}>{full ? 'Shift full' : 'Sign up'}</button>}
            {o.signup?.status === 'registered' && (
              <>
                <span className="badge positive"><Check />You’re signed up</span>
                <button className="btn btn-gold btn-sm" disabled={busy} onClick={() => onCheckin(o)}>Check in</button>
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onCancel(o)}><X />Cancel</button>
              </>
            )}
            {o.signup?.status === 'completed' && <span className="badge gold"><Check />Completed · {o.signup.hours} hr</span>}
            {o.charity.website && <a className="btn btn-ghost btn-sm" href={o.charity.website} target="_blank" rel="noreferrer">Real roles<ExternalLink /></a>}
          </div>
        </div>
        <div className="hide-mobile" style={{ width: 168, flex: 'none' }}>
          <div className="media tall" style={{ borderRadius: 10 }}><Img name={o.charity.image} /></div>
        </div>
      </div>
    </article>
  );
}

export default function Volunteer() {
  const { me, refreshMe } = useSession();
  const toast = useToast();
  const [coords, setCoords] = useState(null);
  const [radius, setRadius] = useState(30);
  const [cause, setCause] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkin, setCheckin] = useState(null);
  const [hours, setHours] = useState(1);
  const [celebrate, setCelebrate] = useState(null);

  const qs = new URLSearchParams({ radius: String(radius), ...(cause && { cause }), ...(coords && { lat: coords.lat, lng: coords.lng }) });
  const { data, error, loading, reload } = useApi(`/volunteer?${qs}`);

  const causes = useMemo(() => (data ? Object.entries(data.causes) : []), [data]);

  const locate = () => {
    if (!navigator.geolocation) return toast.error(new Error('Location is not available on this device'));
    navigator.geolocation.getCurrentPosition(
      (p) => { setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }); toast.push('Using your current location'); },
      () => toast.error(new Error('Location permission was declined. Showing shifts near your home ZIP.')),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); await reload({ quiet: true }); } catch (e) { toast.error(e); } finally { setBusy(false); }
  };
  const onSignup = (o) => run(async () => {
    await api(`/volunteer/${o.id}/signup`, { method: 'POST' });
    toast.push({ title: `You’re signed up for ${o.title}`, body: `${longDate(o.dateIso)} at ${time12(o.start)} · ${o.charity.mailingOnly ? 'location shared after screening' : o.charity.address}` });
  });
  const onCancel = (o) => run(async () => { await api(`/volunteer/signups/${o.signup.id}`, { method: 'DELETE' }); toast.push('Signup cancelled'); });
  const submitCheckin = () => run(async () => {
    const r = await api(`/volunteer/signups/${checkin.signup.id}/checkin`, { method: 'POST', body: { hours } });
    setCheckin(null);
    setCelebrate({ ...r, title: checkin.title });
    refreshMe();
  });

  if (loading && !data) return <PageLoading />;
  if (error && !data) return <PageError error={error} onRetry={reload} />;
  const area = data.origin.source === 'device' ? 'your location' : AREA[data.origin.label] || me.zipCde;
  const mine = data.mySignups.filter((o) => o.signup.status === 'registered');
  const open = data.opportunities.filter((o) => !o.signup || o.signup.status !== 'registered');

  return (
    <div className="page">
      <Hero compact image="hero-volunteer" label="Volunteer" title={<>Give your time,<br /><span className="italic">close to home.</span></>} sub="Real Jacksonville nonprofits near you. Every hour you give adds 500 to your impact score, the same as a $5 gift, and no money is required." />

      <div className="container">
        <section className="section">
          <div className="row between wrap gap-3">
            <div className="row gap-2 wrap">
              <span className="pill"><MapPin size={14} className="gold" />Near {area}</span>
              <button className="btn btn-secondary btn-sm" onClick={locate}><LocateFixed />Use my location</button>
            </div>
            <div className="row gap-2">
              <label htmlFor="radius" className="small muted">Within</label>
              <select id="radius" className="select" style={{ height: 34, width: 'auto' }} value={radius} onChange={(e) => setRadius(Number(e.target.value))}>
                {[5, 10, 15, 30].map((r) => <option key={r} value={r}>{r} miles</option>)}
              </select>
            </div>
          </div>
          <div className="chips mt-4">
            <button className={`chip ${!cause ? 'active' : ''}`} onClick={() => setCause('')}>All causes</button>
            {causes.map(([k, label]) => <button key={k} className={`chip ${cause === k ? 'active' : ''}`} onClick={() => setCause(k)}>{label}</button>)}
          </div>
        </section>

        {mine.length > 0 && (
          <section className="section">
            <SectionHead label="Upcoming" title="Your shifts" />
            <div className="stack gap-4">{mine.map((o) => <ShiftCard key={o.id} o={o} busy={busy} onCheckin={(x) => { setHours(x.hours); setCheckin(x); }} onCancel={onCancel} onSignup={onSignup} />)}</div>
          </section>
        )}

        <section className="section">
          <SectionHead label={`${plural(open.length, 'open shift')} within ${data.radius} miles`} title="Opportunities nearby" />
          {open.length === 0 ? <div className="empty">No shifts match. Try a wider radius.</div> : (
            <div className="stack gap-4">{open.map((o) => <ShiftCard key={o.id} o={o} busy={busy} onSignup={onSignup} onCheckin={(x) => { setHours(x.hours); setCheckin(x); }} onCancel={onCancel} />)}</div>
          )}
        </section>

        <section className="section">
          <SectionHead label={`${data.charities.length} organizations`} title="Charities near you" />
          <div className="grid-4">
            {data.charities.map((c) => (
              <div key={c.id} className="card">
                <div className="media"><Img name={c.image} fallback={c.name[0]} /><span className="tag badge">{c.causeLabel}</span></div>
                <div className="card-body">
                  <h3 className="card-title" style={{ fontSize: 19 }}>{c.name}</h3>
                  <div className="small muted">{c.mailingOnly ? 'Mailing address only' : c.address}</div>
                  {c.website && <a className="small gold row gap-1" href={c.website} target="_blank" rel="noreferrer">{c.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}<ExternalLink size={12} /></a>}
                  <div className="row between small mt-1">
                    <span className="muted">{c.mailingOnly ? '—' : `${c.distance} mi`}</span>
                    <span className={c.openShifts ? 'gold' : 'muted'}>{c.openShifts ? plural(c.openShifts, 'open shift') : 'No open shifts'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <Modal open={!!checkin} onClose={() => setCheckin(null)} label="Check in" title={checkin?.title}>
        {checkin && (
          <>
            <p className="muted">{checkin.charity.name} · {longDate(checkin.dateIso)}</p>
            <div className="field">
              <label htmlFor="hours">Hours volunteered · <span className="num">{hours}</span></label>
              <input id="hours" className="range" type="range" min={0.5} max={checkin.hours + 2} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
            </div>
            <Notice icon={Clock}>Adds <span className="gold num">{pts(hours * 500)}</span> to your impact score. In production the charity’s coordinator would confirm hours. For the demo you can check in right away.</Notice>
            <button className="btn btn-primary" disabled={busy} onClick={submitCheckin}>Confirm {hours} hours</button>
          </>
        )}
      </Modal>

      <Modal open={!!celebrate} onClose={() => setCelebrate(null)} label="Thank you" title="Time well given.">
        {celebrate && (
          <div className="stack gap-4 fade-in">
            <p>{celebrate.signup.hours} hours at {celebrate.title} added <span className="gold">{pts(celebrate.signup.hours * 500)}</span> to your impact score.</p>
            {celebrate.levelUp && <div className="badge solid-gold" style={{ alignSelf: 'flex-start' }}>New level · {celebrate.levelUp.name}</div>}
            {celebrate.newBadges.map((b) => <div key={b.key} className="badge gold" style={{ alignSelf: 'flex-start' }}>Badge earned · {b.name}</div>)}
            <div className="kv"><span>Impact score</span><span className="num">{pts(celebrate.journey.impactScore)}</span></div>
            <div className="kv"><span>Level</span><span>{celebrate.journey.level.name}</span></div>
            <button className="btn btn-primary" onClick={() => setCelebrate(null)}>Done</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
