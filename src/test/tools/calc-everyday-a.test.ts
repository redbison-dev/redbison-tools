import { describe, it, expect } from 'vitest';
import {
  calculateAge, addMonths, parseISODate, weekday, generationFor, zodiacSign, isLeapYear,
  parseClock, formatClock, formatHMM, splitSeconds, sumDurations, parseHMS, decimalHoursToSeconds,
  clockDifference, addToClock, formatHMS, formatDuration, roundPunch, calculateTimeCard, timeCardCsv,
  gradePoints, percentToLetter, calculateGpa, requiredGpa, requiredFinal, gradeWithFinal, weightedCategories,
  type Result, type CalDate, type TimeCardDay,
} from '@/lib/tools/calculators/everyday-a';

function ok<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
const D = (s: string): CalDate => {
  const d = parseISODate(s);
  if (!d) throw new Error(`bad date ${s}`);
  return d;
};

describe('calendar helpers', () => {
  it('knows the Gregorian leap-year rule', () => {
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
  });
  it('rejects impossible dates', () => {
    expect(parseISODate('2025-02-29')).toBeNull();
    expect(parseISODate('2024-02-29')).toEqual({ y: 2024, m: 2, d: 29 });
    expect(parseISODate('2024-13-01')).toBeNull();
    expect(parseISODate('')).toBeNull();
  });
  it('gives known weekdays', () => {
    expect(weekday(D('1969-07-20'))).toBe('Sunday'); // Apollo 11 landing
    expect(weekday(D('2000-01-01'))).toBe('Saturday');
    expect(weekday(D('2026-10-28'))).toBe('Wednesday');
  });
  it('clamps month ends and applies the leap-day convention', () => {
    expect(addMonths(D('2025-01-31'), 1)).toEqual({ y: 2025, m: 2, d: 28 });
    expect(addMonths(D('2024-01-31'), 1)).toEqual({ y: 2024, m: 2, d: 29 });
    expect(addMonths(D('2024-02-29'), 12, 'mar1')).toEqual({ y: 2025, m: 3, d: 1 });
    expect(addMonths(D('2024-02-29'), 12, 'feb28')).toEqual({ y: 2025, m: 2, d: 28 });
    expect(addMonths(D('2024-02-29'), 48)).toEqual({ y: 2028, m: 2, d: 29 });
  });
});

describe('calculateAge', () => {
  it('counts years, months and days by anniversaries', () => {
    const a = ok(calculateAge(D('1990-05-15'), D('2026-10-28')));
    expect([a.years, a.months, a.days]).toEqual([36, 5, 13]);
    expect(a.totalMonths).toBe(437);
    // 1990-05-15 to 2026-10-28 is 13,315 days (checked with Python's date subtraction).
    expect(a.totalDays).toBe(13315);
    expect(a.totalWeeks).toBe(1902);
    expect(a.weeksRemainderDays).toBe(1);
    expect(a.totalHours).toBe(13315 * 24);
    expect(toIso(a.nextBirthday)).toBe('2027-05-15');
    expect(a.nextBirthdayAge).toBe(37);
    expect(a.daysToNextBirthday).toBe(199);
    expect(a.nextBirthdayWeekday).toBe('Saturday');
    expect(a.bornWeekday).toBe('Tuesday');
  });
  it('handles the day before and the day of a birthday', () => {
    const before = ok(calculateAge(D('2000-06-10'), D('2026-06-09')));
    expect([before.years, before.months, before.days]).toEqual([25, 11, 30]);
    expect(before.daysToNextBirthday).toBe(1);
    const on = ok(calculateAge(D('2000-06-10'), D('2026-06-10')));
    expect([on.years, on.months, on.days]).toEqual([26, 0, 0]);
    expect(on.isBirthdayToday).toBe(true);
    expect(on.daysToNextBirthday).toBe(0);
  });
  it('borrows days across short months', () => {
    const a = ok(calculateAge(D('2025-01-31'), D('2025-03-01')));
    expect([a.years, a.months, a.days]).toEqual([0, 1, 1]);
    expect(a.totalDays).toBe(29);
  });
  it('treats a 29 February birthday by the chosen convention', () => {
    const mar = ok(calculateAge(D('2004-02-29'), D('2025-02-28'), 'mar1'));
    expect(mar.years).toBe(20);
    expect(mar.daysToNextBirthday).toBe(1);
    expect(toIso(mar.nextBirthday)).toBe('2025-03-01');
    const feb = ok(calculateAge(D('2004-02-29'), D('2025-02-28'), 'feb28'));
    expect(feb.years).toBe(21);
    expect(feb.isBirthdayToday).toBe(true);
    const leap = ok(calculateAge(D('2004-02-29'), D('2028-02-29')));
    expect([leap.years, leap.months, leap.days]).toEqual([24, 0, 0]);
    expect(leap.leapDayBirth).toBe(true);
  });
  it('is zero on the birth date and rejects a target before birth', () => {
    const z = ok(calculateAge(D('2026-10-28'), D('2026-10-28')));
    expect([z.years, z.months, z.days, z.totalDays]).toEqual([0, 0, 0, 0]);
    expect(z.isBirthdayToday).toBe(false);
    expect(toIso(z.nextBirthday)).toBe('2027-10-28');
    expect(calculateAge(D('2026-10-29'), D('2026-10-28')).ok).toBe(false);
  });
});

