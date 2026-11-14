/**
 * Edge, corner, positive and negative cases for the pay/shopping and
 * business calculators (lane 6 of docs/test-coverage-plan.md). Expected
 * values come from published rules (FLSA, California Labor Code 510, IRS
 * Pub 946) or hand calculations written beside each assertion.
 */
import { describe, it, expect } from 'vitest';
import {
  roundMoney,
  formatMoney,
  periodsPerYear,
  convertSalary,
  weeklyOvertime,
  dailyOvertime,
  raiseByPercent,
  raiseByAmount,
  raiseBetween,
  calculateTip,
  percentOff,
  amountOff,
  stackedDiscount,
  equivalentDiscount,
  buyXGetY,
  originalFromSale,
  combinedRate,
  addTax,
  removeTax,
  rateFromAmounts,
  vatFraction,
  addVat,
  removeVat,
  type SalaryInput,
} from '@/lib/tools/calculators/pay';
import {
  roundMoney as bizRound,
  markupToMargin,
  marginToMarkup,
  solveMarginMarkup,
  marginMistake,
  breakEven,
  preTaxTarget,
  breakEvenChart,
  depreciationSchedule,
  validateTiers,
  tieredMarginal,
  tieredWholeAmount,
  flatCommission,
  drawSchedule,
  rateForTarget,
  salesForTarget,
  parseNumberList,
  salesForCommission,
  encodeTiers,
  decodeTiers,
  type CommissionTier,
} from '@/lib/tools/calculators/biz';

const cents = (x: number) => Math.round(x * 100) / 100;
const ok = <T,>(r: { ok: boolean; value?: T; error?: string }): T => {
  expect(r.error).toBeUndefined();
  return r.value as T;
};

describe('pay: money helpers', () => {
  it('roundMoney rounds halves away from zero without binary drift', () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(1234.5, 0)).toBe(1235);
    expect(roundMoney(0)).toBe(0);
    expect(roundMoney(NaN)).toBeNaN();
  });
  it('formatMoney: JPY has no decimals, non-finite shows a dash, unknown codes fall back', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50');
    expect(formatMoney(1234.5, 'JPY')).toBe('¥1,235');
    expect(formatMoney(Infinity)).toBe('-');
    expect(formatMoney(NaN, 'EUR')).toBe('-');
    expect(formatMoney(12.345, 'NOT-A-CODE')).toBe('12.35');
    expect(formatMoney(5, 'USD', 0)).toBe('$5');
  });
});

const salary = (o: Partial<SalaryInput> = {}): SalaryInput => ({
  amount: 52000, period: 'annual', hoursPerWeek: 40, daysPerWeek: 5, holidaysPerYear: 0, vacationDaysPerYear: 0, ...o,
});

describe('pay: convertSalary', () => {
  it('periodsPerYear for every period', () => {
    expect(periodsPerYear('hourly', 40, 5)).toBe(2080);
    expect(periodsPerYear('daily', 40, 5)).toBe(260);
    expect(periodsPerYear('weekly', 40, 5)).toBe(52);
    expect(periodsPerYear('biweekly', 40, 5)).toBe(26);
    expect(periodsPerYear('semimonthly', 40, 5)).toBe(24);
    expect(periodsPerYear('monthly', 40, 5)).toBe(12);
    expect(periodsPerYear('quarterly', 40, 5)).toBe(4);
    expect(periodsPerYear('annual', 40, 5)).toBe(1);
  });
  it('52,000 a year = 25/hour on a 2,080-hour year', () => {
    const r = ok(convertSalary(salary()));
    expect(r.unadjusted.hourly).toBe(25);
    expect(r.unadjusted.daily).toBe(200);
    expect(r.unadjusted.weekly).toBe(1000);
    expect(r.unadjusted.semimonthly).toBeCloseTo(2166.6667, 4);
    expect(r.adjusted).toEqual(r.unadjusted);
  });
  it('salaried: 10 holidays + 15 vacation days leave 235 days / 1,880 hours, so the hourly rate rises', () => {
    const r = ok(convertSalary(salary({ holidaysPerYear: 10, vacationDaysPerYear: 15 })));
    expect(r.workedDays).toBe(235);
    expect(r.workedHours).toBe(1880);
    expect(r.adjusted.annual).toBe(52000);
    expect(r.adjusted.hourly).toBeCloseTo(52000 / 1880, 9);
  });
  it('hourly: unpaid time off lowers the yearly total (20/h x 1,880 h = 37,600)', () => {
    const r = ok(convertSalary(salary({ amount: 20, period: 'hourly', holidaysPerYear: 10, vacationDaysPerYear: 15 })));
    expect(r.unadjusted.annual).toBe(41600);
    expect(r.adjusted.annual).toBe(37600);
    expect(r.adjusted.hourly).toBe(20);
  });
  it('daily pay with a 4-day, 10-hour week (edge: 10 h/day)', () => {
    const r = ok(convertSalary(salary({ amount: 300, period: 'daily', hoursPerWeek: 40, daysPerWeek: 4 })));
    expect(r.hoursPerDay).toBe(10);
    expect(r.unadjusted.annual).toBe(300 * 4 * 52);
    expect(r.unadjusted.hourly).toBe(30);
  });
  it('zero pay is allowed; a 168-hour 7-day week is the maximum', () => {
    expect(ok(convertSalary(salary({ amount: 0 }))).unadjusted.hourly).toBe(0);
    expect(convertSalary(salary({ hoursPerWeek: 168, daysPerWeek: 7 })).ok).toBe(true);
  });
  it('rejects negative pay, impossible schedules and time off that uses every day', () => {
    expect(convertSalary(salary({ amount: -1 })).ok).toBe(false);
    expect(convertSalary(salary({ amount: NaN })).ok).toBe(false);
    expect(convertSalary(salary({ hoursPerWeek: 0 })).ok).toBe(false);
    expect(convertSalary(salary({ hoursPerWeek: 169 })).ok).toBe(false);
    expect(convertSalary(salary({ daysPerWeek: 0 })).ok).toBe(false);
    expect(convertSalary(salary({ daysPerWeek: 8 })).ok).toBe(false);
    expect(convertSalary(salary({ hoursPerWeek: 100, daysPerWeek: 4 })).error).toMatch(/24 hours/);
    expect(convertSalary(salary({ holidaysPerYear: -1 })).ok).toBe(false);
    expect(convertSalary(salary({ vacationDaysPerYear: NaN })).ok).toBe(false);
    expect(convertSalary(salary({ holidaysPerYear: 200, vacationDaysPerYear: 60 })).error).toMatch(/every working day/);
  });
});

