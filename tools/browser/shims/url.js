// In-browser stand-in for node:url. Server modules see a file:///hh/... URL for import.meta.url
// (set by the build), so paths resolve to /hh/server/data/... and fs.js keys files by name.
export const fileURLToPath = (url) => new URL(String(url)).pathname;
export default { fileURLToPath };