function toIso(c: CalDate) { return `${c.y}-${String(c.m).padStart(2, '0')}-${String(c.d).padStart(2, '0')}`; }

describe('generation and zodiac', () => {
  it('uses Pew Research birth-year boundaries', () => {
    expect(generationFor(1945)?.name).toBe('Silent Generation');
    expect(generationFor(1946)?.name).toBe('Baby Boomers');
    expect(generationFor(1964)?.name).toBe('Baby Boomers');
    expect(generationFor(1965)?.name).toBe('Generation X');
    expect(generationFor(1980)?.name).toBe('Generation X');
    expect(generationFor(1981)?.name).toBe('Millennials');
    expect(generationFor(1996)?.name).toBe('Millennials');
    expect(generationFor(1997)?.name).toBe('Generation Z');
    expect(generationFor(2012)?.name).toBe('Generation Z');
    expect(generationFor(2015)?.pew).toBe(false);
  });
  it('maps sun-sign boundaries', () => {
    expect(zodiacSign(D('2000-01-19'))).toBe('Capricorn');
    expect(zodiacSign(D('2000-01-20'))).toBe('Aquarius');
    expect(zodiacSign(D('2000-03-21'))).toBe('Aries');
    expect(zodiacSign(D('2000-07-23'))).toBe('Leo');
    expect(zodiacSign(D('2000-12-22'))).toBe('Capricorn');
    expect(zodiacSign(D('2000-12-21'))).toBe('Sagittarius');
  });
});

describe('clock and duration helpers', () => {
  it('parses and formats clock times', () => {
    expect(parseClock('09:30')).toBe(34200);
    expect(parseClock('24:00')).toBeNull();
    expect(parseClock('9:5')).toBeNull();
    expect(formatClock(0, true)).toBe('12:00 AM');
    expect(formatClock(12 * 3600, true)).toBe('12:00 PM');
    expect(formatClock(13.5 * 3600)).toBe('13:30');
    expect(formatHMM(2475)).toBe('41:15');
  });
  it('converts decimal hours and h:mm:ss both ways', () => {
    expect(formatHMS(decimalHoursToSeconds(7.75))).toBe('7:45:00');
    expect(formatHMS(decimalHoursToSeconds(1.2))).toBe('1:12:00');
    expect(parseHMS('2:30:00')! / 3600).toBe(2.5);
    expect(parseHMS('8:20')! / 3600).toBeCloseTo(8.3333, 4);
    expect(parseHMS('27:15')).toBe(27 * 3600 + 15 * 60);
    expect(parseHMS('abc')).toBeNull();
  });
  it('adds and subtracts durations with carry', () => {
    const r = ok(sumDurations([
      { sign: 1, days: 0, hours: 2, minutes: 45, seconds: 50 },
      { sign: 1, days: 0, hours: 1, minutes: 30, seconds: 20 },
      { sign: -1, days: 0, hours: 0, minutes: 16, seconds: 10 },
    ]));
    expect(formatHMS(r.totalSeconds)).toBe('4:00:00');
    expect(r.decimalHours).toBe(4);
    const big = ok(sumDurations([{ sign: 1, days: 1, hours: 23, minutes: 59, seconds: 59 }, { sign: 1, days: 0, hours: 0, minutes: 0, seconds: 1 }]));
    expect(splitSeconds(big.totalSeconds)).toMatchObject({ days: 2, hours: 0, minutes: 0, seconds: 0 });
    expect(formatDuration(-5400)).toBe('-1h 30m');
    expect(sumDurations([{ sign: 1, days: 0, hours: -1, minutes: 0, seconds: 0 }]).ok).toBe(false);
  });
  it('finds the time between clock times, across midnight', () => {
    expect(clockDifference(parseClock('09:15')!, parseClock('17:45')!)).toEqual({ seconds: 8.5 * 3600, overnight: false });
    expect(clockDifference(parseClock('22:00')!, parseClock('06:30')!)).toEqual({ seconds: 8.5 * 3600, overnight: true });
  });
  it('adds a duration to a clock time with day roll-over', () => {
    expect(addToClock(parseClock('22:30')!, 3 * 3600)).toEqual({ seconds: 1.5 * 3600, dayOffset: 1 });
    expect(addToClock(parseClock('01:00')!, -2 * 3600)).toEqual({ seconds: 23 * 3600, dayOffset: -1 });
    expect(addToClock(parseClock('08:00')!, 50 * 3600)).toEqual({ seconds: 10 * 3600, dayOffset: 2 });
  });
});