describe('pay: overtime', () => {
  it('FLSA weekly: 45 h at 20/h = 40 x 20 + 5 x 30 = 950 (29 U.S.C. 207)', () => {
    const r = ok(weeklyOvertime({ hourlyRate: 20, hoursWorked: 45, threshold: 40, multiplier: 1.5 }));
    expect(r.regularPay).toBe(800);
    expect(r.overtimePay).toBe(150);
    expect(r.totalPay).toBe(950);
    expect(r.effectiveHourly).toBeCloseTo(950 / 45, 9);
  });
  it('exactly 40 hours has no overtime; zero hours gives a 0 effective rate, not NaN', () => {
    expect(ok(weeklyOvertime({ hourlyRate: 20, hoursWorked: 40, threshold: 40, multiplier: 1.5 })).overtimeHours).toBe(0);
    expect(ok(weeklyOvertime({ hourlyRate: 20, hoursWorked: 0, threshold: 40, multiplier: 1.5 })).effectiveHourly).toBe(0);
  });
  it('threshold 0 makes every hour overtime; double-time hours are added on top', () => {
    const r = ok(weeklyOvertime({ hourlyRate: 10, hoursWorked: 10, threshold: 0, multiplier: 1.5, doubleTimeHours: 2 }));
    expect(r.regularHours).toBe(0);
    expect(r.overtimePay).toBe(150);
    expect(r.doubleTimePay).toBe(40);
    expect(r.totalHours).toBe(12);
  });
  it('weekly overtime rejects bad input', () => {
    const base = { hourlyRate: 20, hoursWorked: 45, threshold: 40, multiplier: 1.5 };
    expect(weeklyOvertime({ ...base, hourlyRate: -1 }).ok).toBe(false);
    expect(weeklyOvertime({ ...base, hoursWorked: 169 }).ok).toBe(false);
    expect(weeklyOvertime({ ...base, threshold: -1 }).ok).toBe(false);
    expect(weeklyOvertime({ ...base, multiplier: 0.5 }).ok).toBe(false);
    expect(weeklyOvertime({ ...base, hoursWorked: 160, doubleTimeHours: 10 }).ok).toBe(false);
    expect(weeklyOvertime({ ...base, doubleTimeHours: -1 }).ok).toBe(false);
    expect(weeklyOvertime({ ...base, doubleTimeMultiplier: 0.9 }).ok).toBe(false);
  });
  it('daily FLSA: only hours past 40 in the week are overtime, counted in day order', () => {
    const r = ok(dailyOvertime({ hourlyRate: 10, days: [12, 12, 12, 12], rule: 'flsa' }));
    expect(r.regularHours).toBe(40);
    expect(r.overtimeHours).toBe(8);
    expect(r.breakdown[3]).toEqual({ hours: 12, regular: 4, overtime: 8, doubleTime: 0 });
  });
  it('California: a 13-hour day is 8 regular, 4 at 1.5x, 1 at 2x (Labor Code 510)', () => {
    const r = ok(dailyOvertime({ hourlyRate: 10, days: [13], rule: 'california' }));
    expect(r.breakdown[0]).toEqual({ hours: 13, regular: 8, overtime: 4, doubleTime: 1 });
    expect(r.totalPay).toBe(80 + 60 + 20);
  });
  it('California seventh consecutive day: first 8 h at 1.5x, rest at 2x; weekly 40 converts day 6', () => {
    // days 1-5: 8 regular each (40); day 6: 8 h all past 40 -> overtime; day 7 (10 h): 8 OT + 2 DT
    const r = ok(dailyOvertime({ hourlyRate: 10, days: [8, 8, 8, 8, 8, 8, 10], rule: 'california' }));
    expect(r.regularHours).toBe(40);
    expect(r.overtimeHours).toBe(16);
    expect(r.doubleTimeHours).toBe(2);
    expect(r.breakdown[6]).toEqual({ hours: 10, regular: 0, overtime: 8, doubleTime: 2 });
  });
  it('California: a day off breaks the seven-day streak', () => {
    const r = ok(dailyOvertime({ hourlyRate: 10, days: [8, 8, 8, 8, 0, 8, 6], rule: 'california' }));
    expect(r.breakdown[6]).toEqual({ hours: 6, regular: 0, overtime: 6, doubleTime: 0 });
    // 8x4 + 8 = 40 regular through day 6, so day 7's 6 h are past 40 -> overtime
    expect(r.regularHours).toBe(40);
  });
  it('daily overtime rejects bad input', () => {
    expect(dailyOvertime({ hourlyRate: 10, days: [], rule: 'flsa' }).ok).toBe(false);
    expect(dailyOvertime({ hourlyRate: 10, days: [1, 1, 1, 1, 1, 1, 1, 1], rule: 'flsa' }).ok).toBe(false);
    expect(dailyOvertime({ hourlyRate: 10, days: [25], rule: 'flsa' }).ok).toBe(false);
    expect(dailyOvertime({ hourlyRate: 10, days: [NaN], rule: 'flsa' }).ok).toBe(false);
    expect(dailyOvertime({ hourlyRate: -1, days: [8], rule: 'flsa' }).ok).toBe(false);
    expect(dailyOvertime({ hourlyRate: 10, days: [8], rule: 'flsa', multiplier: 0 }).ok).toBe(false);
    expect(dailyOvertime({ hourlyRate: 10, days: [8], rule: 'california', doubleTimeMultiplier: NaN }).ok).toBe(false);
  });
});

