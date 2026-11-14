export type EpochUnit = 'seconds' | 'milliseconds' | 'nanoseconds';

const NS_PER_MS = 1_000_000n;

/**
 * Parse a Unix timestamp in the given unit. Integers go through BigInt so
 * 19-digit nanosecond values are not rounded before conversion. Returns null
 * for empty, non-numeric or out-of-range input.
 */
export function epochToDate(input: string, unit: EpochUnit): Date | null {
  const s = input.trim();
  let ms: number;
  if (/^-?\d+$/.test(s)) {
    const big = BigInt(s);
    ms = unit === 'seconds' ? Number(big * 1000n) : unit === 'milliseconds' ? Number(big) : Number(big / NS_PER_MS);
  } else if (/^-?\d+\.\d+$/.test(s)) {
    const n = Number(s);
    ms = unit === 'seconds' ? n * 1000 : unit === 'milliseconds' ? n : n / 1e6;
    ms = Math.floor(ms);
  } else {
    return null;
  }
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function dateToEpoch(date: Date, unit: EpochUnit): string {
  const ms = date.getTime();
  if (unit === 'seconds') return Math.floor(ms / 1000).toString();
  if (unit === 'milliseconds') return ms.toString();
  return (BigInt(ms) * NS_PER_MS).toString();
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Value for an <input type="datetime-local" step="1">: the date's local wall
 * time. Using toISOString().slice() here writes UTC into a local field, which
 * shifts the instant by the UTC offset on the next "To Unix".
 */
export function toDateTimeLocalSeconds(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