describe('time card', () => {
  it('rounds punches per 29 CFR 785.48(b) increments (7-minute rule for quarter hours)', () => {
    expect(roundPunch(8 * 60 + 7, 15)).toBe(8 * 60);
    expect(roundPunch(8 * 60 + 8, 15)).toBe(8 * 60 + 15);
    expect(roundPunch(8 * 60 + 52, 15)).toBe(8 * 60 + 45);
    expect(roundPunch(8 * 60 + 53, 15)).toBe(9 * 60);
    expect(roundPunch(8 * 60 + 2, 6)).toBe(8 * 60);
    expect(roundPunch(8 * 60 + 3, 6)).toBe(8 * 60 + 6);
    expect(roundPunch(8 * 60 + 2, 5)).toBe(8 * 60);
    expect(roundPunch(8 * 60 + 3, 5)).toBe(8 * 60 + 5);
    expect(roundPunch(8 * 60 + 3, 0)).toBe(8 * 60 + 3);
  });
  const week = (rows: [string, string, number][]): TimeCardDay[] =>
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => ({ label, start: rows[i]?.[0] ?? '', end: rows[i]?.[1] ?? '', breakMinutes: rows[i]?.[2] ?? 0 }));

  it('totals a standard week with unpaid lunch', () => {
    const r = ok(calculateTimeCard(week([
      ['09:00', '17:30', 30], ['09:00', '17:30', 30], ['09:00', '17:30', 30], ['09:00', '17:30', 30], ['09:00', '17:30', 30],
    ]), { rounding: 0, weeklyThresholdHours: 40, dailyThresholdHours: null }));
    expect(r.totalMinutes).toBe(2400);
    expect(r.overtimeMinutes).toBe(0);
    expect(r.totalDecimal).toBe(40);
  });
  it('splits weekly overtime and prices it at 1.5x', () => {
    const r = ok(calculateTimeCard(week([
      ['08:00', '18:00', 30], ['08:00', '18:00', 30], ['08:00', '18:00', 30], ['08:00', '18:00', 30], ['08:00', '17:00', 0],
    ]), { rounding: 0, weeklyThresholdHours: 40, dailyThresholdHours: null, hourlyRate: 20, overtimeMultiplier: 1.5 }));
    // 4 x 9.5 + 9 = 47 h: 40 regular, 7 overtime.
    expect(r.totalMinutes / 60).toBe(47);
    expect(r.regularMinutes / 60).toBe(40);
    expect(r.overtimeMinutes / 60).toBe(7);
    expect(r.regularPay).toBe(800);
    expect(r.overtimePay).toBe(210);
    expect(r.totalPay).toBe(1010);
    expect(formatHMM(r.totalMinutes)).toBe('47:00');
  });
  it('handles overnight shifts and daily overtime without double counting', () => {
    const r = ok(calculateTimeCard(week([
      ['22:00', '08:00', 30], ['22:00', '08:00', 30], ['22:00', '08:00', 30], ['22:00', '08:00', 30], ['22:00', '06:00', 0],
    ]), { rounding: 0, weeklyThresholdHours: 40, dailyThresholdHours: 8 }));
    // 4 x 9.5 + 8 = 46 h. Daily OT 4 x 1.5 = 6 h; straight time 4 x 8 + 8 = 40, so no extra weekly OT.
    expect(r.days[0].overnight).toBe(true);
    expect(r.totalMinutes / 60).toBe(46);
    expect(r.dailyOvertimeMinutes / 60).toBe(6);
    expect(r.weeklyOvertimeMinutes).toBe(0);
    expect(r.regularMinutes / 60).toBe(40);
  });
  it('applies quarter-hour rounding to each punch', () => {
    const r = ok(calculateTimeCard(week([['08:07', '16:53', 30]]), { rounding: 15, weeklyThresholdHours: 40, dailyThresholdHours: null }));
    // 08:07 -> 08:00 and 16:53 -> 17:00: 9 h less a 30 min break = 8.5 h (unrounded it is 8 h 16 min).
    expect(r.totalMinutes).toBe(510);
    const raw = ok(calculateTimeCard(week([['08:07', '16:53', 30]]), { rounding: 0, weeklyThresholdHours: 40, dailyThresholdHours: null }));
    expect(raw.totalMinutes).toBe(496);
  });
  it('validates half-filled days and breaks longer than the shift', () => {
    expect(calculateTimeCard(week([['09:00', '', 0]]), { rounding: 0, weeklyThresholdHours: 40, dailyThresholdHours: null }).ok).toBe(false);
    expect(calculateTimeCard(week([['09:00', '10:00', 90]]), { rounding: 0, weeklyThresholdHours: 40, dailyThresholdHours: null }).ok).toBe(false);
  });
  it('exports CSV with a totals row', () => {
    const r = ok(calculateTimeCard(week([['09:00', '17:00', 60]]), { rounding: 0, weeklyThresholdHours: 40, dailyThresholdHours: null }));
    const csv = timeCardCsv(r).split('\n');
    expect(csv[0]).toMatch(/^Day,Start,End/);
    expect(csv[1]).toBe('Mon,09:00,17:00,60,7:00,7.00,7.00,0.00');
    expect(csv[csv.length - 1]).toBe('Total,,,,7:00,7.00,7.00,0.00');
  });
});

