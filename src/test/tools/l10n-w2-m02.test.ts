/**
 * Pins the worked examples in the wave 2 batch m02 market versions
 * (src/config/toolContent/l10n/<locale>/w2-m02.ts) to the tools' own functions,
 * so a change in the maths or the copy cannot drift apart unnoticed.
 */
import { describe, expect, it } from 'vitest';
import { calculateAge, calculateTimeCard, gradeWithFinal, parseISODate, requiredFinal, weightedCategories, type TimeCardDay } from '@/lib/tools/calculators/everyday-a';
import { actualSpeed, compareTires, economyFromUsage, fuelTripCost, parseTireSize } from '@/lib/tools/calculators/everyday-b';

const val = <T,>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (r.ok === false) throw new Error(r.error);
  return r.value;
};

const trip = (distance: number, unit: 'km' | 'mi', economy: number, economyUnit: 'mpg-uk' | 'l100km' | 'kml', price: number, roundTrip = false, passengers = 1) =>
  val(fuelTripCost({ distance, distanceUnit: unit, economy, economyUnit, price, priceUnit: 'per-l', roundTrip, passengers }));

const age = (dob: string, on: string) => {
  const r = val(calculateAge(parseISODate(dob)!, parseISODate(on)!, 'mar1'));
  return [r.years, r.months, r.days];
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const week = (spec: string): TimeCardDay[] =>
  spec.split(';').map((d, i) => {
    const [start = '', end = '', brk = ''] = d.split('|');
    return { label: DAYS[i], start, end, breakMinutes: brk === '' ? 0 : Number(brk) };
  });

const tyre = (a: string, b: string) => compareTires(val(parseTireSize(a)), val(parseTireSize(b)));

describe('fuel cost market examples', () => {
  it('en-GB: London to Manchester, diesel, advisory fuel rate and fill-up', () => {
    const lm = trip(200, 'mi', 45, 'mpg-uk', 1.7278, true, 2);
    expect(lm.litres).toBeCloseTo(40.41, 2);
    expect(lm.impGallons).toBeCloseTo(8.89, 2);
    expect(lm.cost).toBeCloseTo(69.82, 2);
    expect(lm.costPerPerson).toBeCloseTo(34.91, 2);
    expect(lm.costPerMile).toBeCloseTo(0.175, 3);
    expect(trip(200, 'mi', 45, 'mpg-uk', 1.7278).cost).toBeCloseTo(34.91, 2);
    expect(trip(200, 'mi', 45, 'mpg-uk', 1.7278).cost - trip(200, 'mi', 55, 'mpg-uk', 1.9858).cost).toBeCloseTo(2.08, 2);
    const diesel = trip(200, 'mi', 55, 'mpg-uk', 1.9858);
    expect(diesel.litres).toBeCloseTo(16.53, 2);
    expect(diesel.cost).toBeCloseTo(32.83, 2);
    expect(diesel.costPerMile).toBeCloseTo(0.164, 3);
    // HMRC advisory fuel rate: 42.8 mpg at 159.9p rounds to 17p a mile.
    expect(Math.round(trip(100, 'mi', 42.8, 'mpg-uk', 1.599).cost)).toBe(17);
    expect(trip(100, 'mi', 42.8, 'mpg-uk', 1.599).cost).toBeCloseTo(16.98, 2);
    expect(trip(100, 'mi', 42.8, 'mpg-uk', 1.7278).cost).toBeCloseTo(18.35, 2);
    const fill = val(economyFromUsage(412, 'mi', 41.6, 'l'));
    expect(fill['mpg-uk']).toBeCloseTo(45.0, 1);
    expect(fill['mpg-us']).toBeCloseTo(37.5, 1);
    expect(fill.l100km).toBeCloseTo(6.27, 2);
  });

  it('en-IN: Delhi to Jaipur, Mumbai to Pune, commute and mileage', () => {
    const dj = trip(280, 'km', 18, 'kml', 102.12, true, 4);
    expect(dj.litres).toBeCloseTo(31.11, 2);
    expect(dj.cost).toBeCloseTo(3177.07, 2);
    expect(dj.costPerPerson).toBeCloseTo(794.27, 2);
    expect(dj.costPerKm).toBeCloseTo(5.67, 2);
    const mp = trip(150, 'km', 15, 'kml', 111.21, true);
    expect(mp.litres).toBeCloseTo(20, 6);
    expect(mp.cost).toBeCloseTo(2224.2, 2);
    expect(mp.costPerKm).toBeCloseTo(7.41, 2);
    expect(trip(1, 'km', 15, 'kml', 102.12).cost).toBeCloseTo(6.81, 2);
    const commute = trip(880, 'km', 50, 'kml', 102.12);
    expect(commute.litres).toBeCloseTo(17.6, 6);
    expect(commute.cost).toBeCloseTo(1797.31, 2);
    expect(commute.costPerKm).toBeCloseTo(2.04, 2);
    const fill = val(economyFromUsage(486, 'km', 31.5, 'l'));
    expect(fill.kml).toBeCloseTo(15.43, 2);
    expect(fill.l100km).toBeCloseTo(6.48, 2);
  });

  it('en-CA: Toronto to Montréal, Calgary to Vancouver, a year of driving, fill-up', () => {
    const tm = trip(541, 'km', 7.8, 'l100km', 1.843, true, 3);
    expect(tm.litres).toBeCloseTo(84.4, 2);
    expect(tm.cost).toBeCloseTo(155.54, 2);
    expect(tm.costPerPerson).toBeCloseTo(51.85, 2);
    expect(tm.costPerKm).toBeCloseTo(0.144, 3);
    const cv = trip(973, 'km', 9.4, 'l100km', 2.095);
    expect(cv.litres).toBeCloseTo(91.46, 2);
    expect(cv.cost).toBeCloseTo(191.61, 2);
    const a = trip(20000, 'km', 7.8, 'l100km', 1.843).cost;
    const b = trip(20000, 'km', 10.5, 'l100km', 1.843).cost;
    expect(a).toBeCloseTo(2875.08, 2);
    expect(b).toBeCloseTo(3870.3, 2);
    expect(b - a).toBeCloseTo(995.22, 2);
    expect(trip(100, 'km', 7.8, 'l100km', 1.843).cost).toBeCloseTo(14.38, 2);
    expect(trip(100, 'km', 10.5, 'l100km', 1.843).cost).toBeCloseTo(19.35, 2);
    const fill = val(economyFromUsage(612, 'km', 48.3, 'l'));
    expect(fill.l100km).toBeCloseTo(7.89, 2);
    expect(fill.kml).toBeCloseTo(12.67, 2);
    expect(fill['mpg-us']).toBeCloseTo(29.8, 1);
  });

  it('en-AU: Sydney to Canberra, diesel ute, commuting and fill-up', () => {
    const sc = trip(286, 'km', 7.5, 'l100km', 2.362, true, 2);
    expect(sc.litres).toBeCloseTo(42.9, 6);
    expect(sc.cost).toBeCloseTo(101.33, 2);
    expect(sc.costPerPerson).toBeCloseTo(50.66, 2);
    expect(sc.costPerKm).toBeCloseTo(0.177, 3);
    const ute = trip(920, 'km', 9.8, 'l100km', 2.766);
    expect(ute.litres).toBeCloseTo(90.16, 6);
    expect(ute.cost).toBeCloseTo(249.38, 2);
    expect(ute.costPerKm).toBeCloseTo(0.271, 3);
    expect(trip(920, 'km', 9.8, 'l100km', 2.362).cost).toBeCloseTo(212.96, 2);
    const city = trip(300, 'km', 7.5, 'l100km', 2.362).cost;
    const regional = trip(300, 'km', 7.5, 'l100km', 2.467).cost;
    expect(city).toBeCloseTo(53.15, 2);
    expect(regional).toBeCloseTo(55.51, 2);
    expect(regional - city).toBeCloseTo(2.36, 2);
    expect(trip(100, 'km', 7.5, 'l100km', 2.362).cost).toBeCloseTo(17.72, 2);
    expect(trip(100, 'km', 9.8, 'l100km', 2.766).cost).toBeCloseTo(27.11, 2);
    const fill = val(economyFromUsage(540, 'km', 46.2, 'l'));
    expect(fill.l100km).toBeCloseTo(8.56, 2);
    expect(fill.kml).toBeCloseTo(11.69, 2);
  });
});

describe('age calculator market examples', () => {
  it('en-IN: UPSC CSE 2026 age as on 1 August 2026', () => {
    expect(age('1994-08-02', '2026-08-01')).toEqual([31, 11, 30]);
    expect(age('1994-08-01', '2026-08-01')).toEqual([32, 0, 0]);
    expect(age('2005-08-01', '2026-08-01')).toEqual([21, 0, 0]);
    expect(age('2005-08-02', '2026-08-01')).toEqual([20, 11, 30]);
    expect(age('2004-02-29', '2026-08-01')).toEqual([22, 5, 3]);
    expect(age('1991-03-15', '2026-08-01')).toEqual([35, 4, 17]);
    expect(val(calculateAge(parseISODate('1994-08-02')!, parseISODate('2026-08-01')!, 'mar1')).totalDays).toBe(11687);
  });

  it('en-GB: school year cut-off and driving licence ages', () => {
    expect(age('2022-08-31', '2026-09-01')).toEqual([4, 0, 1]);
    expect(age('2022-09-01', '2026-09-01')).toEqual([4, 0, 0]);
    expect(age('2010-02-06', '2026-11-06')).toEqual([16, 9, 0]);
    expect(age('2009-11-20', '2026-11-06')).toEqual([16, 11, 17]);
  });
});

describe('final grade market examples', () => {
  it('en-IN: CBSE Class 10 internal assessment and board paper', () => {
    expect(val(requiredFinal(90, 80, 95)).required).toBeCloseTo(96.25, 6);
    expect(val(requiredFinal(90, 80, 95)).required * 0.8).toBeCloseTo(77, 6);
    expect(val(requiredFinal(90, 80, 90)).required).toBeCloseTo(90, 6);
    expect(val(requiredFinal(90, 80, 90)).required * 0.8).toBeCloseTo(72, 6);
    expect(val(requiredFinal(75, 80, 95)).required).toBeCloseTo(100, 6);
    expect(val(gradeWithFinal(90, 80, 70)).grade).toBeCloseTo(74, 6);
    expect(val(requiredFinal(80, 60, 60)).required).toBeCloseTo(46.67, 2);
    expect(val(requiredFinal(80, 60, 60)).required * 0.6).toBeCloseTo(28, 6);
    const cats = val(weightedCategories([{ name: 'Internal assessment', weight: 20, score: 90 }, { name: 'Board exam (theory)', weight: 80, score: null }], 1, 90));
    expect(cats.required).toBeCloseTo(90, 6);
  });

  it('en-CA: Ontario 65/25/10 and 65/20/15 splits', () => {
    const g12 = [{ name: 'Classroom work', weight: 65, score: 78 }, { name: 'Attendance and participation', weight: 10, score: 90 }, { name: 'Final exam', weight: 25, score: null }];
    const r = val(weightedCategories(g12, 2, 80));
    expect(r.current).toBeCloseTo(79.6, 6);
    expect(r.earned).toBeCloseTo(59.7, 6);
    expect(r.completedWeight).toBe(75);
    expect(r.required).toBeCloseTo(81.2, 6);
    expect(val(weightedCategories(g12, 2, 50)).required).toBeLessThanOrEqual(0);
    expect(r.earned + 0.25 * 70).toBeCloseTo(77.2, 6);
    const g10 = [{ name: 'Classroom work', weight: 65, score: 62 }, { name: 'Attendance and participation', weight: 15, score: 80 }, { name: 'Final exam', weight: 20, score: null }];
    const r10 = val(weightedCategories(g10, 2, 70));
    expect(r10.current).toBeCloseTo(65.38, 2);
    expect(r10.earned).toBeCloseTo(52.3, 6);
    expect(r10.required).toBeCloseTo(88.5, 6);
  });
});

describe('time card market examples', () => {
  it('en-GB: National Living Wage week, contract overtime and nights', () => {
    const wk = week('08:00|16:30|30;08:00|16:30|30;08:00|16:30|30;08:00|18:30|30;08:00|16:30|30;08:00|13:00|0;');
    const flat = val(calculateTimeCard(wk, { rounding: 0, weeklyThresholdHours: null, dailyThresholdHours: null, hourlyRate: 12.71, overtimeMultiplier: 1.5 }));
    expect(flat.totalMinutes).toBe(47 * 60);
    expect(flat.totalPay).toBeCloseTo(597.37, 2);
    const ot = val(calculateTimeCard(wk, { rounding: 0, weeklyThresholdHours: 37.5, dailyThresholdHours: null, hourlyRate: 12.71, overtimeMultiplier: 1.5 }));
    expect(ot.regularMinutes / 60).toBeCloseTo(37.5, 6);
    expect(ot.overtimeMinutes / 60).toBeCloseTo(9.5, 6);
    expect(ot.regularPay).toBeCloseTo(476.63, 2);
    expect(ot.overtimePay).toBeCloseTo(181.12, 2);
    expect(ot.totalPay).toBeCloseTo(657.75, 2);
    expect(ot.days[4].overtimeMinutes).toBe(270);
    expect(ot.days[5].overtimeMinutes).toBe(300);
    const nights = val(calculateTimeCard(week('22:00|06:00|20;22:00|06:00|20;22:00|06:00|20;22:00|06:00|20;;;'), { rounding: 0, weeklyThresholdHours: null, dailyThresholdHours: null, hourlyRate: 12.71, overtimeMultiplier: 1.5 }));
    expect(nights.totalMinutes).toBe(30 * 60 + 40);
    expect(nights.totalDecimal).toBeCloseTo(30.67, 2);
    expect(nights.totalPay).toBeCloseTo(389.77, 2);
  });

  it('en-CA: Ontario 44 hour week, Canada Labour Code 8 and 40, minimum wage', () => {
    const wk = week('07:00|17:30|30;07:00|17:30|30;07:00|17:30|30;07:00|17:30|30;07:00|16:00|30;;');
    const on = val(calculateTimeCard(wk, { rounding: 0, weeklyThresholdHours: 44, dailyThresholdHours: null, hourlyRate: 25, overtimeMultiplier: 1.5 }));
    expect(on.totalDecimal).toBeCloseTo(48.5, 6);
    expect(on.regularMinutes / 60).toBeCloseTo(44, 6);
    expect(on.overtimeMinutes / 60).toBeCloseTo(4.5, 6);
    expect(on.days[4].overtimeMinutes).toBe(270);
    expect(on.regularPay).toBeCloseTo(1100, 2);
    expect(on.overtimePay).toBeCloseTo(168.75, 2);
    expect(on.totalPay).toBeCloseTo(1268.75, 2);
    const fed = val(calculateTimeCard(wk, { rounding: 0, weeklyThresholdHours: 40, dailyThresholdHours: 8, hourlyRate: 25, overtimeMultiplier: 1.5 }));
    expect(fed.regularMinutes / 60).toBeCloseTo(40, 6);
    expect(fed.overtimeMinutes / 60).toBeCloseTo(8.5, 6);
    expect(fed.totalPay).toBeCloseTo(1318.75, 2);
    const min = val(calculateTimeCard(week('09:00|17:30|30;09:00|17:30|30;09:00|17:30|30;09:00|17:30|30;09:00|17:30|30;;'), { rounding: 0, weeklyThresholdHours: 44, dailyThresholdHours: null, hourlyRate: 17.95, overtimeMultiplier: 1.5 }));
    expect(min.totalDecimal).toBe(40);
    expect(min.overtimeMinutes).toBe(0);
    expect(min.totalPay).toBeCloseTo(718, 2);
  });
});

describe('tyre size market examples', () => {
  it('en-GB: alloy upgrade, winter set and wider tyre in mph', () => {
    const up = tyre('205/55R16', '225/40R18');
    expect(up.a.diameterMm).toBeCloseTo(631.9, 1);
    expect(up.b.diameterMm).toBeCloseTo(637.2, 1);
    expect(up.diameterDiffPct).toBeCloseTo(0.84, 2);
    expect(actualSpeed(70, up)).toBeCloseTo(70.6, 1);
    expect(up.a.sidewallMm).toBeCloseTo(112.75, 2);
    expect(up.b.sidewallMm).toBeCloseTo(90, 2);
    expect(up.a.revsPerKm).toBeCloseTo(504, 0);
    const winter = tyre('225/45R17', '215/60R16');
    expect(winter.diameterDiffMm).toBeCloseTo(30.1, 1);
    expect(winter.diameterDiffPct).toBeCloseTo(4.75, 2);
    expect(winter.withinGuideline).toBe(false);
    expect(actualSpeed(70, winter)).toBeCloseTo(73.3, 1);
    const alt = tyre('225/45R17', '205/60R16');
    expect(alt.diameterDiffMm).toBeCloseTo(18.1, 1);
    expect(alt.diameterDiffPct).toBeCloseTo(2.85, 2);
    expect(actualSpeed(70, alt)).toBeCloseTo(72.0, 1);
    const wider = tyre('205/55R16', '215/55R16');
    expect(wider.diameterDiffMm).toBeCloseTo(11, 6);
    expect(wider.diameterDiffPct).toBeCloseTo(1.74, 2);
    expect(actualSpeed(30, wider)).toBeCloseTo(30.5, 1);
  });

  it('en-CA: winter minus-sizing in km/h', () => {
    const sedan = tyre('225/45R17', '205/60R16');
    expect(sedan.withinGuideline).toBe(true);
    expect(actualSpeed(100, sedan)).toBeCloseTo(102.9, 1);
    expect(sedan.a.sidewallMm).toBeCloseTo(101.25, 2);
    expect(sedan.b.sidewallMm).toBeCloseTo(123, 2);
    expect(actualSpeed(100, tyre('225/45R17', '215/60R16'))).toBeCloseTo(104.7, 1);
    const suv18 = tyre('235/55R19', '235/60R18');
    expect(suv18.a.diameterMm).toBeCloseTo(741.1, 1);
    expect(suv18.b.diameterMm).toBeCloseTo(739.2, 1);
    expect(suv18.diameterDiffPct).toBeCloseTo(-0.26, 2);
    const suv17 = tyre('235/55R19', '225/65R17');
    expect(suv17.b.diameterMm).toBeCloseTo(724.3, 1);
    expect(suv17.diameterDiffPct).toBeCloseTo(-2.27, 2);
    expect(actualSpeed(100, suv17)).toBeCloseTo(97.7, 1);
  });
});
