// Nudge engine: fires at the right moment and place, stays quiet otherwise, respects caps, never stores location.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContext } from '../src/lib/context.js';
import { checkNudge, weekView, placesFor, proximityBoost, recentNudges, NUDGE_RULES } from '../src/lib/nudge.js';
import { store, catalog } from '../src/lib/store.js';
import { fromDay, todayDay, dayOfWeek } from '../src/lib/dates.js';
import express from 'express';
import fisRouter from '../src/fis/router.js';

const MAYA = 'HH-7KQ3-M2XA';

// The app reads the core through HTTP (fisClient); serve the fake core for the test.
const server = await new Promise((resolve) => {
  const s = express().use('/fis/v1', fisRouter).listen(0, () => resolve(s));
});
process.env.FIS_BASE_URL = `http://127.0.0.1:${server.address().port}/fis/v1`;
test.after(() => { store.state.nudges = {}; store.save(); server.close(); });

const nextSunday = () => { const t = todayDay(); return fromDay(t + ((7 - dayOfWeek(t)) % 7 || 7)); };
const greenleaf = () => catalog.partners.find((p) => p.id === 'greenleaf').location;

test.beforeEach(() => { store.state.nudges = {}; });

test('Maya at Greenleaf on her usual Sunday morning gets a grocery nudge with reasons', async () => {
  const ctx = await loadContext(MAYA);
  const r = checkNudge(ctx, { date: nextSunday(), time: '10:00', ...greenleaf() });
  assert.equal(r.decision.sent, true, r.decision.reason);
  assert.equal(r.nudge.offer.category, 'groceries');
  assert.equal(r.nudge.offer.partner.id, 'greenleaf');
  assert.ok(r.nudge.confidence >= NUDGE_RULES.minConfidence);
  assert.ok(r.nudge.reasons.some((x) => /Greenleaf/.test(x)) && r.nudge.reasons.some((x) => /Sundays/.test(x)), r.nudge.reasons.join(' | '));
});

test('same store on a Tuesday night stays quiet, and so does Sunday morning at home', async () => {
  const ctx = await loadContext(MAYA);
  const sunday = nextSunday();
  const tuesday = fromDay(todayDay() + ((9 - dayOfWeek(todayDay())) % 7 || 7));
  assert.equal(checkNudge(ctx, { date: tuesday, time: '20:30', ...greenleaf() }).decision.sent, false);
  const home = placesFor(ctx).home;
  assert.equal(checkNudge(ctx, { date: sunday, time: '10:00', lat: home.lat, lng: home.lng }).decision.sent, false);
});

test('caps: the same offer does not repeat within 48 hours, and coordinates are never stored', async () => {
  const ctx = await loadContext(MAYA);
  const m = { date: nextSunday(), time: '10:00', ...greenleaf(), record: true };
  assert.equal(checkNudge(ctx, m).decision.sent, true);
  const again = checkNudge(ctx, m);
  assert.equal(again.decision.sent, false);
  assert.match(again.decision.reason, /48 hours/);
  const saved = JSON.stringify(store.state.nudges[MAYA]);
  assert.ok(!/lat|lng|30\.3/.test(saved), saved);
});

test('only stores close by can nudge, and no location means no nudge', async () => {
  const ctx = await loadContext(MAYA);
  const sunday = nextSunday();
  const noLoc = checkNudge(ctx, { date: sunday, time: '10:00' });
  assert.equal(noLoc.decision.sent, false);
  assert.match(noLoc.decision.reason, /No location/);
  const far = checkNudge(ctx, { date: sunday, time: '10:00', lat: 30.2, lng: -81.4 });
  assert.equal(far.decision.sent, false);
  assert.match(far.decision.reason, /within 1 mile/);
});