describe('GPA', () => {
  it('maps letters and percentages on the common US 4.0 scale', () => {
    expect(gradePoints('A-', 'standard')).toEqual({ points: 3.7, letter: 'A-' });
    expect(gradePoints('b+', 'standard')).toEqual({ points: 3.3, letter: 'B+' });
    expect(gradePoints('A+', 'plus43')).toEqual({ points: 4.3, letter: 'A+' });
    expect(gradePoints('B-', 'simple')).toEqual({ points: 3, letter: 'B-' });
    expect(gradePoints('91', 'standard')).toEqual({ points: 3.7, letter: 'A-' });
    expect(gradePoints('P', 'standard')).toBe('excluded');
    expect(gradePoints('Z', 'standard')).toBeNull();
    expect(percentToLetter(89.9)).toBe('B+');
    expect(percentToLetter(59)).toBe('F');
  });
  it('computes a credit-weighted GPA (textbook example)', () => {
    // A (4.0 x 3) + B+ (3.3 x 4) + C (2.0 x 3) = 12 + 13.2 + 6 = 31.2 / 10 = 3.12
    const r = ok(calculateGpa([
      { grade: 'A', credits: 3, type: 'regular' },
      { grade: 'B+', credits: 4, type: 'regular' },
      { grade: 'C', credits: 3, type: 'regular' },
    ], { scale: 'standard', honorsBonus: 0.5, apBonus: 1 }));
    expect(r.credits).toBe(10);
    expect(r.qualityPoints).toBe(31.2);
    expect(r.unweighted).toBeCloseTo(3.12, 10);
    expect(r.weighted).toBeCloseTo(3.12, 10);
  });
  it('adds honors and AP bonuses to the weighted GPA only', () => {
    const r = ok(calculateGpa([
      { grade: 'A', credits: 1, type: 'ap' },
      { grade: 'B', credits: 1, type: 'honors' },
      { grade: 'B', credits: 1, type: 'regular' },
      { grade: 'F', credits: 1, type: 'ap' },
    ], { scale: 'standard', honorsBonus: 0.5, apBonus: 1 }));
    expect(r.unweighted).toBe(2.5);
    expect(r.weighted).toBeCloseTo((5 + 3.5 + 3 + 0) / 4, 10);
  });
  it('skips pass/fail courses and folds in prior credits', () => {
    const r = ok(calculateGpa([
      { grade: 'A', credits: 3, type: 'regular' },
      { grade: 'P', credits: 2, type: 'regular' },
      { grade: 'B', credits: 3, type: 'regular' },
    ], { scale: 'standard', honorsBonus: 0.5, apBonus: 1 }, { gpa: 3.2, credits: 30 }));
    expect(r.credits).toBe(6);
    expect(r.unweighted).toBe(3.5);
    // (3.2 x 30 + 21) / 36 = 117 / 36 = 3.25
    expect(r.cumulativeUnweighted).toBeCloseTo(3.25, 10);
    expect(r.cumulativeCredits).toBe(36);
  });
  it('rejects bad input', () => {
    expect(calculateGpa([], { scale: 'standard', honorsBonus: 0.5, apBonus: 1 }).ok).toBe(false);
    expect(calculateGpa([{ grade: 'Q', credits: 3, type: 'regular' }], { scale: 'standard', honorsBonus: 0.5, apBonus: 1 }).ok).toBe(false);
    expect(calculateGpa([{ grade: 'A', credits: -3, type: 'regular' }], { scale: 'standard', honorsBonus: 0.5, apBonus: 1 }).ok).toBe(false);
  });
  it('plans the GPA needed to reach a target', () => {
    // 3.0 over 60 credits, aiming for 3.3 after 30 more: (3.3 x 90 - 180) / 30 = 3.9
    expect(ok(requiredGpa(3.0, 60, 3.3, 30)).required).toBeCloseTo(3.9, 10);
    expect(ok(requiredGpa(3.5, 0, 3.5, 15)).required).toBeCloseTo(3.5, 10);
    expect(requiredGpa(3, 60, 3.3, 0).ok).toBe(false);
  });
});

