// Calendar dates as integer day numbers (days since 1970-01-01) to stay clear of time zones.
export const DAY_MS = 86_400_000;

export const toDay = (iso) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS);
export const fromDay = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);
export const dayOfWeek = (n) => (n + 4) % 7; // 0 = Sunday
export const dayOfMonth = (n) => new Date(n * DAY_MS).getUTCDate();

export function todayDay() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  return toDay(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
}

export const todayIso = () => fromDay(todayDay());