describe('pay: raises', () => {
  it('5% raise on 50,000 with 3% inflation: real raise 1.05/1.03 - 1 = 1.9417%', () => {
    const r = ok(raiseByPercent(50000, 5, 3));
    expect(r.newPay).toBe(52500);
    expect(r.raiseAmount).toBe(2500);
    expect(r.realRaisePercent).toBeCloseTo(1.9417, 4);
    expect(r.newPayInTodaysMoney).toBeCloseTo(52500 / 1.03, 9);
  });
  it('no inflation given -> real figures are null', () => {
    const r = ok(raiseByAmount(50000, 2500));
    expect(r.raisePercent).toBe(5);
    expect(r.realRaisePercent).toBeNull();
    expect(ok(raiseByAmount(50000, 2500, null)).newPayInTodaysMoney).toBeNull();
  });
  it('raiseBetween: a pay cut to zero is -100%', () => {
    expect(ok(raiseBetween(40000, 0)).raisePercent).toBe(-100);
    expect(ok(raiseBetween(40000, 44000, 0)).realRaisePercent).toBeCloseTo(10, 9);
  });
  it('rejects zero old pay, raises to zero or below and inflation at -100%', () => {
    expect(raiseByPercent(0, 5).ok).toBe(false);
    expect(raiseByPercent(100, -100).ok).toBe(false);
    expect(raiseByPercent(100, 5, -100).ok).toBe(false);
    expect(raiseByPercent(100, 5, NaN).ok).toBe(false);
    expect(raiseByAmount(100, -100).ok).toBe(false);
    expect(raiseByAmount(-1, 10).ok).toBe(false);
    expect(raiseByAmount(100, 10, -101).ok).toBe(false);
    expect(raiseBetween(0, 10).ok).toBe(false);
    expect(raiseBetween(10, -1).ok).toBe(false);
    expect(raiseBetween(10, 12, -100).ok).toBe(false);
  });
});