describe('final grade', () => {
  it('solves for the final exam score', () => {
    // 85% now, final worth 20%, want 90%: (90 - 85 x 0.8) / 0.2 = 110
    expect(ok(requiredFinal(85, 20, 90)).required).toBeCloseTo(110, 10);
    // 88% now, final 25%, want 85%: (85 - 66) / 0.25 = 76
    expect(ok(requiredFinal(88, 25, 85)).required).toBeCloseTo(76, 10);
    expect(ok(requiredFinal(95, 30, 60)).required).toBeLessThan(0) // (60 - 66.5) / 0.3 < 0;
    expect(requiredFinal(80, 0, 90).ok).toBe(false);
  });
  it('projects the grade for a given final score', () => {
    expect(ok(gradeWithFinal(88, 25, 76)).grade).toBeCloseTo(85, 10);
    expect(ok(gradeWithFinal(80, 40, 50)).grade).toBeCloseTo(68, 10);
  });
  it('handles weighted categories', () => {
    const r = ok(weightedCategories([
      { name: 'Homework', weight: 20, score: 95 },
      { name: 'Quizzes', weight: 20, score: 85 },
      { name: 'Midterm', weight: 25, score: 78 },
      { name: 'Final', weight: 35, score: null },
    ], 3, 85));
    // current = (1900 + 1700 + 1950) / 65 = 85.3846...
    expect(r.current).toBeCloseTo(5550 / 65, 8);
    // need (8500 - 5550) / 35 = 84.2857...
    expect(r.required!).toBeCloseTo(2950 / 35, 8);
    expect(weightedCategories([{ name: 'A', weight: 50, score: 90 }, { name: 'F', weight: 40, score: null }], 1, 90).ok).toBe(false);
  });
});