test('limits stop pop-ups, not access: the earlier nudge stays in the recent list and can be reopened', async () => {
  const ctx = await loadContext(MAYA);
  const m = { date: nextSunday(), time: '10:00', ...greenleaf(), record: true };
  const first = checkNudge(ctx, m);
  assert.equal(first.decision.sent, true);
  // Same moment again: no new pop-up, but the earlier one comes back so the UI can offer "Open it again".
  const again = checkNudge(ctx, m);
  assert.equal(again.decision.sent, false);
  assert.equal(again.existing.nudge.id, first.nudge.id);
  // The member's list has it, with reasons but nothing location-based.
  const recent = recentNudges(ctx).nudges;
  assert.equal(recent.length, 1);
  assert.equal(recent[0].nudge.offer.id, first.nudge.offer.id);
  assert.ok(recent[0].nudge.reasons.every((r) => !/mi from/.test(r)), recent[0].nudge.reasons.join(' | '));
});

test('daily cap is configurable, and the demo can replay a moment with limits off', async () => {
  const ctx = await loadContext(MAYA);
  const saved = NUDGE_RULES.maxPerDay;
  NUDGE_RULES.maxPerDay = 1;
  try {
    const m = { date: nextSunday(), time: '10:00', ...greenleaf(), record: true };
    assert.equal(checkNudge(ctx, m).decision.sent, true);
    const capped = checkNudge(ctx, m);
    assert.equal(capped.decision.sent, false);
    assert.match(capped.decision.reason, /pop-ups today/);
    const replay = checkNudge(ctx, { ...m, ignoreLimits: true });
    assert.equal(replay.decision.sent, true);
    assert.equal(replay.decision.limitsIgnored, true);
  } finally {
    NUDGE_RULES.maxPerDay = saved;
  }
});

// Persona data depends on the day `npm run seed` ran, so this test checks the rule across every
// partner store and a whole week of moments instead of one hard-coded case: whenever an offer at the
// store she's standing in qualifies, the nudge must be for that store, not one down the street.
test('the store they are standing at wins over a nearby one', async () => {
  const ctx = await loadContext(MAYA);
  const stores = placesFor(ctx).stores;
  const times = ['07:30', '10:00', '12:30', '17:30', '20:00'];
  let checked = 0;
  for (const store of stores) {
    for (let d = 1; d <= 7; d++) {
      for (const time of times) {
        const r = checkNudge(ctx, { date: fromDay(todayDay() + d), time, lat: store.lat, lng: store.lng, ignoreLimits: true });
        // Clear margins so rounding in the response can't flip a borderline case.
        const atStoreQualifies = r.candidates.some((c) => c.distanceMiles <= NUDGE_RULES.nearMiles && c.liveProbability > NUDGE_RULES.minConfidence + 0.01 && c.value >= NUDGE_RULES.minValue);
        if (!r.nudge || !atStoreQualifies) continue;
        checked++;
        assert.ok(r.nudge.distanceMiles <= NUDGE_RULES.nearMiles, `At ${store.name}, ${r.moment.weekday} ${time}: nudged ${r.nudge.offer.partner.name} ${r.nudge.distanceMiles} mi away`);
      }
    }
  }
  assert.ok(checked > 0, 'expected at least one moment where a store she is standing in qualifies');
});

test('bad input is rejected', async () => {
  const ctx = await loadContext(MAYA);
  assert.throws(() => checkNudge(ctx, { date: fromDay(todayDay() + 60), time: '10:00' }), /next 14 days/);
  assert.throws(() => checkNudge(ctx, { date: nextSunday(), time: '10:00', lat: 'x', lng: 2 }), /Invalid location/);
  assert.throws(() => checkNudge(ctx, { date: nextSunday(), time: '25:00' }), /valid time/);
});

test('week view covers 7 days x 4 blocks and nearness raises the odds', async () => {
  const ctx = await loadContext(MAYA);
  const w = weekView(ctx);
  assert.equal(w.days.length, 7);
  assert.ok(w.days.every((d) => d.blocks.length === 4));
  // "best" must really be the highest chance in the grid (which category wins depends on the seed day).
  const top = Math.max(...w.days.flatMap((d) => d.blocks.flatMap((b) => Object.values(b.probs))));
  assert.equal(w.best.probability, top);
  assert.ok(proximityBoost(0.05) > proximityBoost(1) && proximityBoost(null) === 0);
});