describe('pay: tips', () => {
  it('18% on 85.40 = 15.37, total 100.77, split 3 ways', () => {
    const r = ok(calculateTip({ bill: 85.4, tipPercent: 18, people: 3 }));
    expect(r.tip).toBe(15.37);
    expect(r.total).toBe(100.77);
    expect(r.perPerson).toBeCloseTo(33.59, 9);
  });
  it('tip on the pre-tax amount', () => {
    // bill 108 incl. 8 tax -> base 100 -> 20% = 20
    const r = ok(calculateTip({ bill: 108, tipPercent: 20, people: 1, taxAmount: 8, tipOnPreTax: true }));
    expect(r.tipBase).toBe(100);
    expect(r.tip).toBe(20);
    expect(r.effectiveTipPercent).toBe(20);
  });
  it('rounding each share up to a whole unit', () => {
    // 100.77 / 3 = 33.59 -> 34 each -> total 102, tip 16.60
    const r = ok(calculateTip({ bill: 85.4, tipPercent: 18, people: 3, rounding: 'person' }));
    expect(r.perPerson).toBe(34);
    expect(r.total).toBe(102);
    expect(r.tip).toBe(16.6);
  });
  it('rounding the total up; an already whole total stays put', () => {
    const r = ok(calculateTip({ bill: 85.4, tipPercent: 18, people: 2, rounding: 'total' }));
    expect(r.total).toBe(101);
    expect(r.tip).toBe(15.6);
    expect(ok(calculateTip({ bill: 100, tipPercent: 20, people: 1, rounding: 'total' })).total).toBe(120);
  });
  it('zero bill: tip 0 and effective percent 0 (no divide by zero)', () => {
    const r = ok(calculateTip({ bill: 0, tipPercent: 20, people: 1 }));
    expect(r.tip).toBe(0);
    expect(r.effectiveTipPercent).toBe(0);
  });
  it('rejects bad input', () => {
    expect(calculateTip({ bill: -1, tipPercent: 10, people: 1 }).ok).toBe(false);
    expect(calculateTip({ bill: 10, tipPercent: -1, people: 1 }).ok).toBe(false);
    expect(calculateTip({ bill: 10, tipPercent: 10, people: 0 }).ok).toBe(false);
    expect(calculateTip({ bill: 10, tipPercent: 10, people: 1.5 }).ok).toBe(false);
    expect(calculateTip({ bill: 10, tipPercent: 10, people: 1, taxAmount: 11 }).ok).toBe(false);
    expect(calculateTip({ bill: 10, tipPercent: 10, people: 1, taxAmount: -1 }).ok).toBe(false);
  });
});

describe('pay: discounts and tax', () => {
  it('percentOff 25% of 80 with 8% tax: 60 + 4.80', () => {
    const r = ok(percentOff(80, 25, 8));
    expect(r.salePrice).toBe(60);
    expect(cents(r.tax)).toBe(4.8);
    expect(cents(r.finalPrice)).toBe(64.8);
    expect(r.effectivePercent).toBe(25);
  });
  it('0% and 100% off are edges; a free item has 0 effective percent on a 0 price', () => {
    expect(ok(percentOff(80, 0)).salePrice).toBe(80);
    expect(ok(percentOff(80, 100)).salePrice).toBe(0);
    expect(ok(percentOff(0, 50)).effectivePercent).toBe(0);
  });
  it('amountOff up to the whole price', () => {
    expect(ok(amountOff(50, 50)).salePrice).toBe(0);
    expect(amountOff(50, 50.01).ok).toBe(false);
    expect(amountOff(50, -1).ok).toBe(false);
  });
  it('stacked 20% then 10% = 28% off, not 30%', () => {
    const r = ok(stackedDiscount(100, [20, 10]));
    expect(cents(r.salePrice)).toBe(72);
    expect(r.steps.map((s) => cents(s.priceAfter))).toEqual([80, 72]);
    expect(equivalentDiscount([20, 10])).toBeCloseTo(28, 9);
    expect(equivalentDiscount([])).toBe(0);
    expect(stackedDiscount(100, [20, 101]).ok).toBe(false);
  });
  it('buy 2 get 1 free: 7 items -> 2 free; 8 items still 2 free; 9 items 3 free', () => {
    expect(ok(buyXGetY(10, 7, 2, 1)).discountedItems).toBe(2);
    expect(ok(buyXGetY(10, 8, 2, 1)).discountedItems).toBe(2);
    const r = ok(buyXGetY(10, 9, 2, 1));
    expect(r.discountedItems).toBe(3);
    expect(r.salePrice).toBe(60);
  });
  it('buy 1 get 1 half off, partial group earns once its X are bought', () => {
    // 3 items, B1G1 50%: one full group (1 discounted) + 1 leftover at full price
    const r = ok(buyXGetY(20, 3, 1, 1, 50));
    expect(r.discountedItems).toBe(1);
    expect(r.salePrice).toBe(50);
    expect(r.fullPriceItems).toBe(2);
  });
  it('buyXGetY rejects bad input', () => {
    expect(buyXGetY(10, 0, 1, 1).ok).toBe(false);
    expect(buyXGetY(10, 2.5, 1, 1).ok).toBe(false);
    expect(buyXGetY(10, 2, 0, 1).ok).toBe(false);
    expect(buyXGetY(10, 2, 1, 1, 101).ok).toBe(false);
    expect(buyXGetY(-10, 2, 1, 1).ok).toBe(false);
    expect(buyXGetY(10, 2, 1, 1, 100, -5).ok).toBe(false);
  });
  it('originalFromSale: 60 after 25% off was 80; 100% off cannot be reversed', () => {
    expect(ok(originalFromSale(60, 25))).toBe(80);
    expect(originalFromSale(60, 100).ok).toBe(false);
    expect(originalFromSale(-1, 10).ok).toBe(false);
  });
  it('sales tax: rates add, add/remove are inverses, rate from amounts', () => {
    expect(combinedRate(6, 1.5, 1, NaN)).toBe(8.5);
    const a = ok(addTax(100, 8.25));
    expect(a.gross).toBeCloseTo(108.25, 9);
    expect(ok(removeTax(108.25, 8.25)).net).toBeCloseTo(100, 9);
    expect(ok(rateFromAmounts(100, 108.25)).rate).toBeCloseTo(8.25, 9);
    expect(ok(addTax(100, 0)).tax).toBe(0);
  });
  it('sales tax rejects bad input', () => {
    expect(addTax(-1, 5).ok).toBe(false);
    expect(addTax(100, -1).ok).toBe(false);
    expect(addTax(100, 101).error).toMatch(/typo/);
    expect(removeTax(-1, 5).ok).toBe(false);
    expect(rateFromAmounts(0, 10).ok).toBe(false);
    expect(rateFromAmounts(100, 90).ok).toBe(false);
  });
  it('UK VAT: 1/6 of a 20%-inclusive price is VAT (HMRC VAT fraction)', () => {
    expect(vatFraction(20)).toBeCloseTo(1 / 6, 12);
    expect(vatFraction(5)).toBeCloseTo(1 / 21, 12);
    expect(ok(removeVat(120, 20)).tax).toBeCloseTo(20, 9);
    expect(ok(addVat(100, 20)).gross).toBe(120);
  });
});

