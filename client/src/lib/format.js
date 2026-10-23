export const money = (n, digits = 0) =>
  `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
export const money2 = (n) => money(n, 2);
export const pts = (n) => Math.round(n).toLocaleString('en-US');
export const pct = (x, digits = 0) => `${(x * 100).toFixed(digits)}%`;
export const ordinal = (n) => {
  const v = Math.round(n);
  const s = ['th', 'st', 'nd', 'rd'];
  const m = v % 100;
  return `${v}${s[(m - 20) % 10] || s[m] || s[0]}`;
};

const parseDay = (iso) => new Date(`${iso.slice(0, 10)}T12:00:00`);
export const shortDate = (iso) => parseDay(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const longDate = (iso) => parseDay(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
export const weekday = (iso) => parseDay(iso).toLocaleDateString('en-US', { weekday: 'short' });
export const dayNum = (iso) => parseDay(iso).getDate();
export const monthShort = (iso) => parseDay(iso).toLocaleDateString('en-US', { month: 'short' });
export const time12 = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
export const relTime = (ts) => {
  const d = (Date.now() - new Date(ts).getTime()) / 86400000;
  if (d < 1 / 24) return 'Just now';
  if (d < 1) return `${Math.round(d * 24)}h ago`;
  if (d < 2) return 'Yesterday';
  if (d < 30) return `${Math.round(d)} days ago`;
  return shortDate(ts);
};
export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};
export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** Formats a model feature's raw value for display. */
export const featureValue = (f) => {
  const monthly = ['logInflow', 'logSpend', 'logAltFinance'].includes(f.key);
  if (f.fmt === 'money') return `${money(f.value)}${monthly ? '/mo' : ''}`;
  if (f.fmt === 'pct') return pct(f.value);
  if (f.fmt === 'bool') return f.value ? 'Yes' : 'None';
  if (f.fmt === 'ratio') return f.value.toFixed(2);
  return f.value.toFixed(1);
};
