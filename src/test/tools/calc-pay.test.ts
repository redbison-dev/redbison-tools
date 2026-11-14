import { describe, it, expect } from 'vitest';
import {
  roundMoney, formatMoney, convertSalary, periodsPerYear, weeklyOvertime, dailyOvertime,
  raiseByPercent, raiseByAmount, raiseBetween, calculateTip, percentOff, amountOff,
  stackedDiscount, equivalentDiscount, buyXGetY, originalFromSale, addTax, removeTax,
  rateFromAmounts, combinedRate, addVat, removeVat, vatFraction, VAT_PRESETS, type ValidationResult,
} from '@/lib/tools/calculators/pay';

function ok<T>(r: ValidationResult<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('roundMoney / formatMoney', () => {
  it('rounds half away from zero without float drift', () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(8666.666666)).toBe(8666.67);
  });
  it('formats currencies, yen without decimals', () => {
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50');
    expect(formatMoney(1234.5, 'JPY')).toBe('¥1,235');
    expect(formatMoney(10, 'EUR')).toBe('€10.00');
  });
});

describe('salary conversion', () => {
  const base = { hoursPerWeek: 40, daysPerWeek: 5, holidaysPerYear: 10, vacationDaysPerYear: 15 };

  it('uses the 2,080-hour full-time year', () => {
    expect(periodsPerYear('hourly', 40, 5)).toBe(2080);
    expect(periodsPerYear('daily', 40, 5)).toBe(260);
  });

  it('$50/hour: unadjusted 104,000 a year, adjusted 94,000 after 25 unpaid days', () => {
    const r = ok(convertSalary({ amount: 50, period: 'hourly', ...base }));
    expect(r.unadjusted.annual).toBe(104000);
    expect(r.unadjusted.weekly).toBe(2000);
    expect(r.unadjusted.biweekly).toBe(4000);
    expect(roundMoney(r.unadjusted.semimonthly)).toBe(4333.33);
    expect(roundMoney(r.unadjusted.monthly)).toBe(8666.67);
    expect(r.unadjusted.quarterly).toBe(26000);
    expect(r.unadjusted.daily).toBe(400);
    expect(r.workedDays).toBe(235);
    expect(r.adjusted.annual).toBe(94000);
    expect(r.adjusted.hourly).toBe(50);
    expect(roundMoney(r.adjusted.monthly)).toBe(7833.33);
  });

  it('$100,000 salary: 48.08/h unadjusted, 53.19/h over the hours actually worked', () => {
    const r = ok(convertSalary({ amount: 100000, period: 'annual', ...base }));
    expect(roundMoney(r.unadjusted.hourly)).toBe(48.08);
    expect(roundMoney(r.adjusted.hourly)).toBe(53.19);
    expect(r.adjusted.annual).toBe(100000);
    expect(roundMoney(r.adjusted.daily)).toBe(425.53);
  });

  it('round-trips between periods', () => {
    const monthly = ok(convertSalary({ amount: 5000, period: 'monthly', ...base }));
    expect(monthly.unadjusted.annual).toBe(60000);
    const back = ok(convertSalary({ amount: monthly.unadjusted.hourly, period: 'hourly', ...base }));
    expect(roundMoney(back.unadjusted.monthly)).toBe(5000);
  });

  it('handles part-time schedules and zero days off', () => {
    const r = ok(convertSalary({ amount: 20, period: 'hourly', hoursPerWeek: 24, daysPerWeek: 3, holidaysPerYear: 0, vacationDaysPerYear: 0 }));
    expect(r.unadjusted.annual).toBe(24960);
    expect(r.adjusted.annual).toBe(24960);
    expect(r.hoursPerDay).toBe(8);
  });

  it('rejects impossible input', () => {
    expect(convertSalary({ amount: -1, period: 'hourly', ...base }).ok).toBe(false);
    expect(convertSalary({ amount: 10, period: 'hourly', ...base, hoursPerWeek: 0 }).ok).toBe(false);
    expect(convertSalary({ amount: 10, period: 'hourly', ...base, daysPerWeek: 8 }).ok).toBe(false);
    expect(convertSalary({ amount: 10, period: 'hourly', ...base, hoursPerWeek: 100, daysPerWeek: 4 }).ok).toBe(false);
    expect(convertSalary({ amount: 10, period: 'hourly', ...base, vacationDaysPerYear: 300 }).ok).toBe(false);
  });
});

