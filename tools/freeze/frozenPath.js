// Maps an API request to the static JSON file that holds its frozen response.
// Shared by the capture script (Node) and the frozen client (browser).

// Routes whose response doesn't depend on the signed-in member.
const SHARED = ['/personas', '/neighbors', '/sandbox/merchants', '/demo/overview', '/demo/compare', '/demo/population', '/demo/fis'];
// Query params that don't pick a different snapshot: the member is already in the path, and
// browser location is ignored (the snapshot uses each member's home area).
const IGNORED = new Set(['lat', 'lng', 'member', 'hhid']);

export function frozenPath(path, hhid) {
  const [route, query = ''] = path.split('?');
  const params = [...new URLSearchParams(query)].filter(([k]) => !IGNORED.has(k)).sort(([a], [b]) => a.localeCompare(b));
  const suffix = params.map(([k, v]) => `${k}=${v}`).join('&').replace(/[^A-Za-z0-9._-]+/g, '_');
  const file = `${route}${suffix ? `__${suffix}` : ''}.json`;
  // Relative, so the site works from any folder.
  return SHARED.includes(route) ? `api/shared${file}` : `api/m/${hhid}${file}`;
}
