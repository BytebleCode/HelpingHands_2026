// Distances between members, charities and partner stores.
export function haversineMiles(a, b) {
  const R = 3958.8;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function originFor(person, { lat, lng } = {}) {
  const la = Number(lat), ln = Number(lng);
  if (Number.isFinite(la) && Number.isFinite(ln) && (la || ln)) return { lat: la, lng: ln, source: 'device' };
  return { ...person.location, source: 'profile' };
}
