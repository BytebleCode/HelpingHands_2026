// Pulls real charity records for a market: legal name + IRS address from ProPublica's Nonprofit Explorer
// (IRS Business Master File data) and coordinates from the US Census Geocoder. Writes
// data/seed/markets/<market>.json, which the seed reads offline.
//   npm run pull-charities -- jacksonville-fl
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const marketId = process.argv[2] || 'jacksonville-fl';
const market = (await import(`./markets/${marketId}.js`)).default;
const outDir = fileURLToPath(new URL('../data/seed/markets/', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const title = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

async function propublica(ein) {
  const res = await fetch(`https://projects.propublica.org/nonprofits/api/v2/organizations/${ein.replace('-', '')}.json`);
  if (!res.ok) throw new Error(`ProPublica ${res.status} for ${ein}`);
  const { organization: o, filings_with_data: filings = [] } = await res.json();
  const latest = filings[0];
  return {
    legalName: o.name, address: title(o.address || ''), city: title(o.city || ''), state: o.state, zip: (o.zipcode || '').slice(0, 5),
    ntee: o.ntee_code || null, subsection: o.subsection_code,
    latestFiling: latest ? { year: latest.tax_prd_yr, revenue: latest.totrevenue ?? null } : null,
  };
}

async function geocode(address) {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
  const res = await fetch(url);
  const m = (await res.json()).result?.addressMatches?.[0];
  return m ? { lat: Math.round(m.coordinates.y * 1e5) / 1e5, lng: Math.round(m.coordinates.x * 1e5) / 1e5, matched: m.matchedAddress } : null;
}

const charities = [];
for (const c of market.charities) {
  const irs = await propublica(c.ein);
  const full = `${irs.address}, ${irs.city}, ${irs.state} ${irs.zip}`;
  let geo = await geocode(full);
  if (!geo) geo = await geocode(`${irs.city}, ${irs.state} ${irs.zip}`);
  if (!geo) geo = { lat: market.center[0], lng: market.center[1], matched: null };
  console.log(`${c.ein}  ${c.name.padEnd(46)} ${irs.legalName}  →  ${full}  ${geo.matched ? '✓' : '(approx)'}`);
  charities.push({ ...c, irs, location: { lat: geo.lat, lng: geo.lng, geocoded: !!geo.matched }, address: full });
  await sleep(300);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}${marketId}.json`, JSON.stringify({
  market: { id: market.id, name: market.name, state: market.state, center: market.center, neighborhoods: market.neighborhoods },
  pulledAt: new Date().toISOString(),
  sources: ['ProPublica Nonprofit Explorer API (IRS Exempt Organizations data)', 'US Census Geocoder'],
  charities,
}, null, 2));
console.log(`\n${charities.length} charities written to data/seed/markets/${marketId}.json`);
