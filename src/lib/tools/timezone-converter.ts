/** Time zone helpers built on Intl, which ships the IANA tz database with the browser. */

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

const isValidDate = (d: Date) => !Number.isNaN(d.getTime());

function wallParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute'), second: get('second') };
}

/** Offset of `timeZone` from UTC at `date`, in minutes (New York in winter is -300). */
export function getOffsetMinutes(date: Date, timeZone: string): number {
  const p = wallParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** "YYYY-MM-DDTHH:mm" wall-clock time in `timeZone`, the format a datetime-local input expects. */
export function toDateTimeLocalValue(date: Date, timeZone: string): string {
  if (!isValidDate(date)) return '';
  const p = wallParts(date, timeZone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * The instant at which the wall clock in `timeZone` reads `value`
 * ("YYYY-MM-DDTHH:mm[:ss]"). Times skipped by a DST jump resolve forward by
 * the size of the jump; repeated times resolve to the first (earlier) one.
 */
export function fromDateTimeLocalValue(value: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!m || !isValidTimeZone(timeZone)) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, Number.isNaN(s) ? 0 : s);
  if (Number.isNaN(wall)) return null;
  // Try the offsets in force a day either side of the wall time; keep the earliest instant that round-trips.
  const offsets = new Set([
    getOffsetMinutes(new Date(wall - 86400000), timeZone),
    getOffsetMinutes(new Date(wall), timeZone),
    getOffsetMinutes(new Date(wall + 86400000), timeZone),
  ]);
  const candidates = [...offsets].map((o) => wall - o * 60000).sort((a, b) => a - b);
  const exact = candidates.find((t) => toDateTimeLocalValue(new Date(t), timeZone) === value.slice(0, 16));
  if (exact !== undefined) return new Date(exact);
  // Nonexistent local time (spring-forward gap): use the pre-transition offset, which lands after the gap.
  return new Date(Math.max(...candidates));
}

/**
 * Order of the date part: 'mdy' (US, 01/15/2026), 'dmy' (UK, India, Australia,
 * 15/01/2026) or 'ymd' (ISO 8601 and the Canadian short date, 2026-01-15).
 */
export type DateOrder = 'mdy' | 'dmy' | 'ymd';
export const DATE_ORDERS: readonly DateOrder[] = ['mdy', 'dmy', 'ymd'];
export const parseDateOrder = (value: unknown): DateOrder => (DATE_ORDERS.includes(value as DateOrder) ? (value as DateOrder) : 'mdy');

/**
 * "MM/DD/YYYY, HH:mm:ss" in 24-hour time, never "24:00". With `order` 'dmy'
 * it is "DD/MM/YYYY, HH:mm:ss" and with 'ymd' "YYYY-MM-DD, HH:mm:ss".
 */
export function formatInTimeZone(date: Date, timeZone: string, order: DateOrder = 'mdy'): string {
  if (!isValidDate(date)) return 'Invalid date';
  if (order !== 'mdy') {
    if (!isValidTimeZone(timeZone)) return 'Invalid timezone';
    const p = wallParts(date, timeZone);
    const time = `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
    return order === 'dmy' ? `${pad(p.day)}/${pad(p.month)}/${pad(p.year, 4)}, ${time}` : `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}, ${time}`;
  }
  try {
    return date.toLocaleString('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    return 'Invalid timezone';
  }
}

/** Parse the ?time= share parameter; null when it is missing or not a date. */
export function parseTimeParam(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isValidDate(d) ? d : null;
}

/** Parse the ?timezones= share parameter, keeping only real IANA names. */
export function parseZonesParam(value: string | null): string[] | null {
  if (!value) return null;
  for (const candidate of [value, safeDecode(value)]) {
    try {
      const zones = JSON.parse(candidate);
      if (Array.isArray(zones)) {
        const valid = [...new Set(zones.filter((z): z is string => typeof z === 'string' && isValidTimeZone(z)))];
        return valid.length ? valid : null;
      }
    } catch {
      // try the next form
    }
  }
  return null;
}

/**
 * A comma-separated list of IANA zone names (a market's default cards or quick-add
 * buttons), keeping only valid, distinct names; `fallback` when none are left.
 */
export function parseZoneList(value: unknown, fallback: string[]): string[] {
  const zones = [...new Set(String(value ?? '').split(',').map((z) => z.trim()).filter((z) => isValidTimeZone(z)))];
  return zones.length ? zones : fallback;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