describe('biz: margin and markup', () => {
  it('roundMoney avoids the 1.005 surprise', () => {
    expect(bizRound(1.005)).toBe(1.01);
    expect(bizRound(0.125)).toBe(0.13);
  });
  it('markup <-> margin: 100% markup is 50% margin; 50% margin needs 100% markup', () => {
    expect(markupToMargin(100)).toBe(50);
    expect(marginToMarkup(50)).toBe(100);
    expect(markupToMargin(0)).toBe(0);
    expect(markupToMargin(-100)).toBeNull();
    expect(marginToMarkup(100)).toBeNull();
  });
  it('every valid pair solves cost 60 / price 100 (40% margin, 66.67% markup, 40 profit)', () => {
    const pairs = [
      { cost: 60, price: 100 },
      { cost: 60, margin: 40 },
      { cost: 60, markup: 200 / 3 },
      { cost: 60, profit: 40 },
      { price: 100, margin: 40 },
      { price: 100, markup: 200 / 3 },
      { price: 100, profit: 40 },
      { profit: 40, margin: 40 },
      { profit: 40, markup: 200 / 3 },
    ];
    for (const p of pairs) {
      const r = ok(solveMarginMarkup(p));
      expect(r.cost).toBeCloseTo(60, 9);
      expect(r.price).toBeCloseTo(100, 9);
      expect(r.margin!).toBeCloseTo(40, 9);
      expect(r.markup!).toBeCloseTo(200 / 3, 9);
    }
  });
  it('zero cost and price give null ratios rather than NaN', () => {
    const r = ok(solveMarginMarkup({ cost: 0, price: 0 }));
    expect(r.margin).toBeNull();
    expect(r.markup).toBeNull();
    // -100% markup on cost 50 -> price 0 (edge)
    expect(ok(solveMarginMarkup({ cost: 50, markup: -100 })).price).toBe(0);
    // 100% margin on a price: cost 0
    expect(ok(solveMarginMarkup({ price: 50, margin: 100 })).cost).toBe(0);
  });
  it('rejects wrong field counts, impossible margins and the margin+markup pair', () => {
    expect(solveMarginMarkup({ cost: 1 }).ok).toBe(false);
    expect(solveMarginMarkup({ cost: 1, price: 2, profit: 1 }).ok).toBe(false);
    expect(solveMarginMarkup({ cost: 1, price: NaN }).ok).toBe(false);
    expect(solveMarginMarkup({ margin: 40, markup: 66 }).error).toMatch(/same ratio/);
    expect(solveMarginMarkup({ cost: 60, margin: 100 }).ok).toBe(false);
    expect(solveMarginMarkup({ cost: 60, markup: -101 }).ok).toBe(false);
    expect(solveMarginMarkup({ price: 60, margin: 101 }).ok).toBe(false);
    expect(solveMarginMarkup({ price: 60, markup: -100 }).ok).toBe(false);
    expect(solveMarginMarkup({ profit: 10, margin: 0 }).ok).toBe(false);
    expect(solveMarginMarkup({ profit: 10, margin: 100 }).ok).toBe(false);
    expect(solveMarginMarkup({ profit: 10, markup: 0 }).ok).toBe(false);
    expect(solveMarginMarkup({ price: 10, profit: 20 }).error).toMatch(/negative cost/);
    expect(solveMarginMarkup({ cost: 10, profit: -20 }).error).toMatch(/negative selling price/);
    expect(solveMarginMarkup({ profit: 1e308, markup: 1e-300 }).ok).toBe(false);
  });
  it('marginMistake: marking up 60 by 40% gives 84 (28.57% margin) instead of 100', () => {
    const m = marginMistake(60, 40);
    expect(m.wrongPrice).toBe(84);
    expect(m.rightPrice).toBe(100);
    expect(m.actualMargin).toBeCloseTo(28.5714, 4);
    expect(m.shortfallPerUnit).toBe(16);
    expect(marginMistake(60, 100).rightPrice).toBeNaN();
    expect(marginMistake(0, 40).actualMargin).toBe(0);
  });
});

