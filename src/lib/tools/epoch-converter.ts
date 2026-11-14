export type EpochUnit = 'seconds' | 'milliseconds' | 'nanoseconds';

/** Picks the unit whose reading lands closest to now (10 or fewer digits can be seconds, 19+ nanoseconds). */
export function detectEpochUnit(value: string, nowMs = Date.now()): EpochUnit | null {
  const num = parseInt(value, 10);
  if (Number.isNaN(num)) return null;
  const digits = value.trim().replace(/^-/, '').length;
  const sDiff = Math.abs(num - Math.floor(nowMs / 1000));
  const msDiff = Math.abs(num - nowMs);
  const nsDiff = Math.abs(num - nowMs * 1e6);
  if (digits <= 10 && sDiff < msDiff && sDiff < nsDiff) return 'seconds';
  if (digits >= 19 && nsDiff < sDiff && nsDiff < msDiff) return 'nanoseconds';
  return 'milliseconds';
}

export function epochToDate(value: string, unit: EpochUnit): Date | null {
  const num = parseInt(value, 10);
  if (Number.isNaN(num)) return null;
  const ms = unit === 'seconds' ? num * 1000 : unit === 'nanoseconds' ? Math.floor(num / 1e6) : num;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Formats a date as the local wall time a datetime-local input expects (YYYY-MM-DDTHH:mm:ss). */
export function toDatetimeLocal(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

/** Reads a datetime-local value (local time) and returns the epoch in the given unit, or null when empty/invalid. */
export function datetimeLocalToEpoch(value: string, unit: EpochUnit): { epoch: string; date: Date } | null {
  if (!value) return null;
  const date = new Date(value);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return null;
  const epoch = unit === 'seconds' ? String(Math.floor(ms / 1000)) : unit === 'nanoseconds' ? (BigInt(ms) * 1000000n).toString() : String(ms);
  return { epoch, date };
}