describe('overtime', () => {
  it('FLSA: $12/h for 46 hours = 480 + 6 x 18 = 588', () => {
    const r = ok(weeklyOvertime({ hourlyRate: 12, hoursWorked: 46, threshold: 40, multiplier: 1.5 }));
    expect(r.regularHours).toBe(40);
    expect(r.overtimeHours).toBe(6);
    expect(r.overtimeRate).toBe(18);
    expect(r.totalPay).toBe(588);
    expect(roundMoney(r.effectiveHourly)).toBe(12.78);
  });

  it('no overtime at or below the threshold', () => {
    const r = ok(weeklyOvertime({ hourlyRate: 20, hoursWorked: 40, threshold: 40, multiplier: 1.5 }));
    expect(r.overtimeHours).toBe(0);
    expect(r.totalPay).toBe(800);
  });

  it('adds separate double-time hours', () => {
    const r = ok(weeklyOvertime({ hourlyRate: 20, hoursWorked: 45, threshold: 40, multiplier: 1.5, doubleTimeHours: 3 }));
    expect(r.totalPay).toBe(800 + 150 + 120);
    expect(r.totalHours).toBe(48);
  });

  it('custom multiplier and zero rate', () => {
    expect(ok(weeklyOvertime({ hourlyRate: 10, hoursWorked: 50, threshold: 40, multiplier: 1.75 })).overtimePay).toBe(175);
    expect(ok(weeklyOvertime({ hourlyRate: 0, hoursWorked: 50, threshold: 40, multiplier: 1.5 })).totalPay).toBe(0);
    expect(weeklyOvertime({ hourlyRate: 10, hoursWorked: 50, threshold: 40, multiplier: 0.5 }).ok).toBe(false);
    expect(weeklyOvertime({ hourlyRate: 10, hoursWorked: 200, threshold: 40, multiplier: 1.5 }).ok).toBe(false);
  });

  it('FLSA ignores long days if the week stays at 40', () => {
    const r = ok(dailyOvertime({ hourlyRate: 20, days: [10, 10, 10, 10], rule: 'flsa' }));
    expect(r.overtimeHours).toBe(0);
    expect(r.totalPay).toBe(800);
  });

  it('California: four 10-hour days earn 8 hours of daily overtime', () => {
    const r = ok(dailyOvertime({ hourlyRate: 20, days: [10, 10, 10, 10], rule: 'california' }));
    expect(r.regularHours).toBe(32);
    expect(r.overtimeHours).toBe(8);
    expect(r.totalPay).toBe(32 * 20 + 8 * 30);
  });

  it('California: a 13-hour day is 8 regular, 4 at 1.5x, 1 at 2x', () => {
    const r = ok(dailyOvertime({ hourlyRate: 20, days: [13], rule: 'california' }));
    expect([r.regularHours, r.overtimeHours, r.doubleTimeHours]).toEqual([8, 4, 1]);
    expect(r.totalPay).toBe(160 + 120 + 40);
  });

  it('California: seventh consecutive day and the weekly 40 without double counting', () => {
    const r = ok(dailyOvertime({ hourlyRate: 10, days: [8, 8, 8, 8, 8, 8, 10], rule: 'california' }));
    // Days 1-5 = 40 regular; day 6's 8 hours are over 40 -> 1.5x; day 7: 8 at 1.5x, 2 at 2x.
    expect(r.regularHours).toBe(40);
    expect(r.overtimeHours).toBe(16);
    expect(r.doubleTimeHours).toBe(2);
    expect(r.totalPay).toBe(400 + 16 * 15 + 2 * 20);
  });

  it('California: a day off breaks the seven-day run', () => {
    const r = ok(dailyOvertime({ hourlyRate: 10, days: [8, 8, 8, 8, 8, 0, 8], rule: 'california' }));
    expect(r.doubleTimeHours).toBe(0);
    expect(r.overtimeHours).toBe(8);
  });

  it('rejects days over 24 hours', () => {
    expect(dailyOvertime({ hourlyRate: 10, days: [25], rule: 'flsa' }).ok).toBe(false);
  });
});