describe('biz: break-even', () => {
  it('F 10,000, P 50, V 30: 500 units, 25,000 revenue, 40% CM ratio', () => {
    const r = ok(breakEven({ fixedCosts: 10000, pricePerUnit: 50, variableCostPerUnit: 30, targetProfit: 5000, expectedUnits: 600 }));
    expect(r.breakEvenUnits).toBe(500);
    expect(r.breakEvenUnitsWhole).toBe(500);
    expect(r.breakEvenRevenue).toBe(25000);
    expect(r.contributionRatio).toBe(40);
    expect(r.targetUnits).toBe(750);
    expect(r.targetRevenue).toBe(37500);
    // 600 units: profit 30,000 - 28,000 = 2,000; MOS 100/600; DOL 12,000 / 2,000 = 6
    expect(r.expected!.profit).toBe(2000);
    expect(r.expected!.marginOfSafetyPct).toBeCloseTo(16.6667, 4);
    expect(r.expected!.operatingLeverage).toBe(6);
  });
  it('fractional break-even rounds up; a loss gives null leverage; negative target clamps to 0 units', () => {
    const r = ok(breakEven({ fixedCosts: 1000, pricePerUnit: 5, variableCostPerUnit: 2, targetProfit: -5000, expectedUnits: 100 }));
    expect(r.breakEvenUnitsWhole).toBe(334);
    expect(r.expected!.operatingLeverage).toBeNull();
    expect(r.targetUnitsWhole).toBe(0);
  });
  it('no fixed costs: break-even at 0; no target -> nulls', () => {
    const r = ok(breakEven({ fixedCosts: 0, pricePerUnit: 5, variableCostPerUnit: 2 }));
    expect(r.breakEvenUnits).toBe(0);
    expect(r.targetUnits).toBeNull();
    expect(r.expected).toBeNull();
  });
  it('rejects bad input and a price at or below variable cost', () => {
    expect(breakEven({ fixedCosts: NaN, pricePerUnit: 5, variableCostPerUnit: 2 }).ok).toBe(false);
    expect(breakEven({ fixedCosts: -1, pricePerUnit: 5, variableCostPerUnit: 2 }).ok).toBe(false);
    expect(breakEven({ fixedCosts: 1, pricePerUnit: 0, variableCostPerUnit: 0 }).ok).toBe(false);
    expect(breakEven({ fixedCosts: 1, pricePerUnit: 5, variableCostPerUnit: -1 }).ok).toBe(false);
    expect(breakEven({ fixedCosts: 1, pricePerUnit: 5, variableCostPerUnit: 5 }).error).toMatch(/never breaks even/);
  });
  it('preTaxTarget and chart points', () => {
    expect(preTaxTarget(75000, 25)).toBe(100000);
    expect(preTaxTarget(1, 100)).toBeNaN();
    const pts = breakEvenChart({ fixedCosts: 100, pricePerUnit: 5, variableCostPerUnit: 1 }, 1000, 4);
    expect(pts.map((p) => p.units)).toEqual([0, 250, 500, 750, 1000]);
    expect(pts[2]).toEqual({ units: 500, revenue: 2500, totalCost: 600, fixed: 100 });
    expect(breakEvenChart({ fixedCosts: 1, pricePerUnit: 1, variableCostPerUnit: 0 }, 0, 2).map((p) => p.units)).toEqual([0, 0, 0]);
  });
});

