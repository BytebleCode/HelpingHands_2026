// Demo tab, "Moment of intent" section:
//   IntentWeek       heatmap of the intent model's next 7 days for one category (no location involved)
//   MomentSimulator  puts the member at a place and time and asks the nudge engine what it would do
//   ModelCard        the model's test scores (saved by server/scripts/train-intent.js)
//   MomentLab        wires the three together and keeps the heatmap category and the "Where" in sync
// Server side: server/src/lib/nudge.js (GET /nudges/week, GET /nudges/places, POST /nudges/check).
import { useEffect, useState } from 'react';
import { MapPin, Radar, Wand2, BellRing, BellOff, ShieldCheck, RotateCcw } from 'lucide-react';
import { ChartFrame, DataTable } from './charts.jsx';
import { Skeleton, Notice } from './ui.jsx';
import { useNudge } from './Nudge.jsx';
import { api, useApi } from '../lib/api.js';
import { useSession, useToast } from '../lib/session.jsx';
import { money2, pct } from '../lib/format.js';

// Times offered in the simulator. Each falls inside one of the model's four time blocks.
const TIMES = [
  ['07:30', '7:30 AM'], ['10:00', '10:00 AM'], ['12:30', '12:30 PM'], ['15:00', '3:00 PM'], ['17:30', '5:30 PM'], ['20:00', '8:00 PM'],
];
// The time the simulator uses when you pick a heatmap cell or a "best time" for a block.
const BLOCK_TIME = { morning: '10:00', midday: '12:30', afternoon: '17:30', evening: '20:00' };
// How each category reads in the heatmap title ("When grocery runs are likely").
const TRIP = { groceries: 'grocery runs', fuel: 'fill-ups', pharmacy: 'pharmacy stops', household: 'home essentials trips', transit: 'transit rides' };
const short = (w) => w.slice(0, 3);
const dayLabel = (d) => `${short(d.weekday)} ${Number(d.date.slice(8, 10))}`;

// Gold wash scaled to the week's peak for this category, so the pattern is easy to see even when every
// chance is small. Strong cells flip to dark text for contrast. Exact numbers are always in the cell.
const cellStyle = (p, max) => {
  const a = max > 0 ? Math.min(1, p / max) : 0;
  return { background: `rgba(214, 177, 120, ${0.06 + a * 0.84})`, color: a > 0.55 ? 'var(--obsidian)' : 'var(--text)' };
};

/** Best (day, block) of the week for one category: what "Best time here" jumps to. */
function bestSlotFor(week, category) {
  let best = null;
  for (const d of week.days) {
    for (const b of d.blocks) {
      if (!best || b.probs[category] > best.p) best = { date: d.date, time: BLOCK_TIME[b.block], p: b.probs[category] };
    }
  }
  return best;
}