describe('pay raise', () => {
  it('3% on 50,000 is 51,500', () => {
    const r = ok(raiseByPercent(50000, 3));
    expect(r.newPay).toBe(51500);
    expect(r.raiseAmount).toBe(1500);
    expect(r.realRaisePercent).toBeNull();
  });
  it('a 5% raise with 3% inflation is a 1.94% real raise (Fisher relation)', () => {
    const r = ok(raiseByPercent(60000, 5, 3));
    expect(roundMoney(r.realRaisePercent!)).toBe(1.94);
    expect(roundMoney(r.newPayInTodaysMoney!)).toBe(61165.05);
  });
  it('a raise below inflation is a real pay cut', () => {
    expect(ok(raiseByPercent(60000, 2, 4)).realRaisePercent!).toBeLessThan(0);
  });
  it('hourly amount raise and percent between two salaries', () => {
    const r = ok(raiseByAmount(25, 1.5));
    expect(r.newPay).toBe(26.5);
    expect(r.raisePercent).toBe(6);
    expect(roundMoney(ok(raiseBetween(72000, 80000)).raisePercent)).toBe(11.11);
    expect(ok(raiseBetween(80000, 72000)).raisePercent).toBe(-10);
  });
  it('validates', () => {
    expect(raiseByPercent(0, 3).ok).toBe(false);
    expect(raiseByPercent(100, -100).ok).toBe(false);
    expect(raiseByAmount(100, -100).ok).toBe(false);
    expect(raiseByPercent(100, 3, -100).ok).toBe(false);
  });
});

describe('tip', () => {
  it('18% of 50 is 9.00, total 59.00', () => {
    const r = ok(calculateTip({ bill: 50, tipPercent: 18, people: 1 }));
    expect(r.tip).toBe(9);
    expect(r.total).toBe(59);
  });
  it('splits and rounds each share up', () => {
    const r = ok(calculateTip({ bill: 50, tipPercent: 18, people: 3, rounding: 'person' }));
    expect(r.perPerson).toBe(20);
    expect(r.total).toBe(60);
    expect(r.tip).toBe(10);
    expect(roundMoney(r.effectiveTipPercent)).toBe(20);
  });
  it('rounds the total up', () => {
    const r = ok(calculateTip({ bill: 47.3, tipPercent: 20, people: 2, rounding: 'total' }));
    expect(r.total).toBe(57);
    expect(r.tip).toBe(9.7);
    expect(r.perPerson).toBe(28.5);
  });
  it('does not round up an amount that is already whole', () => {
    const r = ok(calculateTip({ bill: 40, tipPercent: 25, people: 2, rounding: 'person' }));
    expect(r.perPerson).toBe(25);
    expect(r.tip).toBe(10);
  });
  it('tips on the pre-tax amount', () => {
    const r = ok(calculateTip({ bill: 108.88, taxAmount: 8.88, tipOnPreTax: true, tipPercent: 20, people: 1 }));
    expect(r.tipBase).toBeCloseTo(100, 10);
    expect(r.tip).toBe(20);
    expect(r.total).toBe(128.88);
  });
  it('zero tip and validation', () => {
    expect(ok(calculateTip({ bill: 30, tipPercent: 0, people: 2 })).perPerson).toBe(15);
    expect(calculateTip({ bill: 30, tipPercent: 15, people: 0 }).ok).toBe(false);
    expect(calculateTip({ bill: 30, tipPercent: 15, people: 1.5 }).ok).toBe(false);
    expect(calculateTip({ bill: 30, tipPercent: 15, people: 1, taxAmount: 40 }).ok).toBe(false);
  });
});

