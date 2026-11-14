/**
 * Pure logic for the everyday calculators: age, time card, time (durations
 * and clock times), GPA and final grade. No React here, so the regression
 * tests exercise exactly what the UI shows.
 *
 * Dates are handled as plain calendar dates ({ y, m, d }) and converted to
 * day numbers with Date.UTC, so time zones and daylight-saving changes can
 * never shift a birthday by a day.
 */
import { msg, built } from '../../msg';

export type Result<T> = { ok: true; value: T; error?: undefined } | { ok: false; error: string; value?: undefined };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Round to a number of decimals without binary drift (2.675 -> 2.68). */
export function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return value;
  const f = 10 ** decimals;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * f + 1e-9)) / f;
}

// ---------------------------------------------------------------------------
// Calendar dates
// ---------------------------------------------------------------------------

export type CalDate = { y: number; m: number; d: number }; // m is 1-12

export const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y: number, m: number) => [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

/** Parse "YYYY-MM-DD" (the value of an <input type="date">). */
export function parseISODate(s: string): CalDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s || '').trim());
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

export const toISO = (c: CalDate) => `${String(c.y).padStart(4, '0')}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`;

/** Today's date in the user's local time zone. */
export function localToday(now = new Date()): CalDate {
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

/** Days since 1970-01-01 for a calendar date (no time zone involved). */
export const dayNumber = (c: CalDate) => Math.round(Date.UTC(c.y, c.m - 1, c.d) / 86400000);
export const fromDayNumber = (n: number): CalDate => {
  const dt = new Date(n * 86400000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
};
export const compareDates = (a: CalDate, b: CalDate) => dayNumber(a) - dayNumber(b);

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const weekday = (c: CalDate) => WEEKDAYS[new Date(Date.UTC(c.y, c.m - 1, c.d)).getUTCDay()];

/** How a 29 February birthday is observed in a common year. */
export type LeapConvention = 'mar1' | 'feb28';

/**
 * Add whole months to a date. If the day does not exist in the target month
 * it is clamped to the month's last day (31 Jan + 1 month = 28 or 29 Feb),
 * except that a 29 February date landing on a common-year February follows
 * the chosen leap-day convention (1 March or 28 February).
 */
export function addMonths(c: CalDate, months: number, leap: LeapConvention = 'mar1'): CalDate {
  const total = c.y * 12 + (c.m - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  if (c.m === 2 && c.d === 29 && m === 2 && !isLeapYear(y)) {
    return leap === 'mar1' ? { y, m: 3, d: 1 } : { y, m: 2, d: 28 };
  }
  return { y, m, d: Math.min(c.d, daysInMonth(y, m)) };
}

export type AgeResult = {
  years: number;
  months: number;
  days: number;
  totalMonths: number;
  totalWeeks: number;
  weeksRemainderDays: number;
  totalDays: number;
  totalHours: number;
  totalMinutes: number;
  nextBirthday: CalDate;
  nextBirthdayAge: number;
  daysToNextBirthday: number;
  nextBirthdayWeekday: string;
  isBirthdayToday: boolean;
  bornWeekday: string;
  leapDayBirth: boolean;
};

/**
 * Exact age from a birth date to a target date, in completed years, months
 * and days (the anniversary method: count whole years, then whole months,
 * then the remaining days).
 */
export function calculateAge(birth: CalDate, on: CalDate, leap: LeapConvention = 'mar1'): Result<AgeResult> {
  if (compareDates(on, birth) < 0) return fail(msg('The "age on" date is before the date of birth.'));
  // Whole months completed: largest n with addMonths(birth, n) <= on.
  let n = (on.y - birth.y) * 12 + (on.m - birth.m);
  while (n > 0 && compareDates(addMonths(birth, n, leap), on) > 0) n--;
  while (compareDates(addMonths(birth, n + 1, leap), on) <= 0) n++;
  const anchor = addMonths(birth, n, leap);
  const days = dayNumber(on) - dayNumber(anchor);
  const totalDays = dayNumber(on) - dayNumber(birth);
  const years = Math.floor(n / 12);

  // Next birthday: the first anniversary on or after the target date.
  let k = years;
  let next = addMonths(birth, 12 * k, leap);
  if (compareDates(next, on) < 0) { k++; next = addMonths(birth, 12 * k, leap); }
  const isToday = compareDates(next, on) === 0 && k > 0;
  if (compareDates(next, on) === 0 && k === 0) { k = 1; next = addMonths(birth, 12, leap); }
  return ok({
    years,
    months: n % 12,
    days,
    totalMonths: n,
    totalWeeks: Math.floor(totalDays / 7),
    weeksRemainderDays: totalDays % 7,
    totalDays,
    totalHours: totalDays * 24,
    totalMinutes: totalDays * 1440,
    nextBirthday: next,
    nextBirthdayAge: k,
    daysToNextBirthday: dayNumber(next) - dayNumber(on),
    nextBirthdayWeekday: weekday(next),
    isBirthdayToday: isToday,
    bornWeekday: weekday(birth),
    leapDayBirth: birth.m === 2 && birth.d === 29,
  });
}

/** Generations as defined by Pew Research Center (birth years). */
export const GENERATIONS = [
  { name: msg('Greatest Generation'), from: 1901, to: 1927 },
  { name: msg('Silent Generation'), from: 1928, to: 1945 },
  { name: msg('Baby Boomers'), from: 1946, to: 1964 },
  { name: msg('Generation X'), from: 1965, to: 1980 },
  { name: msg('Millennials'), from: 1981, to: 1996 },
  { name: msg('Generation Z'), from: 1997, to: 2012 },
  { name: msg('Generation Alpha'), from: 2013, to: 2025 },
] as const;

export function generationFor(year: number): { name: string; from: number; to: number; pew: boolean } | null {
  const g = GENERATIONS.find((x) => year >= x.from && year <= x.to);
  if (!g) return null;
  return { ...g, pew: g.name !== 'Generation Alpha' };
}

const ZODIAC: { sign: string; from: [number, number] }[] = [
  { sign: 'Capricorn', from: [1, 1] }, { sign: 'Aquarius', from: [1, 20] }, { sign: 'Pisces', from: [2, 19] },
  { sign: 'Aries', from: [3, 21] }, { sign: 'Taurus', from: [4, 20] }, { sign: 'Gemini', from: [5, 21] },
  { sign: 'Cancer', from: [6, 21] }, { sign: 'Leo', from: [7, 23] }, { sign: 'Virgo', from: [8, 23] },
  { sign: 'Libra', from: [9, 23] }, { sign: 'Scorpio', from: [10, 23] }, { sign: 'Sagittarius', from: [11, 22] },
  { sign: 'Capricorn', from: [12, 22] },
];

/** Western (tropical) sun sign using the usual newspaper date ranges. */
export function zodiacSign(c: CalDate): string {
  let s = 'Capricorn';
  for (const z of ZODIAC) if (c.m > z.from[0] || (c.m === z.from[0] && c.d >= z.from[1])) s = z.sign;
  return s;
}

// ---------------------------------------------------------------------------
// Clock times and durations
// ---------------------------------------------------------------------------

/** Parse "HH:MM" or "HH:MM:SS" (24-hour) into seconds after midnight. */
export function parseClock(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec((s || '').trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2], se = m[3] ? +m[3] : 0;
  if (h > 23 || mi > 59 || se > 59) return null;
  return h * 3600 + mi * 60 + se;
}

/** Format seconds after midnight as a clock time, 24h or 12h. */
export function formatClock(sec: number, h12 = false, withSeconds = false): string {
  const t = ((Math.round(sec) % 86400) + 86400) % 86400;
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const ss = withSeconds ? `:${String(s).padStart(2, '0')}` : '';
  if (!h12) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}${ss}`;
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')}${ss} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Format a number of minutes as h:mm (e.g. 2475 -> "41:15"). */
export function formatHMM(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const t = Math.round(Math.abs(minutes));
  return `${sign}${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export type DHMS = { days: number; hours: number; minutes: number; seconds: number };

/** Split a number of seconds into days, hours, minutes and seconds. */
export function splitSeconds(total: number): DHMS & { negative: boolean } {
  const negative = total < 0;
  let t = Math.round(Math.abs(total) * 1000) / 1000;
  const days = Math.floor(t / 86400); t -= days * 86400;
  const hours = Math.floor(t / 3600); t -= hours * 3600;
  const minutes = Math.floor(t / 60); t -= minutes * 60;
  return { negative, days, hours, minutes, seconds: round(t, 3) };
}

export const toSeconds = (p: Partial<DHMS>) =>
  (p.days || 0) * 86400 + (p.hours || 0) * 3600 + (p.minutes || 0) * 60 + (p.seconds || 0);

/** "1d 2h 03m 04s" style label; drops leading zero units. */
export function formatDuration(totalSeconds: number): string {
  const s = splitSeconds(totalSeconds);
  const parts: string[] = [];
  if (s.days) parts.push(`${s.days}d`);
  if (s.days || s.hours) parts.push(`${s.hours}h`);
  parts.push(`${s.minutes}m`);
  if (s.seconds) parts.push(`${s.seconds}s`);
  return (s.negative ? '-' : '') + parts.join(' ');
}

/** h:mm:ss with hours not wrapped at 24 (e.g. 27:30:00). */
export function formatHMS(totalSeconds: number): string {
  const neg = totalSeconds < 0;
  const t = Math.round(Math.abs(totalSeconds));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return `${neg ? '-' : ''}${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export type DurationRow = { sign: 1 | -1; days: number; hours: number; minutes: number; seconds: number };

/** Sum signed durations. Blank fields count as zero; negatives in a field are rejected. */
/** sumDurations' row errors, one whole message per field. */
const ROW_NOT_NUMBER = { days: msg('Row {n}: days must be a number.'), hours: msg('Row {n}: hours must be a number.'), minutes: msg('Row {n}: minutes must be a number.'), seconds: msg('Row {n}: seconds must be a number.') };
const ROW_NEGATIVE = { days: msg('Row {n}: enter days as a positive number and use the minus sign for subtraction.'), hours: msg('Row {n}: enter hours as a positive number and use the minus sign for subtraction.'), minutes: msg('Row {n}: enter minutes as a positive number and use the minus sign for subtraction.'), seconds: msg('Row {n}: enter seconds as a positive number and use the minus sign for subtraction.') };

export function sumDurations(rows: DurationRow[]): Result<{ totalSeconds: number; decimalHours: number; decimalMinutes: number }> {
  let total = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    for (const k of ['days', 'hours', 'minutes', 'seconds'] as const) {
      const v = r[k];
      if (!isNum(v)) return fail(built(ROW_NOT_NUMBER[k], { n: i + 1 }));
      if (v < 0) return fail(built(ROW_NEGATIVE[k], { n: i + 1 }));
    }
    total += r.sign * toSeconds(r);
  }
  return ok({ totalSeconds: total, decimalHours: total / 3600, decimalMinutes: total / 60 });
}

/** Parse "h:mm", "h:mm:ss" or "mm:ss"-free forms like "7:45" into seconds (hours may exceed 23). */
export function parseHMS(s: string): number | null {
  const t = (s || '').trim();
  const m = /^(-)?(\d+):([0-5]?\d)(?::([0-5]?\d(?:\.\d+)?))?$/.exec(t);
  if (!m) return null;
  const v = +m[2] * 3600 + +m[3] * 60 + (m[4] ? +m[4] : 0);
  return m[1] ? -v : v;
}

/** Decimal hours -> seconds, e.g. 7.75 h -> 27900 s (7:45:00). */
export const decimalHoursToSeconds = (h: number) => Math.round(h * 3600 * 1000) / 1000;

/** Time between two clock times; an end at or before the start is read as the next day. */
export function clockDifference(startSec: number, endSec: number): { seconds: number; overnight: boolean } {
  let diff = endSec - startSec;
  const overnight = diff < 0;
  if (overnight) diff += 86400;
  return { seconds: diff, overnight };
}

/** Add (or subtract) a duration to a clock time; returns the new time and how many days it moved. */
export function addToClock(startSec: number, deltaSec: number): { seconds: number; dayOffset: number } {
  const raw = startSec + deltaSec;
  const dayOffset = Math.floor(raw / 86400);
  return { seconds: raw - dayOffset * 86400, dayOffset };
}

// ---------------------------------------------------------------------------
// Time card
// ---------------------------------------------------------------------------

/** Round a punch (minutes after midnight) to the nearest increment; exact midpoints round up. */
export function roundPunch(minutes: number, increment: number): number {
  if (!increment || increment <= 1) return minutes;
  return Math.floor(minutes / increment + 0.5) * increment;
}

export type Rounding = 0 | 5 | 6 | 15;
export type TimeCardDay = { label: string; start: string; end: string; breakMinutes: number };
export type TimeCardDayResult = {
  label: string;
  worked: boolean;
  start?: number;
  end?: number;
  roundedStart?: number;
  roundedEnd?: number;
  overnight: boolean;
  breakMinutes: number;
  minutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
};

export type TimeCardOptions = {
  rounding: Rounding;
  weeklyThresholdHours: number | null;
  dailyThresholdHours: number | null;
  hourlyRate?: number;
  overtimeMultiplier?: number;
};

export type TimeCardResult = {
  days: TimeCardDayResult[];
  totalMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  dailyOvertimeMinutes: number;
  weeklyOvertimeMinutes: number;
  totalDecimal: number;
  regularPay?: number;
  overtimePay?: number;
  totalPay?: number;
};

/**
 * Weekly time card. Each day with both times filled counts; an end at or
 * before the start is an overnight shift. Rounding applies to each punch.
 * Overtime: hours over the daily limit first, then hours over the weekly
 * limit among the remaining straight-time hours (no double counting, as in
 * California's daily-plus-weekly rule).
 */
export function calculateTimeCard(days: TimeCardDay[], opts: TimeCardOptions): Result<TimeCardResult> {
  const out: TimeCardDayResult[] = [];
  for (const day of days) {
    const hasStart = (day.start || '').trim() !== '';
    const hasEnd = (day.end || '').trim() !== '';
    const brk = isNum(day.breakMinutes) ? day.breakMinutes : 0;
    if (!hasStart && !hasEnd) {
      out.push({ label: day.label, worked: false, overnight: false, breakMinutes: 0, minutes: 0, regularMinutes: 0, overtimeMinutes: 0 });
      continue;
    }
    if (!hasStart || !hasEnd) return fail(built(msg('{day}: enter both a start and an end time, or clear both.'), { day: day.label }));
    const s = parseClock(day.start), e = parseClock(day.end);
    if (s === null || e === null) return fail(built(msg('{day}: times must look like 09:00 or 17:30.'), { day: day.label }));
    if (brk < 0) return fail(built(msg('{day}: the break cannot be negative.'), { day: day.label }));
    const sm = Math.round(s / 60), em = Math.round(e / 60);
    const rs = roundPunch(sm, opts.rounding);
    let re = roundPunch(em, opts.rounding);
    const overnight = em <= sm;
    if (overnight) re += 1440;
    const span = re - rs;
    if (brk > span) return fail(built(msg('{day}: the break is longer than the shift.'), { day: day.label }));
    out.push({ label: day.label, worked: true, start: sm, end: em, roundedStart: rs, roundedEnd: re % 1440, overnight, breakMinutes: brk, minutes: span - brk, regularMinutes: 0, overtimeMinutes: 0 });
  }
  const daily = opts.dailyThresholdHours != null && opts.dailyThresholdHours > 0 ? opts.dailyThresholdHours * 60 : null;
  const weekly = opts.weeklyThresholdHours != null && opts.weeklyThresholdHours > 0 ? opts.weeklyThresholdHours * 60 : null;
  let straightSoFar = 0;
  let dailyOT = 0, weeklyOT = 0;
  for (const d of out) {
    if (!d.worked) continue;
    let reg = d.minutes, ot = 0;
    if (daily !== null && reg > daily) { ot += reg - daily; dailyOT += reg - daily; reg = daily; }
    if (weekly !== null && straightSoFar + reg > weekly) {
      const over = straightSoFar + reg - Math.max(weekly, straightSoFar);
      ot += over; weeklyOT += over; reg -= over;
    }
    straightSoFar += reg;
    d.regularMinutes = reg;
    d.overtimeMinutes = ot;
  }
  const totalMinutes = out.reduce((a, d) => a + d.minutes, 0);
  const regularMinutes = out.reduce((a, d) => a + d.regularMinutes, 0);
  const overtimeMinutes = totalMinutes - regularMinutes;
  const res: TimeCardResult = {
    days: out, totalMinutes, regularMinutes, overtimeMinutes, dailyOvertimeMinutes: dailyOT, weeklyOvertimeMinutes: weeklyOT,
    totalDecimal: round(totalMinutes / 60, 2),
  };
  if (isNum(opts.hourlyRate) && opts.hourlyRate > 0) {
    const mult = isNum(opts.overtimeMultiplier) ? opts.overtimeMultiplier : 1.5;
    res.regularPay = round((regularMinutes / 60) * opts.hourlyRate, 2);
    res.overtimePay = round((overtimeMinutes / 60) * opts.hourlyRate * mult, 2);
    res.totalPay = round(res.regularPay + res.overtimePay, 2);
  }
  return ok(res);
}

/** CSV for a time card (RFC 4180 quoting). */
export function timeCardCsv(r: TimeCardResult, h12 = false): string {
  const q = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [['Day', 'Start', 'End', 'Break (min)', 'Hours (h:mm)', 'Hours (decimal)', 'Regular (decimal)', 'Overtime (decimal)']];
  for (const d of r.days) {
    rows.push(d.worked
      ? [d.label, formatClock((d.roundedStart ?? 0) * 60, h12), formatClock((d.roundedEnd ?? 0) * 60, h12), String(d.breakMinutes), formatHMM(d.minutes), (d.minutes / 60).toFixed(2), (d.regularMinutes / 60).toFixed(2), (d.overtimeMinutes / 60).toFixed(2)]
      : [d.label, '', '', '', '0:00', '0.00', '0.00', '0.00']);
  }
  rows.push(['Total', '', '', '', formatHMM(r.totalMinutes), (r.totalMinutes / 60).toFixed(2), (r.regularMinutes / 60).toFixed(2), (r.overtimeMinutes / 60).toFixed(2)]);
  return rows.map((row) => row.map(q).join(',')).join('\n');
}

// ---------------------------------------------------------------------------
// GPA
// ---------------------------------------------------------------------------

export type GpaScaleId = 'standard' | 'plus43' | 'simple' | 'in10' | 'au7' | 'ph5' | 'ng5' | 'pk4';
export type GpaScale = {
  label: string;
  max: number;
  points: Record<string, number>;
  /** Letters offered in the grade picker (defaults to the US LETTERS). */
  letters?: readonly string[];
  /** Grades listed but left out of the average (defaults to US P/NP/W style marks). */
  excluded?: readonly string[];
  /** Percentage cut-offs for this scale; when absent, numbers up to `max` are read as grade points. */
  cutoffs?: { letter: string; min: number }[];
  /** With cut-offs: a number from 0 to `max` is a grade point from the transcript, anything above is a mark out of 100. */
  pointsUpToMax?: boolean;
  /** Lowest valid grade point (1.00 on the Philippine scale). */
  min?: number;
  /** 1.00 is the best grade (Philippine GWA), so a lower average is better. */
  lowerIsBetter?: boolean;
};
export const GPA_SCALES: Record<GpaScaleId, GpaScale> = {
  standard: {
    label: msg('4.0 scale with plus and minus (A+ = 4.0)'),
    max: 4,
    points: { 'A+': 4.0, A: 4.0, 'A-': 3.7, 'B+': 3.3, B: 3.0, 'B-': 2.7, 'C+': 2.3, C: 2.0, 'C-': 1.7, 'D+': 1.3, D: 1.0, 'D-': 0.7, F: 0 },
  },
  plus43: {
    label: msg('4.3 scale (A+ = 4.3)'),
    max: 4.3,
    points: { 'A+': 4.3, A: 4.0, 'A-': 3.7, 'B+': 3.3, B: 3.0, 'B-': 2.7, 'C+': 2.3, C: 2.0, 'C-': 1.7, 'D+': 1.3, D: 1.0, 'D-': 0.7, F: 0 },
  },
  simple: {
    label: msg('4.0 scale without plus or minus'),
    max: 4,
    points: { 'A+': 4, A: 4, 'A-': 4, 'B+': 3, B: 3, 'B-': 3, 'C+': 2, C: 2, 'C-': 2, 'D+': 1, D: 1, 'D-': 1, F: 0 },
  },
  /**
   * India, UGC Choice Based Credit System 10-point scale: O 10, A+ 9, A 8, B+ 7, B 6, C 5, P 4, F 0, Ab (absent) 0.
   * Marks-to-grade bands are set by each university, so a number is read as the grade point itself (0 to 10).
   */
  in10: {
    label: msg('India 10-point SGPA/CGPA (UGC CBCS: O = 10)'),
    max: 10,
    points: { O: 10, 'A+': 9, A: 8, 'B+': 7, B: 6, C: 5, P: 4, F: 0, AB: 0 },
    letters: ['O', 'A+', 'A', 'B+', 'B', 'C', 'P', 'F', 'Ab'],
    excluded: [],
  },
  /**
   * Australia, 7-point GPA (for example UTS from 2020): HD 7, D 6, C/CR 5, P 4, fail 0,
   * with the common mark bands HD 85+, D 75-84, C 65-74, P 50-64, fail below 50.
   */
  au7: {
    label: msg('Australia 7-point GPA (HD = 7)'),
    max: 7,
    points: { HD: 7, D: 6, C: 5, CR: 5, P: 4, PS: 4, F: 0, N: 0, Z: 0, FL: 0 },
    letters: ['HD', 'D', 'CR', 'P', 'F'],
    excluded: ['W', 'S', 'U', 'NC', 'AW'],
    cutoffs: [{ letter: 'HD', min: 85 }, { letter: 'D', min: 75 }, { letter: 'CR', min: 65 }, { letter: 'P', min: 50 }, { letter: 'F', min: 0 }],
  },
  /**
   * Philippines, University of the Philippines grading (Revised UP Code Art. 369): 1.00 and 1.25 excellent,
   * 1.50 and 1.75 very good, 2.00 and 2.25 good, 2.50 and 2.75 satisfactory, 3.00 pass, 4.00 conditional,
   * 5.00 fail. The General Weighted Average (GWA) is the unit-weighted mean, and lower is better.
   * Qualitative marks (P, F, S, U) and INC/DRP are left out of the average.
   */
  ph5: {
    label: msg('Philippines GWA, 1.00 to 5.00 (1.00 = highest)'),
    max: 5,
    min: 1,
    lowerIsBetter: true,
    points: { '1.00': 1, '1.25': 1.25, '1.50': 1.5, '1.75': 1.75, '2.00': 2, '2.25': 2.25, '2.50': 2.5, '2.75': 2.75, '3.00': 3, '4.00': 4, '5.00': 5 },
    letters: ['1.00', '1.25', '1.50', '1.75', '2.00', '2.25', '2.50', '2.75', '3.00', '4.00', '5.00', 'INC', 'DRP'],
    excluded: ['P', 'F', 'S', 'U', 'INC', 'DRP', 'W'],
  },
  /**
   * Nigeria, NUC 5-point scale (CCMAS 2023, Table 1.2): 70-100 A 5, 60-69 B 4, 50-59 C 3, 45-49 D 2,
   * 40-44 E 1, 0-39 F 0. Every course taken, passed or failed, counts in the GPA.
   */
  ng5: {
    label: msg('Nigeria 5-point CGPA (NUC: A = 5)'),
    max: 5,
    points: { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 },
    letters: ['A', 'B', 'C', 'D', 'E', 'F'],
    excluded: [],
    cutoffs: [{ letter: 'A', min: 70 }, { letter: 'B', min: 60 }, { letter: 'C', min: 50 }, { letter: 'D', min: 45 }, { letter: 'E', min: 40 }, { letter: 'F', min: 0 }],
    pointsUpToMax: true,
  },
  /**
   * Pakistan, HEC fractionalized grading (semester system, HEC examination policy guidelines 13.1): letters take
   * the top of their HEC grade-point band (A 4.00, A- 3.66, B+ 3.33 ... D 1.00) and marks convert at
   * 85, 80, 75, 71, 68, 64, 61, 58, 54 and 50. A grade point typed from the transcript is used as it is. W does not count.
   */
  pk4: {
    label: msg('Pakistan HEC 4.0 CGPA (A = 85% and above)'),
    max: 4,
    points: { A: 4, 'A-': 3.66, 'B+': 3.33, B: 3, 'B-': 2.66, 'C+': 2.33, C: 2, 'C-': 1.66, 'D+': 1.3, D: 1, F: 0 },
    letters: ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F'],
    excluded: ['W'],
    cutoffs: [
      { letter: 'A', min: 85 }, { letter: 'A-', min: 80 }, { letter: 'B+', min: 75 }, { letter: 'B', min: 71 }, { letter: 'B-', min: 68 },
      { letter: 'C+', min: 64 }, { letter: 'C', min: 61 }, { letter: 'C-', min: 58 }, { letter: 'D+', min: 54 }, { letter: 'D', min: 50 }, { letter: 'F', min: 0 },
    ],
    pointsUpToMax: true,
  },
};

/**
 * What a cumulative average means on the market scales, from the rule its source sets:
 * - ng5: NUC class of degree (CCMAS Table 1.4), on the CGPA expressed to two decimal places;
 * - ph5: University of the Philippines Latin honours (Revised UP Code Art. 410: summa 1.20, magna 1.45, cum laude 1.75 or better);
 * - pk4: HEC minimum CGPA to complete a BS degree (2.00) or MS/MPhil (2.50).
 */
export function gpaStanding(scale: GpaScaleId, cgpa: number): { label: string; note: string } | null {
  if (!Number.isFinite(cgpa)) return null;
  const v = Math.round(cgpa * 100) / 100;
  if (scale === 'ng5') {
    const label = v >= 4.5 ? msg('First Class Honours') : v >= 3.5 ? msg('Second Class Honours (Upper Division)') : v >= 2.4 ? msg('Second Class Honours (Lower Division)') : v >= 1.5 ? msg('Third Class Honours') : v >= 1 ? msg('Pass') : msg('Below a pass degree');
    return { label, note: built(msg('CGPA {value}: First 4.50-5.00, 2:1 3.50-4.49, 2:2 2.40-3.49, Third 1.50-2.39, Pass 1.00-1.49 (NUC)'), { value: v.toFixed(2) }) };
  }
  if (scale === 'ph5') {
    const label = v <= 1.2 ? msg('Summa cum laude range') : v <= 1.45 ? msg('Magna cum laude range') : v <= 1.75 ? msg('Cum laude range') : msg('Outside the UP honours range');
    return { label, note: built(msg('GWA {value}: UP minimums are 1.20 summa, 1.45 magna, 1.75 cum laude; other schools set their own'), { value: v.toFixed(2) }) };
  }
  if (scale === 'pk4') {
    const label = v >= 2.5 ? msg('Meets the BS (2.00) and MS/MPhil (2.50) minimums') : v >= 2 ? msg('Meets the BS minimum (2.00)') : msg('Below the 2.00 BS minimum');
    return { label, note: built(msg('CGPA {value}: HEC sets 2.00 to complete a BS and 2.50 for MS/MPhil'), { value: v.toFixed(2) }) };
  }
  return null;
}

/** CBSE's indicative percentage from a CGPA on its former Class IX-X grading scheme: CGPA x 9.5 (CBSE circular 24/2010). */
export const cbseIndicativePercent = (cgpa: number) => cgpa * 9.5;
export const LETTERS = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'] as const;

/** Common US percentage cutoffs (lower bound of each letter). */
export const PERCENT_CUTOFFS: { letter: string; min: number }[] = [
  { letter: 'A+', min: 97 }, { letter: 'A', min: 93 }, { letter: 'A-', min: 90 },
  { letter: 'B+', min: 87 }, { letter: 'B', min: 83 }, { letter: 'B-', min: 80 },
  { letter: 'C+', min: 77 }, { letter: 'C', min: 73 }, { letter: 'C-', min: 70 },
  { letter: 'D+', min: 67 }, { letter: 'D', min: 63 }, { letter: 'D-', min: 60 },
  { letter: 'F', min: 0 },
];

export function percentToLetter(p: number): string {
  for (const c of PERCENT_CUTOFFS) if (p >= c.min) return c.letter;
  return 'F';
}

export type CourseType = 'regular' | 'honors' | 'ap';
export type Course = { name?: string; grade: string; credits: number; type: CourseType };
export type GpaOptions = { scale: GpaScaleId; honorsBonus: number; apBonus: number; weightF?: boolean };

/** Resolve a grade field: a letter (A-, b+), a percentage (91 or 91%), or P/NP/W (excluded). */
export function gradePoints(grade: string, scale: GpaScaleId): { points: number; letter: string } | 'excluded' | null {
  const g = (grade || '').trim().toUpperCase().replace(/\s+/g, '').replace('−', '-');
  if (g === '') return null;
  const sc = GPA_SCALES[scale];
  if ((sc.excluded ?? ['P', 'NP', 'W', 'I', 'S', 'U']).includes(g)) return 'excluded';
  const pts = sc.points;
  if (g in pts) return { points: pts[g], letter: g };
  const n = Number(g.replace('%', ''));
  if (sc.letters && !sc.cutoffs) {
    // Scales without national mark bands (India, Philippines): a number is the grade point printed on the marksheet.
    if (!g.includes('%') && Number.isFinite(n) && n >= (sc.min ?? 0) && n <= sc.max) return { points: n, letter: String(n) };
    return null;
  }
  // Nigeria and Pakistan: a number up to the scale maximum is a grade point; above it, a mark out of 100.
  if (sc.pointsUpToMax && !g.includes('%') && Number.isFinite(n) && n >= 0 && n <= sc.max) return { points: n, letter: String(n) };
  if (Number.isFinite(n) && n >= 0 && n <= 110) {
    if (sc.cutoffs) {
      const letter = sc.cutoffs.find((c) => n >= c.min)?.letter ?? sc.cutoffs[sc.cutoffs.length - 1].letter;
      return { points: pts[letter], letter };
    }
    const letter = percentToLetter(n);
    return { points: pts[letter], letter };
  }
  return null;
}

export type GpaResult = {
  credits: number;
  qualityPoints: number;
  weightedQualityPoints: number;
  unweighted: number;
  weighted: number;
  rows: { name: string; letter: string; points: number; weightedPoints: number; credits: number; included: boolean }[];
  cumulativeUnweighted?: number;
  cumulativeWeighted?: number;
  cumulativeCredits?: number;
};

/**
 * GPA = sum(points x credits) / sum(credits). The weighted GPA adds the
 * honors or AP/IB bonus to each course's points (F stays 0 unless weightF).
 * Prior GPA and credits fold in for a cumulative figure.
 */
export function calculateGpa(courses: Course[], opts: GpaOptions, prior?: { gpa: number; credits: number }): Result<GpaResult> {
  const rows: GpaResult['rows'] = [];
  let credits = 0, qp = 0, wqp = 0;
  for (let i = 0; i < courses.length; i++) {
    const c = courses[i];
    const blank = (c.grade || '').trim() === '';
    if (blank) continue;
    if (!isNum(c.credits) || c.credits < 0) return fail(built(msg('Course {n}: credits must be zero or more.'), { n: i + 1 }));
    const gp = gradePoints(c.grade, opts.scale);
    if (gp === null) return fail(opts.scale === 'in10'
      ? built(msg('Course {n}: "{grade}" is not a grade. Use a letter such as A+ or a grade point from 0 to 10.'), { n: i + 1, grade: c.grade })
      : opts.scale === 'au7'
        ? built(msg('Course {n}: "{grade}" is not a grade. Use HD, D, CR, P or F, or a mark such as 78.'), { n: i + 1, grade: c.grade })
        : opts.scale === 'ph5'
          ? built(msg('Course {n}: "{grade}" is not a grade. Use a grade from 1.00 to 5.00, such as 1.75, or INC.'), { n: i + 1, grade: c.grade })
          : opts.scale === 'ng5'
            ? built(msg('Course {n}: "{grade}" is not a grade. Use A to F, a grade point from 0 to 5, or a mark such as 64.'), { n: i + 1, grade: c.grade })
            : built(msg('Course {n}: "{grade}" is not a grade. Use a letter such as B+ or a percentage such as 88.'), { n: i + 1, grade: c.grade }));
    const name = c.name?.trim() || `Course ${i + 1}`;
    if (gp === 'excluded') { rows.push({ name, letter: c.grade.toUpperCase(), points: 0, weightedPoints: 0, credits: c.credits, included: false }); continue; }
    // Honors/AP bonuses are a US idea; on the inverted Philippine scale adding points would lower the standing, so none apply.
    const bonus = GPA_SCALES[opts.scale].lowerIsBetter ? 0 : c.type === 'honors' ? opts.honorsBonus : c.type === 'ap' ? opts.apBonus : 0;
    const wp = gp.points === 0 && !opts.weightF ? 0 : gp.points + bonus;
    rows.push({ name, letter: gp.letter, points: gp.points, weightedPoints: wp, credits: c.credits, included: true });
    credits += c.credits; qp += gp.points * c.credits; wqp += wp * c.credits;
  }
  if (credits === 0 && !(prior && prior.credits > 0)) return fail(msg('Add at least one graded course with credits above zero.'));
  const res: GpaResult = {
    credits, qualityPoints: round(qp, 4), weightedQualityPoints: round(wqp, 4),
    unweighted: credits ? qp / credits : 0, weighted: credits ? wqp / credits : 0, rows,
  };
  if (prior && isNum(prior.gpa) && isNum(prior.credits) && prior.credits > 0) {
    const priorMax = Math.max(5.5, GPA_SCALES[opts.scale].max);
    if (prior.gpa < 0 || prior.gpa > priorMax) return fail(built(msg('Prior GPA must be between 0 and {max}.'), { max: priorMax === 5.5 ? 5 : priorMax }));
    const priorMin = GPA_SCALES[opts.scale].min ?? 0;
    if (prior.gpa < priorMin) return fail(built(msg('Prior GWA must be between {min} and {max}.'), { min: priorMin.toFixed(2), max: GPA_SCALES[opts.scale].max.toFixed(2) }));
    const cc = credits + prior.credits;
    res.cumulativeCredits = cc;
    res.cumulativeUnweighted = (prior.gpa * prior.credits + qp) / cc;
    res.cumulativeWeighted = (prior.gpa * prior.credits + wqp) / cc;
  }
  return ok(res);
}

/** GPA needed on the next `futureCredits` to lift a current GPA to a target. */
export function requiredGpa(currentGpa: number, currentCredits: number, targetGpa: number, futureCredits: number): Result<{ required: number }> {
  if (![currentGpa, currentCredits, targetGpa, futureCredits].every(isNum)) return fail(msg('Enter numbers for every planner field.'));
  if (futureCredits <= 0) return fail(msg('Credits still to take must be above zero.'));
  if (currentCredits < 0) return fail(msg('Credits completed cannot be negative.'));
  return ok({ required: (targetGpa * (currentCredits + futureCredits) - currentGpa * currentCredits) / futureCredits });
}

// ---------------------------------------------------------------------------
// Final grade
// ---------------------------------------------------------------------------

/** Score needed on the final: (target - current x (1 - w)) / w, all in percent. */
export function requiredFinal(current: number, finalWeight: number, target: number): Result<{ required: number }> {
  if (![current, finalWeight, target].every(isNum)) return fail(msg('Enter your current grade, the final\'s weight and your target.'));
  if (finalWeight <= 0 || finalWeight > 100) return fail(msg('The final exam weight must be above 0% and at most 100%.'));
  if (current < 0) return fail(msg('The current grade cannot be negative.'));
  const w = finalWeight / 100;
  return ok({ required: (target - current * (1 - w)) / w });
}

/** Course grade after scoring `finalScore` on the final. */
export function gradeWithFinal(current: number, finalWeight: number, finalScore: number): Result<{ grade: number }> {
  if (![current, finalWeight, finalScore].every(isNum)) return fail(msg('Enter your current grade, the final\'s weight and a final score.'));
  if (finalWeight < 0 || finalWeight > 100) return fail(msg('The final exam weight must be between 0% and 100%.'));
  const w = finalWeight / 100;
  return ok({ grade: current * (1 - w) + finalScore * w });
}

export type Category = { name: string; weight: number; score: number | null };

/**
 * Weighted-category grade. Categories with a score count toward the current
 * grade, renormalised by the weight completed so far; the category marked as
 * the final is solved for the target.
 */
export function weightedCategories(categories: Category[], finalIndex: number, target: number): Result<{
  totalWeight: number; completedWeight: number; current: number; earned: number; finalWeight: number; required: number | null;
}> {
  let totalWeight = 0, completedWeight = 0, earned = 0;
  for (let i = 0; i < categories.length; i++) {
    const c = categories[i];
    if (!isNum(c.weight) || c.weight < 0) return fail(`${c.name || `Category ${i + 1}`}: weight must be zero or more.`);
    totalWeight += c.weight;
    if (i === finalIndex) continue;
    if (c.score !== null) {
      if (!isNum(c.score) || c.score < 0) return fail(`${c.name || `Category ${i + 1}`}: score must be zero or more.`);
      completedWeight += c.weight; earned += c.weight * c.score;
    }
  }
  if (Math.abs(totalWeight - 100) > 0.01) return fail(built(msg('Category weights add up to {total}%. They need to total 100%.'), { total: round(totalWeight, 2) }));
  if (completedWeight === 0) return fail(msg('Enter a score for at least one category other than the final.'));
  const finalWeight = finalIndex >= 0 && finalIndex < categories.length ? categories[finalIndex].weight : 0;
  const otherOpen = totalWeight - completedWeight - finalWeight;
  const current = earned / completedWeight;
  // Remaining non-final categories are assumed to land at the current average.
  const required = finalWeight > 0 && isNum(target)
    ? (target * 100 - earned - otherOpen * current) / finalWeight
    : null;
  return ok({ totalWeight, completedWeight, current, earned: earned / 100, finalWeight, required });
}

export const DEFAULT_LETTER_THRESHOLDS = [
  { letter: 'A', min: 90 }, { letter: 'B', min: 80 }, { letter: 'C', min: 70 }, { letter: 'D', min: 60 },
];
