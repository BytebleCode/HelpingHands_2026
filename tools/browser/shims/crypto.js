// In-browser stand-in for node:crypto. crypto.randomUUID needs a secure (https) page, so this
// falls back to getRandomValues, which works on plain http too.
export function randomUUID() {
  if (globalThis.crypto?.randomUUID) {
    try { return globalThis.crypto.randomUUID(); } catch { /* insecure context */ }
  }
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export default { randomUUID };