describe('discounts', () => {
  it('25% off 80 is 60, plus 8% tax is 64.80', () => {
    const r = ok(percentOff(80, 25, 8));
    expect(r.salePrice).toBe(60);
    expect(r.savings).toBe(20);
    expect(roundMoney(r.tax)).toBe(4.8);
    expect(roundMoney(r.finalPrice)).toBe(64.8);
  });
  it('amount off reports the percent', () => {
    const r = ok(amountOff(250, 50));
    expect(r.salePrice).toBe(200);
    expect(r.effectivePercent).toBe(20);
    expect(amountOff(50, 60).ok).toBe(false);
  });
  it('20% then 10% is 28% off, not 30%', () => {
    const r = ok(stackedDiscount(100, [20, 10]));
    expect(roundMoney(r.salePrice)).toBe(72);
    expect(roundMoney(r.effectivePercent)).toBe(28);
    expect(r.steps.map((s) => roundMoney(s.priceAfter))).toEqual([80, 72]);
    expect(roundMoney(equivalentDiscount([20, 10]))).toBe(28);
    expect(roundMoney(equivalentDiscount([50, 50]))).toBe(75);
    expect(equivalentDiscount([])).toBe(0);
  });
  it('buy one get one free on 5 items charges for 3', () => {
    const r = ok(buyXGetY(10, 5, 1, 1));
    expect(r.discountedItems).toBe(2);
    expect(r.salePrice).toBe(30);
  });
  it('buy 2 get 1 half price', () => {
    expect(ok(buyXGetY(20, 3, 2, 1, 50)).salePrice).toBe(50);
    expect(ok(buyXGetY(20, 2, 2, 1, 50)).salePrice).toBe(40);
    // 4 items with buy 2 get 2: the 4th item is in the "get" half of the group.
    expect(ok(buyXGetY(10, 4, 2, 2)).discountedItems).toBe(2);
    expect(ok(buyXGetY(10, 7, 2, 2)).discountedItems).toBe(3);
  });
  it('reverses a sale price', () => {
    expect(ok(originalFromSale(60, 25))).toBe(80);
    expect(ok(originalFromSale(72, 0))).toBe(72);
    expect(originalFromSale(10, 100).ok).toBe(false);
  });
  it('validates percent range', () => {
    expect(percentOff(100, 120).ok).toBe(false);
    expect(percentOff(-1, 10).ok).toBe(false);
    expect(ok(percentOff(100, 100)).salePrice).toBe(0);
  });
});

describe('sales tax', () => {
  it('7.25% on 100 is 107.25 and reverses exactly', () => {
    const add = ok(addTax(100, 7.25));
    expect(roundMoney(add.gross)).toBe(107.25);
    const rev = ok(removeTax(107.25, 7.25));
    expect(roundMoney(rev.net)).toBe(100);
    expect(roundMoney(rev.tax)).toBe(7.25);
  });
  it('removing tax is not the same as subtracting the rate from the total', () => {
    const rev = ok(removeTax(110, 10));
    expect(roundMoney(rev.net)).toBe(100);
    expect(110 * 0.9).not.toBeCloseTo(100, 2);
  });
  it('finds the rate from two amounts', () => {
    expect(roundMoney(ok(rateFromAmounts(80, 86.6)).rate)).toBe(8.25);
    expect(rateFromAmounts(0, 10).ok).toBe(false);
    expect(rateFromAmounts(100, 90).ok).toBe(false);
  });
  it('adds state and local rates', () => {
    expect(combinedRate(6.25, 1, 1.25)).toBe(8.5);
    expect(combinedRate(6, NaN)).toBe(6);
  });
  it('zero rate and validation', () => {
    expect(ok(addTax(50, 0)).gross).toBe(50);
    expect(addTax(50, -1).ok).toBe(false);
    expect(addTax(50, 150).ok).toBe(false);
  });
});

describe('VAT', () => {
  it('UK 20%: 100 net is 120 gross, and VAT in a gross price is one sixth', () => {
    expect(ok(addVat(100, 20)).gross).toBe(120);
    const r = ok(removeVat(120, 20));
    expect(roundMoney(r.net)).toBe(100);
    expect(roundMoney(r.tax)).toBe(20);
    expect(vatFraction(20)).toBeCloseTo(1 / 6, 12);
    expect(vatFraction(5)).toBeCloseTo(1 / 21, 12);
  });
  it('Germany 19%: 119 gross contains 19 VAT', () => {
    expect(roundMoney(ok(removeVat(119, 19)).tax)).toBe(19);
  });
  it('presets match the official standard rates we cite', () => {
    const byName = Object.fromEntries(VAT_PRESETS.map((p) => [p.country, p.rate]));
    expect(byName['United Kingdom']).toBe(20);
    expect(byName.Germany).toBe(19);
    expect(byName.Finland).toBe(25.5);
    expect(byName.Hungary).toBe(27);
    expect(byName.Luxembourg).toBe(17);
    // EU minimum standard rate is 15% (VAT Directive art. 97).
    expect(VAT_PRESETS.every((p) => p.rate >= 15)).toBe(true);
  });
});