// ------------------------------------------------------------------ heatmap
export function IntentWeek({ week, category, onCategory, onPick, selected }) {
  const max = Math.max(...week.days.flatMap((d) => d.blocks.map((b) => b.probs[category])));
  const label = week.categories.find((c) => c.key === category)?.label || category;
  return (
    <ChartFrame label="Intent model" title={`When ${TRIP[category] || `${label.toLowerCase()} trips`} are likely`}
      subtitle="Chance of a purchase in each part of the day over the next week, from spending history alone (no location). Brighter is likelier. Pick a cell to test that moment."
      table={{ columns: ['Day', ...week.blocks.map((b) => b.label)], rows: week.days.map((d) => [dayLabel(d), ...d.blocks.map((b) => pct(b.probs[category]))]) }}>
      <div className="chips mb-2" role="tablist" aria-label="Category">
        {week.categories.map((c) => (
          <button key={c.key} role="tab" aria-selected={c.key === category} className={`chip ${c.key === category ? 'active' : ''}`} onClick={() => onCategory(c.key)}>{c.label}</button>
        ))}
      </div>
      <div className="heat-grid mt-3" role="grid" aria-label={`${label} chance by day and time`}>
        <div />
        {week.blocks.map((b) => <div key={b.key} className="heat-head">{b.label}</div>)}
        {week.days.map((d) => (
          <div key={d.date} className="heat-row" role="row">
            <div className="heat-day">{dayLabel(d)}</div>
            {d.blocks.map((b) => {
              const p = b.probs[category];
              const isSel = selected?.date === d.date && selected?.time === BLOCK_TIME[b.block];
              return (
                <button key={b.block} role="gridcell" className={`heat-cell num ${p === max && p > 0.1 ? 'peak' : ''} ${isSel ? 'selected' : ''}`} style={cellStyle(p, max)}
                  title={`${d.weekday} ${b.label}: ${pct(p)}`} onClick={() => onPick({ date: d.date, time: BLOCK_TIME[b.block] })}>
                  {pct(p)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </ChartFrame>
  );
}

// ------------------------------------------------------------------ model scores
export function ModelCard({ model }) {
  const stats = [
    ['Separates buy vs. no-buy', model.auc.toFixed(2), `AUC on ${model.testHouseholds} unseen households · rule of thumb ${model.aucRule.toFixed(2)}, frequency alone ${model.aucFrequency.toFixed(2)}`],
    ['Picks the right times', pct(model.weeklyTop3), `Its top 3 slots of a week catch a real trip · rule ${pct(model.weeklyTop3Rule)}, chance ${pct(model.weeklyTop3Chance)}`],
    ['Honest probabilities', pct(model.meanPredicted, 1), `Average predicted chance per slot vs. ${pct(model.baseRate, 1)} actual`],
  ];
  return (
    <div className="card pad">
      <div className="label gold">How well it predicts</div>
      <div className="grid-3 mt-4" style={{ gap: 'var(--s5)' }}>
        {stats.map(([k, v, sub]) => (
          <div key={k} className="stat"><div className="label">{k}</div><div className="value num">{v}</div><div className="small muted">{sub}</div></div>
        ))}
      </div>
      <p className="small muted mt-4">Logistic regression trained on {model.trainedOn} synthetic households, tested on the last {model.testDays} days of {model.testHouseholds} households it never saw. Clues: how often they buy, usual day, usual time, whether a routine is due, recent purchases, payday timing, days of money left and spending pace.</p>
    </div>
  );
}

// ------------------------------------------------------------------ simulator
/**
 * Places the member somewhere at a given time and asks the engine. Every check is recorded like a real
 * pop-up, so the daily limit and the 48-hour cooldown show up exactly as a member would see them.
 * "Ignore limits" (demo only) lets a presenter replay a moment without resetting the demo.
 */
export function MomentSimulator({ week, places, moment, setMoment, firstName }) {
  const toast = useToast();
  const { show, dismiss } = useNudge();
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ignoreLimits, setIgnoreLimits] = useState(false);
  const allPlaces = [places.home, ...places.stores];
  const place = allPlaces.find((p) => p.id === moment.placeId) || places.home;
  const atStore = place.id !== 'home';

  // Ask the engine about moment `m`. Each check is a new moment, so any banner from the previous one
  // is cleared first. A sent nudge pops up as the member would see it; otherwise a toast says why,
  // so a click never looks like it did nothing.
  const run = async (m = moment) => {
    const at = allPlaces.find((p) => p.id === m.placeId) || places.home;
    dismiss();
    setBusy(true);
    try {
      const r = await api('/nudges/check', { method: 'POST', body: { date: m.date, time: m.time, lat: at.lat, lng: at.lng, record: true, ignoreLimits } });
      setResult({ ...r, placeName: at.name });
      if (r.nudge) show(r.nudge);
      else toast.push({ title: 'No new pop-up', body: r.existing ? `${r.decision.reason}. Use Open it again to see it.` : r.decision.reason });
    } catch (e) { toast.error(e); } finally { setBusy(false); }
  };

  // At a store: keep the store and jump to the best day and time for what it sells.
  // At home: jump to the member's likeliest moment of the week, at the nearest store for that category.
  const bestTime = () => {
    let m;
    if (atStore) {
      const slot = bestSlotFor(week, place.category);
      m = { ...moment, date: slot.date, time: slot.time };
    } else {
      const b = week.best;
      const store = places.stores.find((s) => s.category === b.category); // stores come sorted nearest first
      m = { date: b.date, time: BLOCK_TIME[b.block], placeId: store?.id || 'home' };
    }
    setMoment(m);
    run(m);
  };

  const decision = result?.decision;
  return (
    <div className="card pad">
      <div className="row gap-2"><Radar size={16} className="gold" /><div className="label gold">Moment simulator</div></div>
      <p className="small muted mt-2">Put {firstName} somewhere at a given time. The nudge engine combines the intent model, distance to the store and the reward's value, then decides whether a nudge is worth sending.</p>
      <div className="stack gap-3 mt-4">
        <div className="field">
          <label htmlFor="mo-place">Where</label>
          <select id="mo-place" className="select" value={place.id} onChange={(e) => setMoment((m) => ({ ...m, placeId: e.target.value }))}>
            <option value="home">Home{places.home.area ? ` · ${places.home.area}` : ''}</option>
            {places.stores.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.categoryLabel} · {s.milesFromHome} mi from home</option>)}
          </select>
        </div>
        <div className="row gap-3 wrap">
          <div className="field grow">
            <label htmlFor="mo-day">Day</label>
            <select id="mo-day" className="select" value={moment.date} onChange={(e) => setMoment((m) => ({ ...m, date: e.target.value }))}>
              {week.days.map((d) => <option key={d.date} value={d.date}>{d.weekday}, {dayLabel(d).split(' ')[1]}</option>)}
            </select>
          </div>
          <div className="field" style={{ minWidth: 140 }}>
            <label htmlFor="mo-time">Time</label>
            <select id="mo-time" className="select" value={moment.time} onChange={(e) => setMoment((m) => ({ ...m, time: e.target.value }))}>
              {TIMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div className="row gap-3 wrap mt-4">
        <button className="btn btn-primary" disabled={busy} onClick={() => run()}><MapPin />{busy ? 'Checking…' : 'Check this moment'}</button>
        <button className="btn btn-secondary" disabled={busy} onClick={bestTime} title={atStore ? `Best day and time for ${place.categoryLabel.toLowerCase()} at ${place.name}` : `${firstName}'s likeliest moment this week`}>
          <Wand2 />{atStore ? 'Best time here' : 'Likeliest moment'}
        </button>
      </div>
      <p className="small muted mt-3">The simulator uses pretend places, so it works even when moment nudges are off in Account. Real members only get checked when they've turned nudges on.</p>
      {week.demoMode && (
        <label className="row gap-2 small muted mt-3 check-row">
          <input type="checkbox" checked={ignoreLimits} onChange={(e) => setIgnoreLimits(e.target.checked)} />
          Ignore pop-up limits (demo only)
        </label>
      )}

      {result && (
        <div className="mt-5 fade-in">
          <div className={`moment-result ${decision.sent ? 'sent' : ''}`}>
            {decision.sent ? <BellRing /> : <BellOff />}
            <div className="grow">
              <div className="small" style={{ fontWeight: 500 }}>{decision.sent ? `Nudge sent to ${firstName}'s phone` : 'No new pop-up'}</div>
              <div className="small muted">{result.moment.weekday} {result.moment.block} at {result.placeName} · {decision.reason}</div>
            </div>
            {/* A limit stopped a new pop-up, but the earlier nudge for this offer can always be reopened. */}
            {result.existing && <button className="btn btn-secondary btn-sm" onClick={() => show(result.existing.nudge)}><RotateCcw />Open it again</button>}
          </div>
          <div className="label mt-4 mb-2">What the engine weighed</div>
          <DataTable columns={['Store', 'Timing', '+ Location', 'Worth', 'Away']}
            rows={result.candidates.map((c) => [c.partner, pct(c.modelProbability), pct(c.liveProbability), money2(c.value), c.distanceMiles == null ? '—' : `${c.distanceMiles.toFixed(1)} mi`])} />
          <p className="small muted mt-2">Timing is the intent model alone. Location raises it when {firstName} is close to the store.</p>
          <p className="small muted mt-3">
            Pops up only for a partner store within {decision.rules.maxMiles} mile, when the chance is at least {pct(decision.rules.minConfidence)} and the reward is worth {money2(decision.rules.minValue)} or more.
            At most {decision.rules.maxPerDay} pop-ups a day and the same offer at most once every {decision.rules.cooldownHours} hours. Every nudge stays in {firstName}'s list on Home for {decision.rules.keepDays} days.
          </p>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ section
/** The whole "Moment of intent" section for the Demo tab. */
export function MomentLab() {
  const { me } = useSession();
  // ?member= makes the URL change when the demo switches member, so the data refetches.
  const week = useApi(`/nudges/week?member=${me.hhid}`);
  const places = useApi(`/nudges/places?member=${me.hhid}`);
  const [category, setCategory] = useState(null);
  const [moment, setMoment] = useState(null); // { date, time, placeId }

  // Start on the member's likeliest moment, at the nearest store for that category.
  useEffect(() => {
    if (!week.data || !places.data) return;
    const b = week.data.best;
    setCategory(b?.category || week.data.categories[0].key);
    const store = places.data.stores.find((s) => s.category === b?.category);
    setMoment({ date: b?.date || week.data.days[0].date, time: BLOCK_TIME[b?.block] || '10:00', placeId: store?.id || 'home' });
  }, [week.data, places.data]);

  // Keep the heatmap on the category of the store you're standing at, so the grid and the simulator
  // always describe the same thing.
  const storeCategory = places.data?.stores.find((s) => s.id === moment?.placeId)?.category;
  useEffect(() => { if (storeCategory) setCategory(storeCategory); }, [storeCategory]);

  // Clicking a heatmap cell sets the day and time. If you're not already at a store that sells this
  // category, move to the nearest one so the check matches the cell you picked.
  const pickCell = (m) => setMoment((cur) => {
    const here = places.data.stores.find((s) => s.id === cur.placeId);
    const keep = here && here.category === category;
    const nearest = places.data.stores.find((s) => s.category === category);
    return { ...cur, ...m, placeId: keep ? cur.placeId : nearest?.id || cur.placeId };
  });

  // Picking a category tab also moves "Where" to the nearest store for it, so "Best time here" and the
  // check always match the tab you're looking at.
  const pickCategory = (c) => {
    setCategory(c);
    setMoment((cur) => {
      const here = places.data.stores.find((s) => s.id === cur.placeId);
      if (here?.category === c) return cur;
      const nearest = places.data.stores.find((s) => s.category === c);
      return nearest ? { ...cur, placeId: nearest.id } : cur;
    });
  };

  const ready = week.data && places.data && moment && category;
  if (!ready) return <div className="split"><Skeleton height={460} /><Skeleton height={460} /></div>;
  return (
    <>
      <div className="split">
        <IntentWeek week={week.data} category={category} onCategory={pickCategory} onPick={pickCell} selected={moment} />
        <MomentSimulator week={week.data} places={places.data} moment={moment} setMoment={setMoment} firstName={me.firstName} />
      </div>
      <div className="mt-5"><ModelCard model={week.data.model} /></div>
      <div className="mt-4"><Notice icon={ShieldCheck}>Location is used inside a single check and never stored. Nudge history keeps only which offer was shown, when, and why (timing reasons only). On a phone, moment nudges are opt-in from Home.</Notice></div>
    </>
  );
}