describe('biz: depreciation', () => {
  const sumDep = (rows: { depreciation: number }[]) => rows.reduce((s, r) => s + r.depreciation, 0);

  it('MACRS 5-year on 10,000: 2,000 / 3,200 / 1,920 / 1,152 / 1,152 / 576 (IRS Pub 946 Table A-1)', () => {
    const r = ok(depreciationSchedule({ method: 'macrs', cost: 10000, salvage: 0, life: 0, macrsClass: 5 }));
    expect(r.rows.map((x) => cents(x.depreciation))).toEqual([2000, 3200, 1920, 1152, 1152, 576]);
    expect(r.rows.at(-1)!.endingBookValue).toBe(0);
    expect(r.rows[0].note).toBe('Half-year convention');
  });
  it('every MACRS class depreciates exactly the cost (Table A-1 rows each sum to 100%) and ends at 0', () => {
    for (const cls of [3, 5, 7, 10, 15, 20] as const) {
      const r = ok(depreciationSchedule({ method: 'macrs', cost: 12345.67, salvage: 0, life: 0, macrsClass: cls }));
      expect(r.rows.length).toBe(cls + 1);
      expect(cents(sumDep(r.rows))).toBe(12345.67);
      expect(sumDep(r.rows)).toBeLessThanOrEqual(12345.67);
      expect(r.rows.at(-1)!.endingBookValue).toBeCloseTo(0, 6);
    }
    // 7-year last year: 4.46% of 10,000
    const r7 = ok(depreciationSchedule({ method: 'macrs', cost: 10000, salvage: 0, life: 0, macrsClass: 7 }));
    expect(cents(r7.rows.at(-1)!.depreciation)).toBe(446);
  });
  it('double-declining 10,000 / 1,000 / 5 years: 4,000 2,400 1,440 864 296 (textbook)', () => {
    const r = ok(depreciationSchedule({ method: 'double-declining', cost: 10000, salvage: 1000, life: 5 }));
    expect(r.rows.map((x) => cents(x.depreciation))).toEqual([4000, 2400, 1440, 864, 296]);
    expect(r.rows.at(-1)!.endingBookValue).toBe(1000);
  });
  it('DDB with no salvage brings the last year down to zero; switching to SL takes over when larger', () => {
    // 10,000 / 0 / 5: DDB 4000 2400 1440; year 4 SL = 2160/2 = 1080 > 864 -> switch; year 5 = 1080
    const r = ok(depreciationSchedule({ method: 'double-declining', cost: 10000, salvage: 0, life: 5, switchToStraightLine: true }));
    expect(r.rows.map((x) => cents(x.depreciation))).toEqual([4000, 2400, 1440, 1080, 1080]);
    expect(r.rows[3].note).toBe('Switched to straight-line');
    expect(r.rows[3].rate).toBeNull();
    const noSwitch = ok(depreciationSchedule({ method: 'double-declining', cost: 10000, salvage: 0, life: 5 }));
    expect(cents(noSwitch.rows[4].depreciation)).toBe(1296);
    expect(noSwitch.rows[4].note).toBe('Final year: brought down to salvage');
  });
  it('150% declining balance, 1-year life is a single full write-down', () => {
    const r = ok(depreciationSchedule({ method: 'declining-balance', factor: 1.5, cost: 1000, salvage: 100, life: 1 }));
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].depreciation).toBe(900);
  });
  it('declining balance starting mid-year runs one extra fiscal year', () => {
    const r = ok(depreciationSchedule({ method: 'double-declining', cost: 10000, salvage: 0, life: 5, firstYearMonths: 6, switchToStraightLine: true }));
    expect(r.rows.length).toBe(6);
    // first half year: 10,000 x 40% x 0.5
    expect(r.rows[0].depreciation).toBe(2000);
    expect(cents(sumDep(r.rows))).toBe(10000);
  });
  it('straight line from mid-year: 12,000 over 3 years from month 7 -> 2,000 4,000 4,000 2,000', () => {
    const r = ok(depreciationSchedule({ method: 'straight-line', cost: 12000, salvage: 0, life: 3, firstYearMonths: 6 }));
    expect(r.rows.map((x) => x.depreciation)).toEqual([2000, 4000, 4000, 2000]);
  });
  it('straight line with salvage equal to cost: zero base, 0% rate', () => {
    const r = ok(depreciationSchedule({ method: 'straight-line', cost: 1000, salvage: 1000, life: 2 }));
    expect(r.rows.map((x) => x.depreciation)).toEqual([0, 0]);
    expect(r.rows[0].rate).toBe(0);
  });
  it('sum-of-years digits 15,000 / 0 / 5: 5/15 ... 1/15', () => {
    const r = ok(depreciationSchedule({ method: 'sum-of-years', cost: 15000, salvage: 0, life: 5 }));
    expect(r.rows.map((x) => x.depreciation)).toEqual([5000, 4000, 3000, 2000, 1000]);
    expect(r.rows[0].note).toBe('5/15');
    const mid = ok(depreciationSchedule({ method: 'sum-of-years', cost: 15000, salvage: 0, life: 5, firstYearMonths: 3 }));
    expect(mid.rows.length).toBe(6);
    expect(mid.rows[0].note).toBeUndefined();
    expect(cents(sumDep(mid.rows))).toBe(15000);
  });
  it('units of production caps at the depreciable base', () => {
    // (10,000 - 1,000) / 900 units = 10 per unit
    const r = ok(depreciationSchedule({ method: 'units-of-production', cost: 10000, salvage: 1000, life: 0, totalUnits: 900, unitsPerYear: [400, 400, 300] }));
    expect(r.rows.map((x) => x.depreciation)).toEqual([4000, 4000, 1000]);
    expect(r.rows[2].note).toBe('Capped: asset fully depreciated');
    expect(r.totalDepreciation).toBe(9000);
  });
  it('rejects bad input', () => {
    const bad = (o: object) => depreciationSchedule({ method: 'straight-line', cost: 1000, salvage: 0, life: 5, ...o } as never).ok;
    expect(bad({ cost: 0 })).toBe(false);
    expect(bad({ salvage: -1 })).toBe(false);
    expect(bad({ salvage: 1001 })).toBe(false);
    expect(bad({ life: 0 })).toBe(false);
    expect(bad({ life: 2.5 })).toBe(false);
    expect(bad({ life: 101 })).toBe(false);
    expect(bad({ firstYearMonths: 0 })).toBe(false);
    expect(bad({ firstYearMonths: 13 })).toBe(false);
    expect(bad({ method: 'declining-balance', factor: 0 })).toBe(false);
    expect(bad({ method: 'macrs', macrsClass: 4 })).toBe(false);
    expect(bad({ method: 'macrs' })).toBe(false);
    expect(bad({ method: 'units-of-production', totalUnits: 0, unitsPerYear: [1] })).toBe(false);
    expect(bad({ method: 'units-of-production', totalUnits: 10, unitsPerYear: [] })).toBe(false);
    expect(bad({ method: 'units-of-production', totalUnits: 10, unitsPerYear: [-1] })).toBe(false);
  });
});

