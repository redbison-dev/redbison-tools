/**
 * Market overtime rules and the GST mode of the VAT calculator, used by the
 * localized overtime and VAT pages (wave 1, batch l3). US rules are pinned in
 * calc-pay.test.ts and must not change.
 */
import { describe, expect, it } from 'vitest';
import { addVat, dailyOvertime, formatMoney, removeVat, weeklyOvertime } from '@/lib/tools/calculators/pay';

const run = (days: number[], rule: Parameters<typeof dailyOvertime>[0]['rule'], extra: Partial<Parameters<typeof dailyOvertime>[0]> = {}, rate = 25) => {
  const r = dailyOvertime({ hourlyRate: rate, days, rule, ...extra });
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const split = (v: ReturnType<typeof run>) => v.breakdown.map((d) => [d.regular, d.overtime, d.doubleTime]);

describe('Canadian overtime rules', () => {
  it('federal: the greater of daily (over 8) and weekly (over 40) overtime, not both', () => {
    const v = run([12, 12, 12, 12, 0, 0, 0], 'ca-federal', {}, 30);
    expect([v.regularHours, v.overtimeHours]).toEqual([32, 16]);
    expect(v.totalPay).toBeCloseTo(1680, 9);
    // Weekly wins when the days are short but many: 6 x 8 = 48 h, no day over 8.
    const w = run([8, 8, 8, 8, 8, 8, 0], 'ca-federal');
    expect([w.regularHours, w.overtimeHours]).toEqual([40, 8]);
  });

  it('Ontario: weekly only, after 44 hours', () => {
    const v = run([12, 12, 12, 12, 0, 0, 0], 'ontario');
    expect([v.regularHours, v.overtimeHours]).toEqual([44, 4]);
    expect(v.totalPay).toBeCloseTo(1250, 9);
    const wk = weeklyOvertime({ hourlyRate: 25, hoursWorked: 48, threshold: 44, multiplier: 1.5 });
    expect(wk.ok && wk.value.totalPay).toBeCloseTo(1250, 9);
  });

  it('Alberta: the 8/44 rule takes whichever gives more overtime hours', () => {
    const daily = run([10, 10, 10, 10, 0, 0, 0], 'alberta', {}, 28);
    expect([daily.regularHours, daily.overtimeHours]).toEqual([32, 8]); // 40 h in the week, but 2 h a day over 8
    expect(daily.totalPay).toBeCloseTo(1232, 9);
    const weekly = run([8, 8, 8, 8, 8, 8, 0], 'alberta', {}, 28);
    expect([weekly.regularHours, weekly.overtimeHours]).toEqual([44, 4]);
  });

  it('BC: matches the Employment Standards Branch section 40 example (8, 10, 8, 13 hours)', () => {
    const v = run([8, 10, 8, 13, 0, 0, 0], 'bc', {}, 26);
    expect(split(v).slice(0, 4)).toEqual([[8, 0, 0], [8, 2, 0], [8, 0, 0], [8, 4, 1]]);
    expect([v.overtimeHours, v.doubleTimeHours]).toEqual([6, 1]);
    expect(v.totalPay).toBeCloseTo(1118, 9);
  });

  it('BC: weekly overtime counts only the first 8 hours of each day', () => {
    // 5 x 10 h: 10 daily overtime hours, and the 40 straight-time hours do not exceed 40.
    const v = run([10, 10, 10, 10, 10, 0, 0], 'bc', {}, 26);
    expect([v.regularHours, v.overtimeHours, v.doubleTimeHours]).toEqual([40, 10, 0]);
    // The ministry's weekly example: 8, 7, 8, 8, 7, 7 = 45 h, 5 h weekly overtime.
    const w = run([8, 7, 8, 8, 7, 7, 0], 'bc', {}, 26);
    expect([w.regularHours, w.overtimeHours]).toEqual([40, 5]);
  });
});

describe('India (OSH Code 2020)', () => {
  it('pays twice the ordinary rate over 8 hours a day or 48 a week, whichever is more', () => {
    const v = run([10, 10, 10, 10, 10, 10, 0], 'india', { multiplier: 2 }, 150);
    expect([v.regularHours, v.overtimeHours]).toEqual([48, 12]);
    expect(v.overtimePay).toBeCloseTo(3600, 9);
    expect(v.totalPay).toBeCloseTo(10800, 9);
    const sunday = run([8, 8, 8, 8, 8, 8, 4], 'india', { multiplier: 2 }, 120);
    expect([sunday.regularHours, sunday.overtimeHours]).toEqual([48, 4]);
    expect(sunday.totalPay).toBeCloseTo(6720, 9);
  });

  it('takes a longer normal day for a five-day week (9.5 h)', () => {
    const v = run([10.5, 10.5, 10.5, 10.5, 10.5, 0, 0], 'india', { multiplier: 2, ordinaryDayHours: 9.5 }, 150);
    expect([v.regularHours, v.overtimeHours]).toEqual([47.5, 5]);
    expect(v.totalPay).toBeCloseTo(8625, 9);
  });

  it('formats rupees with Indian digit grouping', () => {
    expect(formatMoney(1234567.5, 'INR')).toBe('₹12,34,567.50');
    expect(formatMoney(1234567.5, 'USD')).toBe('$1,234,567.50');
  });
});

describe('Australian award overtime', () => {
  it('daily ordinary maximum and 38-hour week, first 3 overtime hours a day at 150%, then 200%', () => {
    const v = run([9, 11, 9, 9, 9, 0, 0], 'au-award', { multiplier: 1.5, ordinaryDayHours: 9, firstTierHours: 3 }, 28);
    expect(split(v).slice(0, 5)).toEqual([[9, 0, 0], [9, 2, 0], [9, 0, 0], [9, 0, 0], [2, 3, 4]]);
    expect([v.regularHours, v.overtimeHours, v.doubleTimeHours]).toEqual([38, 5, 4]);
    expect(v.totalPay).toBeCloseTo(1498, 9);
  });

  it('a Saturday shift after 40 hours, and a 2-hour first tier as in the Security Award', () => {
    const sat = run([8, 8, 8, 8, 8, 6, 0], 'au-award', { multiplier: 1.5, ordinaryDayHours: 9, firstTierHours: 3 }, 30);
    expect([sat.regularHours, sat.overtimeHours, sat.doubleTimeHours]).toEqual([38, 5, 3]);
    expect(sat.totalPay).toBeCloseTo(1545, 9);
    const sec = run([7.6, 7.6, 7.6, 7.6, 12, 0, 0], 'au-award', { multiplier: 1.5, ordinaryDayHours: 10, firstTierHours: 2 }, 30);
    expect([sec.regularHours, sec.overtimeHours, sec.doubleTimeHours]).toEqual([38, 2, 2.4]);
    expect(sec.totalPay).toBeCloseTo(1374, 9);
  });

  it('rejects a bad ordinary day', () => {
    expect(dailyOvertime({ hourlyRate: 30, days: [8], rule: 'au-award', ordinaryDayHours: 0 }).ok).toBe(false);
  });
});

describe('US rules are unchanged', () => {
  it('FLSA and California still give their published results', () => {
    expect(run([10, 10, 10, 10, 8, 0, 0], 'california', {}, 20).totalPay).toBeCloseTo(1040, 9);
    expect(run([10, 10, 10, 10, 8, 0, 0], 'flsa', {}, 20).totalPay).toBeCloseTo(1040, 9);
  });
});

describe('GST at 10% (Australia)', () => {
  it('one eleventh of a GST-inclusive price, as business.gov.au puts it ($1,100 includes $100)', () => {
    const r = removeVat(1100, 10);
    expect(r.ok && r.value.tax).toBeCloseTo(100, 9);
    expect(r.ok && r.value.net).toBeCloseTo(1000, 9);
    const a = addVat(450, 10);
    expect(a.ok && a.value.gross).toBeCloseTo(495, 9);
  });
});
