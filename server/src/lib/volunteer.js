// Nearby charities and volunteer shifts, sorted by distance from the member.
import { store, catalog, newId } from './store.js';
import { HttpError } from './context.js';
import { journey, journeyDelta } from './giving.js';
import { todayDay, fromDay } from './dates.js';

export function haversineMiles(a, b) {
  const R = 3958.8;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const activeSignups = (oppId) => store.state.signups.filter((s) => s.oppId === oppId && !s.historical && s.status !== 'cancelled');

export function originFor(person, { lat, lng } = {}) {
  const la = Number(lat), ln = Number(lng);
  if (Number.isFinite(la) && Number.isFinite(ln) && (la || ln)) return { lat: la, lng: ln, source: 'device' };
  return { ...person.location, source: 'profile' };
}

export function listVolunteer(ctx, { lat, lng, radius = 30, cause } = {}) {
  const origin = originFor(ctx.person, { lat, lng });
  const today = todayDay();
  const charities = Object.fromEntries(catalog.charities.map((c) => [c.id, { ...c, distance: Math.round(haversineMiles(origin, c.location) * 10) / 10 }]));
  const mine = store.state.signups.filter((s) => s.hhid === ctx.hhid && !s.historical && s.status !== 'cancelled');

  const opportunities = catalog.opportunities
    .map((o) => {
      const c = charities[o.charityId];
      const taken = o.taken + activeSignups(o.id).length;
      const my = mine.find((s) => s.oppId === o.id);
      return {
        id: o.id, title: o.title, description: o.desc, dateIso: fromDay(today + o.dayOffset), start: o.start, hours: o.hours,
        spots: o.spots, spotsLeft: Math.max(0, o.spots - taken), familyFriendly: o.familyFriendly, skills: o.skills,
        charity: { id: c.id, name: c.name, cause: c.cause, causeLabel: c.causeLabel, image: c.image, address: c.address, website: c.website, mailingOnly: c.mailingOnly },
        distance: c.distance, approximate: c.location.approximate, impactPoints: Math.round(o.hours * 500), sample: !!o.sample,
        signup: my ? { id: my.id, status: my.status, hours: my.hours } : null,
      };
    })
    .filter((o) => o.distance <= Number(radius) && (!cause || o.charity.cause === cause))
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.distance - b.distance);

  const nearby = Object.values(charities)
    .filter((c) => c.distance <= Number(radius) && (!cause || c.cause === cause))
    .map((c) => ({
      id: c.id, name: c.name, cause: c.cause, causeLabel: c.causeLabel, mission: c.mission, image: c.image, address: c.address,
      location: c.location, distance: c.distance, approximate: c.location.approximate, website: c.website, mailingOnly: c.mailingOnly, ein: c.ein,
      openShifts: opportunities.filter((o) => o.charity.id === c.id && o.spotsLeft > 0).length,
    }))
    .sort((a, b) => a.distance - b.distance);

  return { origin, radius: Number(radius), causes: catalog.causes, opportunities, charities: nearby, mySignups: opportunities.filter((o) => o.signup) };
}

export function signup(ctx, oppId) {
  const opp = catalog.opportunities.find((o) => o.id === oppId);
  if (!opp) throw new HttpError(404, 'Opportunity not found');
  if (store.state.signups.some((s) => s.hhid === ctx.hhid && s.oppId === oppId && !s.historical && s.status !== 'cancelled')) {
    throw new HttpError(409, 'You are already signed up');
  }
  if (opp.spots - opp.taken - activeSignups(oppId).length <= 0) throw new HttpError(422, 'This shift is full');
  const s = { id: newId('vol'), hhid: ctx.hhid, oppId, status: 'registered', hours: 0, ts: new Date().toISOString(), dateIso: fromDay(todayDay() + opp.dayOffset) };
  store.state.signups.push(s);
  store.save();
  return s;
}

export function cancel(ctx, signupId) {
  const s = store.state.signups.find((x) => x.id === signupId && x.hhid === ctx.hhid);
  if (!s) throw new HttpError(404, 'Signup not found');
  if (s.status === 'completed') throw new HttpError(422, 'Completed shifts cannot be cancelled');
  s.status = 'cancelled';
  store.save();
  return s;
}

export function checkIn(ctx, signupId, hours) {
  const s = store.state.signups.find((x) => x.id === signupId && x.hhid === ctx.hhid);
  if (!s || s.status === 'cancelled') throw new HttpError(404, 'Signup not found');
  if (s.status === 'completed') throw new HttpError(409, 'Already checked in');
  const opp = catalog.opportunities.find((o) => o.id === s.oppId);
  const h = Math.min(Number(hours) || opp.hours, opp.hours + 2);
  const before = journey(ctx.hhid);
  Object.assign(s, { status: 'completed', hours: h, completedTs: new Date().toISOString() });
  store.save();
  return { signup: s, ...journeyDelta(ctx.hhid, before) };
}