describe('biz: commission', () => {
  const tiers: CommissionTier[] = [
    { upTo: 10000, rate: 5 },
    { upTo: 20000, rate: 7 },
    { upTo: null, rate: 10 },
  ];
  it('validateTiers', () => {
    expect(validateTiers(tiers)).toBeNull();
    expect(validateTiers([])).toMatch(/at least one/);
    expect(validateTiers([{ upTo: null, rate: 5 }, { upTo: 100, rate: 5 }])).toMatch(/open-ended/);
    expect(validateTiers([{ upTo: 100, rate: 5 }, { upTo: 100, rate: 5 }])).toMatch(/higher/);
    expect(validateTiers([{ upTo: 100, rate: -1 }])).toMatch(/rate/);
  });
  it('marginal tiers on 25,000: 500 + 700 + 500 = 1,700', () => {
    const r = tieredMarginal(25000, tiers);
    expect(r.total).toBe(1700);
    expect(r.slices.map((s) => s.amount)).toEqual([10000, 10000, 5000]);
    expect(tieredMarginal(0, tiers)).toEqual({ total: 0, slices: [] });
    expect(tieredMarginal(10000, tiers).total).toBe(500);
  });
  it('marginal tiers with a capped top tier pay nothing beyond the cap', () => {
    expect(tieredMarginal(15000, [{ upTo: 10000, rate: 5 }]).total).toBe(500);
  });
  it('whole-amount tiers: the threshold is inclusive (10,000 -> 5%), 10,000.01 -> 7% on everything', () => {
    expect(tieredWholeAmount(10000, tiers)).toEqual({ total: 500, rate: 5, tierIndex: 0 });
    expect(tieredWholeAmount(10000.01, tiers).rate).toBe(7);
    expect(tieredWholeAmount(25000, tiers).total).toBe(2500);
    expect(tieredWholeAmount(50000, [{ upTo: 10000, rate: 5 }]).tierIndex).toBe(0);
  });
  it('flat, rate for target and sales for target', () => {
    expect(flatCommission(12345, 4)).toBeCloseTo(493.8, 9);
    expect(rateForTarget(60000, 30000, 600000)).toBe(5);
    expect(rateForTarget(60000, 30000, 0)).toBeNull();
    expect(salesForTarget(60000, 30000, 5)).toBe(600000);
    expect(salesForTarget(60000, 30000, 0)).toBeNull();
  });
  it('recoverable draw: a 500 shortfall is clawed back next period; non-recoverable is forgiven', () => {
    const rec = drawSchedule([1500, 3000, 2500], 2000, true);
    expect(rec.map((r) => r.payout)).toEqual([2000, 2500, 2500]);
    expect(rec[1].carriedIn).toBe(500);
    expect(rec[0].drawTopUp).toBe(500);
    const non = drawSchedule([1500, 3000, 2500], 2000, false);
    expect(non.map((r) => r.payout)).toEqual([2000, 3000, 2500]);
    expect(non[1].carriedIn).toBe(0);
    expect(drawSchedule([], 2000, true)).toEqual([]);
  });
  it('salesForCommission finds the cheapest sales figure, even across a whole-amount jump', () => {
    expect(salesForCommission(500, (s) => flatCommission(s, 5))).toBe(10000);
    expect(salesForCommission(0, (s) => s)).toBe(0);
    expect(salesForCommission(1000, (s) => tieredMarginal(s, [{ upTo: 10000, rate: 5 }]).total)).toBeNull();
    // 5% up to 10,000 (max 500), 10% on everything above: 1,000 is first reached at 10,000.01
    const whole = (s: number) => tieredWholeAmount(s, [{ upTo: 10000, rate: 5 }, { upTo: null, rate: 10 }]).total;
    expect(salesForCommission(1000, whole)).toBe(10000.01);
  });
  it('parseNumberList and tier encoding round-trip', () => {
    expect(parseNumberList('10000, 12000 9000;$500')).toEqual([10000, 12000, 9000, 500]);
    expect(parseNumberList('')).toEqual([]);
    expect(parseNumberList('10, abc')).toBeNull();
    expect(encodeTiers(tiers)).toBe('10000:5,20000:7,:10');
    expect(decodeTiers('10000:5,20000:7,:10')).toEqual(tiers);
    expect(decodeTiers('')).toEqual([]);
  });
});
