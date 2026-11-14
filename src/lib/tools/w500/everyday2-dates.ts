/**
 * Week numbers and day-of-week maths for the Week Number and Day of the Week
 * calculators. Everything works on integer day numbers (days since
 * 1970-01-01 in the proleptic Gregorian calendar) so time zones and
 * daylight-saving changes can never shift a result by a day.
 *
 * Pure functions, no React, relative imports only (bundled for MCP).
 */
import { msg } from '../../msg';

export type Ymd = { y: number; m: number; d: number };

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Index 0 = Sunday. */
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const monthName = (m: number) => MONTH_NAMES[m - 1] ?? '';

const fdiv = (a: number, b: number) => Math.floor(a / b);
const mod = (a: number, b: number) => ((a % b) + b) % b;

export const isGregorianLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const isJulianLeap = (y: number) => mod(y, 4) === 0;

export function daysInMonth(y: number, m: number, calendar: 'gregorian' | 'julian' = 'gregorian'): number {
  if (m === 2) return (calendar === 'julian' ? isJulianLeap(y) : isGregorianLeap(y)) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

export function isValidYmd(v: Ymd, calendar: 'gregorian' | 'julian' = 'gregorian'): boolean {
  return (
    Number.isInteger(v.y) && Number.isInteger(v.m) && Number.isInteger(v.d) &&
    v.y >= 1 && v.y <= 9999 && v.m >= 1 && v.m <= 12 && v.d >= 1 && v.d <= daysInMonth(v.y, v.m, calendar)
  );
}

/** Parse "YYYY-MM-DD" into a valid Gregorian date, or null. */
export function parseIsoDate(s: string): Ymd | null {
  const m = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(s ?? '');
  if (!m) return null;
  const v = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  return isValidYmd(v) ? v : null;
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const toIso = (v: Ymd) => `${String(v.y).padStart(4, '0')}-${pad2(v.m)}-${pad2(v.d)}`;

/** Days since 1970-01-01 for a proleptic Gregorian date (Hinnant's days_from_civil). */
export function dayNumber(v: Ymd): number {
  const y = v.m <= 2 ? v.y - 1 : v.y;
  const era = fdiv(y, 400);
  const yoe = y - era * 400;
  const mp = v.m > 2 ? v.m - 3 : v.m + 9;
  const doy = fdiv(153 * mp + 2, 5) + v.d - 1;
  const doe = yoe * 365 + fdiv(yoe, 4) - fdiv(yoe, 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of dayNumber. */
export function fromDayNumber(n: number): Ymd {
  const z = n + 719468;
  const era = fdiv(z, 146097);
  const doe = z - era * 146097;
  const yoe = fdiv(doe - fdiv(doe, 1460) + fdiv(doe, 36524) - fdiv(doe, 146096), 365);
  const doy = doe - (365 * yoe + fdiv(yoe, 4) - fdiv(yoe, 100));
  const mp = fdiv(5 * doy + 2, 153);
  const d = doy - fdiv(153 * mp + 2, 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: era * 400 + yoe + (m <= 2 ? 1 : 0), m, d };
}

/** 0 = Sunday ... 6 = Saturday. */
export const weekdayIndex = (n: number) => mod(n + 4, 7);
/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export const isoWeekday = (n: number) => mod(n + 3, 7) + 1;

export const dayOfYear = (v: Ymd) => dayNumber(v) - dayNumber({ y: v.y, m: 1, d: 1 }) + 1;

// ---------------------------------------------------------------- ISO 8601 weeks

export type IsoWeek = { isoYear: number; week: number; weekday: number };

/** ISO 8601 week: weeks start Monday; week 1 is the week containing the year's first Thursday. */
export function isoWeek(v: Ymd): IsoWeek {
  const n = dayNumber(v);
  const wd = isoWeekday(n);
  const thursday = fromDayNumber(n - wd + 4);
  const week = fdiv(dayOfYear(thursday) - 1, 7) + 1;
  return { isoYear: thursday.y, week, weekday: wd };
}

/** 52 or 53. A year has 53 ISO weeks when 1 January is a Thursday, or a Wednesday in a leap year. */
export const isoWeeksInYear = (y: number) => isoWeek({ y, m: 12, d: 28 }).week;

/** Day number of the Monday that starts ISO week `week` of `isoYear`. */
export function isoWeekMonday(isoYear: number, week: number): number {
  const jan4 = dayNumber({ y: isoYear, m: 1, d: 4 });
  return jan4 - (isoWeekday(jan4) - 1) + (week - 1) * 7;
}

/** "2026-W44-4" style ISO week date. */
export function isoWeekDate(v: Ymd): string {
  const w = isoWeek(v);
  return `${String(w.isoYear).padStart(4, '0')}-W${pad2(w.week)}-${w.weekday}`;
}

/** Parse "2026-W44", "2026W44", "2026-W44-4" or "2026W444". */
export function parseIsoWeekDate(s: string): { isoYear: number; week: number; weekday?: number } | null {
  const m = /^\s*(\d{4})-?W(\d{1,2})(?:-?([1-7]))?\s*$/i.exec(s ?? '');
  if (!m) return null;
  const isoYear = Number(m[1]);
  const week = Number(m[2]);
  if (isoYear < 1 || week < 1 || week > isoWeeksInYear(isoYear)) return null;
  return { isoYear, week, weekday: m[3] ? Number(m[3]) : undefined };
}

// ---------------------------------------------------------------- other week systems

/**
 * Week number where week 1 is the week containing 1 January and weeks start on
 * `startDay` (0 = Sunday, 1 = Monday, 6 = Saturday). This is Excel's
 * WEEKNUM(date, 1) for Sunday, WEEKNUM(date, 2) for Monday and
 * WEEKNUM(date, 16) for Saturday; the US convention is Sunday.
 */
export function simpleWeek(v: Ymd, startDay = 0): number {
  const jan1 = dayNumber({ y: v.y, m: 1, d: 1 });
  const offset = mod(weekdayIndex(jan1) - startDay, 7);
  return fdiv(dayNumber(v) - jan1 + offset, 7) + 1;
}

/** Number of week rows the year has under simpleWeek (53 or 54). */
export const simpleWeeksInYear = (y: number, startDay = 0) => simpleWeek({ y, m: 12, d: 31 }, startDay);

/**
 * C strftime %U (startDay 0) or %W (startDay 1): days before the year's first
 * Sunday (or Monday) are in week 0.
 */
export function strftimeWeek(v: Ymd, startDay: 0 | 1): number {
  const yday = dayOfYear(v) - 1;
  const wd = startDay === 0 ? weekdayIndex(dayNumber(v)) : mod(weekdayIndex(dayNumber(v)) - 1, 7);
  return fdiv(yday + 7 - wd, 7);
}

export const quarterOf = (m: number) => Math.ceil(m / 3);

export type WeekRow = { week: number; start: string; end: string; startN: number; endN: number };

/** Every ISO week of an ISO year with its Monday and Sunday. */
export function isoWeeksOfYear(isoYear: number): WeekRow[] {
  const rows: WeekRow[] = [];
  const total = isoWeeksInYear(isoYear);
  for (let w = 1; w <= total; w++) {
    const s = isoWeekMonday(isoYear, w);
    rows.push({ week: w, start: toIso(fromDayNumber(s)), end: toIso(fromDayNumber(s + 6)), startN: s, endN: s + 6 });
  }
  return rows;
}

/** Every simple (US-style) week of a calendar year, clipped to 1 Jan and 31 Dec. */
export function simpleWeeksOfYear(y: number, startDay = 0): WeekRow[] {
  const jan1 = dayNumber({ y, m: 1, d: 1 });
  const dec31 = dayNumber({ y, m: 12, d: 31 });
  const offset = mod(weekdayIndex(jan1) - startDay, 7);
  const rows: WeekRow[] = [];
  const total = simpleWeeksInYear(y, startDay);
  for (let w = 1; w <= total; w++) {
    const s = Math.max(jan1, jan1 - offset + (w - 1) * 7);
    const e = Math.min(dec31, jan1 - offset + (w - 1) * 7 + 6);
    rows.push({ week: w, start: toIso(fromDayNumber(s)), end: toIso(fromDayNumber(e)), startN: s, endN: e });
  }
  return rows;
}

export type WeekNumberResult = {
  date: string;
  weekday: string;
  iso: IsoWeek & { weekDate: string; weeksInYear: number; monday: string; sunday: string };
  us: { week: number; weeksInYear: number; start: string; end: string };
  mondayJan1: { week: number };
  strftimeU: number;
  strftimeW: number;
  dayOfYear: number;
  daysInYear: number;
  quarter: number;
};

/** Every week number system for one date. */
export function weekNumbers(v: Ymd): WeekNumberResult {
  if (!isValidYmd(v)) throw new Error('Enter a valid date between year 1 and 9999.');
  const n = dayNumber(v);
  const iw = isoWeek(v);
  const mon = isoWeekMonday(iw.isoYear, iw.week);
  const usRow = simpleWeeksOfYear(v.y, 0)[simpleWeek(v, 0) - 1];
  return {
    date: toIso(v),
    weekday: WEEKDAY_NAMES[weekdayIndex(n)],
    iso: { ...iw, weekDate: isoWeekDate(v), weeksInYear: isoWeeksInYear(iw.isoYear), monday: toIso(fromDayNumber(mon)), sunday: toIso(fromDayNumber(mon + 6)) },
    us: { week: simpleWeek(v, 0), weeksInYear: simpleWeeksInYear(v.y, 0), start: usRow.start, end: usRow.end },
    mondayJan1: { week: simpleWeek(v, 1) },
    strftimeU: strftimeWeek(v, 0),
    strftimeW: strftimeWeek(v, 1),
    dayOfYear: dayOfYear(v),
    daysInYear: isGregorianLeap(v.y) ? 366 : 365,
    quarter: quarterOf(v.m),
  };
}

// ---------------------------------------------------------------- fiscal and tax years

/**
 * Year schemes that count weeks from a fixed start date rather than from
 * 1 January: the UK income tax year (6 April, HMRC tax weeks and tax months),
 * India's financial year (1 April) and Australia's financial year (1 July).
 */
export type FiscalScheme = 'uk-tax' | 'in-fy' | 'au-fy' | 'ie-tax';

export const FISCAL_SCHEMES: Record<FiscalScheme, { label: string; short: string; m: number; d: number }> = {
  'uk-tax': { label: msg('UK tax year (from 6 April)'), short: 'Tax', m: 4, d: 6 },
  'in-fy': { label: msg('India financial year (from 1 April)'), short: 'FY', m: 4, d: 1 },
  'au-fy': { label: msg('Australian financial year (from 1 July)'), short: 'FY', m: 7, d: 1 },
  // Revenue (Ireland): the tax year is the calendar year; week 1 is 1 to 7 January and week 53 is 31 December (30 and 31 December in a leap year).
  'ie-tax': { label: msg('Irish tax year (from 1 January)'), short: 'Tax', m: 1, d: 1 },
};

export const isFiscalScheme = (s: string): s is FiscalScheme => Object.prototype.hasOwnProperty.call(FISCAL_SCHEMES, s);

export type FiscalPeriod = {
  scheme: FiscalScheme;
  /** Calendar year in which this fiscal year starts. */
  startYear: number;
  /** "2026-27" style label. */
  label: string;
  start: string;
  end: string;
  /** Day of the fiscal year, 1-based. */
  day: number;
  /**
   * Week of the fiscal year: 7-day blocks counted from the start date, so
   * week 1 of the UK tax year is 6 to 12 April. The one or two days left at
   * the end form week 53 (HMRC tax week 53).
   */
  week: number;
  weekStart: string;
  weekEnd: string;
  /** Fiscal month: for the UK tax year, the 6th of one month to the 5th of the next. */
  month: number;
  /** Fiscal quarter, three fiscal months each. */
  quarter: number;
};

/** Where a date falls in a fiscal or tax year. */
export function fiscalPeriod(v: Ymd, scheme: FiscalScheme): FiscalPeriod {
  if (!isValidYmd(v)) throw new Error('Enter a valid date between year 1 and 9999.');
  const s = FISCAL_SCHEMES[scheme];
  const startYear = v.m > s.m || (v.m === s.m && v.d >= s.d) ? v.y : v.y - 1;
  const startN = dayNumber({ y: startYear, m: s.m, d: s.d });
  const endN = dayNumber({ y: startYear + 1, m: s.m, d: s.d }) - 1;
  const n = dayNumber(v);
  const day = n - startN + 1;
  const week = fdiv(day - 1, 7) + 1;
  const wStart = startN + (week - 1) * 7;
  const wEnd = Math.min(wStart + 6, endN);
  // Months since the start month, stepping on the start day of each month.
  const monthsFromStart = (v.y - startYear) * 12 + (v.m - s.m) - (v.d < s.d ? 1 : 0);
  const month = monthsFromStart + 1;
  return {
    scheme,
    startYear,
    label: s.m === 1 && s.d === 1 ? String(startYear) : `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`,
    start: toIso(fromDayNumber(startN)),
    end: toIso(fromDayNumber(endN)),
    day,
    week,
    weekStart: toIso(fromDayNumber(wStart)),
    weekEnd: toIso(fromDayNumber(wEnd)),
    month,
    quarter: Math.ceil(month / 3),
  };
}

/** Dates of an ISO week (Monday first). */
export function isoWeekDates(isoYear: number, week: number): string[] {
  if (!Number.isInteger(isoYear) || isoYear < 1 || isoYear > 9999) throw new Error('Year must be between 1 and 9999.');
  const max = isoWeeksInYear(isoYear);
  if (!Number.isInteger(week) || week < 1 || week > max) throw new Error(`ISO year ${isoYear} has weeks 1 to ${max}.`);
  const s = isoWeekMonday(isoYear, week);
  return Array.from({ length: 7 }, (_, k) => toIso(fromDayNumber(s + k)));
}

/** Dates of a simple (US) week, clipped to the calendar year. */
export function simpleWeekDates(y: number, week: number, startDay = 0): string[] {
  if (!Number.isInteger(y) || y < 1 || y > 9999) throw new Error('Year must be between 1 and 9999.');
  const max = simpleWeeksInYear(y, startDay);
  if (!Number.isInteger(week) || week < 1 || week > max) throw new Error(`${y} has weeks 1 to ${max} in this system.`);
  const row = simpleWeeksOfYear(y, startDay)[week - 1];
  const out: string[] = [];
  for (let k = row.startN; k <= row.endN; k++) out.push(toIso(fromDayNumber(k)));
  return out;
}

// ---------------------------------------------------------------- day of the week

export type CalendarChoice = 'gregorian' | 'julian' | 'auto';

/** Julian Day Number at noon for a date in the given calendar. */
export function julianDayNumber(v: Ymd, calendar: 'gregorian' | 'julian'): number {
  const a = fdiv(14 - v.m, 12);
  const y = v.y + 4800 - a;
  const m = v.m + 12 * a - 3;
  const base = v.d + fdiv(153 * m + 2, 5) + 365 * y + fdiv(y, 4);
  return calendar === 'gregorian' ? base - fdiv(y, 100) + fdiv(y, 400) - 32045 : base - 32083;
}

/** Which calendar a date belongs to under the given choice ('auto' = Julian before 15 October 1582). */
export function resolveCalendar(v: Ymd, choice: CalendarChoice): 'gregorian' | 'julian' {
  if (choice !== 'auto') return choice;
  const key = v.y * 10000 + v.m * 100 + v.d;
  return key < 15821015 ? 'julian' : 'gregorian';
}

export type ZellerSteps = { q: number; m: number; K: number; J: number; term13: number; sum: number; h: number; formula: string };

/** Zeller's congruence. h: 0 = Saturday, 1 = Sunday ... 6 = Friday. */
export function zeller(v: Ymd, calendar: 'gregorian' | 'julian'): ZellerSteps {
  const q = v.d;
  const m = v.m < 3 ? v.m + 12 : v.m;
  const year = v.m < 3 ? v.y - 1 : v.y;
  const K = mod(year, 100);
  const J = fdiv(year, 100);
  const term13 = fdiv(13 * (m + 1), 5);
  const sum = calendar === 'gregorian' ? q + term13 + K + fdiv(K, 4) + fdiv(J, 4) + 5 * J : q + term13 + K + fdiv(K, 4) + 5 + 6 * J;
  const formula =
    calendar === 'gregorian'
      ? `h = (${q} + ⌊13(${m}+1)/5⌋ + ${K} + ⌊${K}/4⌋ + ⌊${J}/4⌋ + 5·${J}) mod 7 = (${q} + ${term13} + ${K} + ${fdiv(K, 4)} + ${fdiv(J, 4)} + ${5 * J}) mod 7 = ${sum} mod 7 = ${mod(sum, 7)}`
      : `h = (${q} + ⌊13(${m}+1)/5⌋ + ${K} + ⌊${K}/4⌋ + 5 + 6·${J}) mod 7 = (${q} + ${term13} + ${K} + ${fdiv(K, 4)} + 5 + ${6 * J}) mod 7 = ${sum} mod 7 = ${mod(sum, 7)}`;
  return { q, m, K, J, term13, sum, h: mod(sum, 7), formula };
}

/** Doomsday (memorable date that shares the year's doomsday weekday) for each month. */
export function doomsdayDate(y: number, m: number): number {
  const leap = isGregorianLeap(y);
  return [leap ? 4 : 3, leap ? 29 : 28, 14, 4, 9, 6, 11, 8, 5, 10, 7, 12][m - 1];
}

export type DoomsdaySteps = { centuryAnchor: number; a: number; b: number; c: number; yearDoomsday: number; reference: number; result: number };

/** Conway's Doomsday rule (Gregorian). Weekday indices 0 = Sunday. */
export function doomsday(v: Ymd): DoomsdaySteps {
  const century = fdiv(v.y, 100);
  const centuryAnchor = mod(5 * mod(century, 4) + 2, 7);
  const yy = mod(v.y, 100);
  const a = fdiv(yy, 12);
  const b = yy % 12;
  const c = fdiv(b, 4);
  const yearDoomsday = mod(centuryAnchor + a + b + c, 7);
  const reference = doomsdayDate(v.y, v.m);
  return { centuryAnchor, a, b, c, yearDoomsday, reference, result: mod(yearDoomsday + v.d - reference, 7) };
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

export type DayOfWeekResult = {
  date: string;
  calendar: 'gregorian' | 'julian';
  weekdayIndex: number;
  weekday: string;
  jdn: number;
  zeller: ZellerSteps;
  doomsday: DoomsdaySteps | null;
  dayOfYear: number;
  occurrence: string;
  isLastOfMonth: boolean;
  isoWeek: string | null;
  /** Gregorian equivalent when the date was given in the Julian calendar. */
  gregorianEquivalent: string | null;
  /** Days from `today` (positive = in the future); null when no today given. */
  daysFromToday: number | null;
};

/** What weekday a date falls on, with Zeller and Doomsday working. */
export function dayOfWeek(v: Ymd, choice: CalendarChoice = 'gregorian', today?: Ymd): DayOfWeekResult {
  const cal = resolveCalendar(v, choice);
  if (!isValidYmd(v, cal)) throw new Error(`That date does not exist in the ${cal === 'julian' ? 'Julian' : 'Gregorian'} calendar.`);
  const jdn = julianDayNumber(v, cal);
  const idx = mod(jdn + 1, 7);
  const z = zeller(v, cal);
  const greg = cal === 'gregorian' ? v : fromDayNumber(jdn - 2440588);
  const nth = Math.ceil(v.d / 7);
  const isLast = v.d + 7 > daysInMonth(v.y, v.m, cal);
  const name = WEEKDAY_NAMES[idx];
  const doy = v.d + Array.from({ length: v.m - 1 }, (_, k) => daysInMonth(v.y, k + 1, cal)).reduce((s, x) => s + x, 0);
  return {
    date: toIso(v),
    calendar: cal,
    weekdayIndex: idx,
    weekday: name,
    jdn,
    zeller: z,
    doomsday: cal === 'gregorian' ? doomsday(v) : null,
    dayOfYear: doy,
    occurrence: `${isLast && nth >= 4 ? `${ORDINALS[nth - 1]} and last` : ORDINALS[nth - 1]} ${name} of ${monthName(v.m)} ${v.y}`,
    isLastOfMonth: isLast,
    isoWeek: cal === 'gregorian' ? isoWeekDate(v) : null,
    gregorianEquivalent: cal === 'julian' ? toIso(greg) : null,
    daysFromToday: today ? jdn - 2440588 - dayNumber(today) : null,
  };
}

/** Weekday of the same month and day in each of the next `count` years (Gregorian). Skips 29 February in common years. */
export function sameDateInYears(m: number, d: number, fromYear: number, count = 10): { year: number; weekday: string }[] {
  const out: { year: number; weekday: string }[] = [];
  for (let y = fromYear; out.length < count && y <= 9999; y++) {
    if (d > daysInMonth(y, m)) continue;
    out.push({ year: y, weekday: WEEKDAY_NAMES[weekdayIndex(dayNumber({ y, m, d }))] });
  }
  return out;
}

/** Date of the nth (1-5, or -1 for last) given weekday (0 = Sunday) in a Gregorian month, or null if it does not exist. */
export function nthWeekdayOfMonth(y: number, m: number, weekday: number, nth: number): Ymd | null {
  const dim = daysInMonth(y, m);
  if (nth === -1) {
    const lastIdx = weekdayIndex(dayNumber({ y, m, d: dim }));
    return { y, m, d: dim - mod(lastIdx - weekday, 7) };
  }
  const firstIdx = weekdayIndex(dayNumber({ y, m, d: 1 }));
  const d = 1 + mod(weekday - firstIdx, 7) + (nth - 1) * 7;
  return d <= dim ? { y, m, d } : null;
}
