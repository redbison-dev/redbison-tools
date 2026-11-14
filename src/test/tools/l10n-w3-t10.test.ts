import { describe, expect, it } from 'vitest';
import { BAC_LIMIT_SETS, STANDARD_DRINKS, alcoholGrams, bacLimitSet, widmarkBac } from '@/lib/tools/calculators/fitness';
import { computeRentVsBuy } from '@/lib/tools/rent-vs-buy-calculator';
import { analyzeRentalProperty } from '@/lib/tools/real-estate-investment-analyzer';
import { annuityLumpSumNeeded, annuityPayout, annuitySchedule, bondPriceFromYield, bondYieldFromPrice, convertAmount, crossRate, currentYield } from '@/lib/tools/calculators/invest-b';
import { investmentForIncome, projectDividends } from '@/lib/tools/w500/finance2';
import { computeCompoundGrowth } from '@/lib/finance/compoundGrowth';
import { contributionsPerYear, periodsPerYear, toRatePerPeriod } from '@/lib/tools/compound-interest-calculator';
import { simulateEtf } from '@/lib/tools/etf-investment-simulator';

/**
 * Localization wave 3, batch t10: the Irish and New Zealand drink-driving
 * limit sets added to the BAC calculator, and every worked figure quoted in
 * the en-IE, en-NZ, en-SG and en-PH market versions of this batch.
 */

const r2 = (x: number) => Math.round(x * 100) / 100;
const bac = (drinks: [number, number, number][], weightKg: number, sex: 'male' | 'female', hours: number) => {
  const grams = drinks.reduce((t, [n, v, a]) => t + n * alcoholGrams(v, a), 0);
  return { grams, r: widmarkBac({ grams, weightKg, sex, hours })! };
};
const mins = (h: number) => Math.round(h * 60);

describe('BAC limit sets for Ireland and New Zealand', () => {
  it('Ireland: 50 mg general and 20 mg for specified persons (Road Traffic Act 2010 s.4)', () => {
    const ie = bacLimitSet('ie');
    expect(ie.rows.map((r) => r.level)).toEqual([0.05, 0.02]);
    expect(ie.rows[0].where).toMatch(/22 µg per 100 ml of breath/);
    expect(ie.rows[1].where).toMatch(/9 µg per 100 ml of breath/);
  });
  it('New Zealand: 50 mg (250 mcg breath) from 20, zero under 20 (NZ Police)', () => {
    const nz = bacLimitSet('nz');
    expect(nz.rows.map((r) => r.level)).toEqual([0.05, 0]);
    expect(nz.rows[0].where).toMatch(/250 micrograms per litre of breath/);
  });
  it('keeps the existing sets and the unimpaired warning on every set', () => {
    expect(Object.keys(BAC_LIMIT_SETS)).toEqual(['intl', 'gb', 'ca', 'au', 'ie', 'nz']);
    expect(bacLimitSet('intl').rows.map((r) => r.level)).toEqual([0.08, 0.05, 0.02]);
    for (const set of Object.values(BAC_LIMIT_SETS)) expect(set.note).toMatch(/does not mean you are (unimpaired|safe to drive)/);
  });
  it('Irish and NZ standard drinks are 10 g', () => {
    expect(STANDARD_DRINKS.find((d) => d.id === 'ie')!.grams).toBe(10);
    expect(STANDARD_DRINKS.find((d) => d.id === 'nz')!.grams).toBe(10);
  });
});

describe('en-IE BAC examples', () => {
  it('two pints, 80 kg man, 2 hours', () => {
    const { grams, r } = bac([[2, 568, 4.5]], 80, 'male', 2);
    expect(r2(grams)).toBeCloseTo(40.33, 2);
    expect(r.current.toFixed(3)).toBe('0.044');
    expect(mins(r.hoursUntil(0.02))).toBe(97);
    expect(mins(r.hoursToZero)).toBe(177);
  });
  it('one pint for a learner, 75 kg, 1 hour', () => {
    const { grams, r } = bac([[1, 568, 4.5]], 75, 'male', 1);
    expect((grams / 10).toFixed(1)).toBe('2.0');
    expect(r.current.toFixed(3)).toBe('0.025');
    expect(mins(r.hoursUntil(0.02))).toBe(18);
    expect(mins(r.hoursToZero)).toBe(98);
  });
  it('two glasses of wine, 65 kg woman, 1.5 hours', () => {
    const { grams, r } = bac([[2, 150, 12.5]], 65, 'female', 1.5);
    expect(grams.toFixed(1)).toBe('29.6');
    expect(r.current.toFixed(3)).toBe('0.060');
    expect(mins(r.hoursUntil(0.05))).toBe(41);
    expect(mins(r.hoursUntil(0.02))).toBe(161);
  });
  it('six pints of 4.3%, 85 kg man, 11 hours', () => {
    const { grams, r } = bac([[6, 568, 4.3]], 85, 'male', 11);
    expect(grams.toFixed(1)).toBe('115.6');
    expect(r.current.toFixed(3)).toBe('0.035');
    expect(mins(r.hoursUntil(0.02))).toBe(60);
    expect(mins(r.hoursToZero)).toBe(140);
  });
});

describe('en-NZ BAC examples', () => {
  it('four 4% cans, 85 kg man, 2 hours', () => {
    const { grams, r } = bac([[4, 330, 4]], 85, 'male', 2);
    expect(grams.toFixed(1)).toBe('41.7');
    expect(r.current.toFixed(3)).toBe('0.042');
    expect(mins(r.hoursToZero)).toBe(168);
  });
  it('four 5% bottles', () => {
    const { grams, r } = bac([[4, 330, 5]], 85, 'male', 2);
    expect(grams.toFixed(1)).toBe('52.1');
    expect(r.current.toFixed(3)).toBe('0.060');
    expect(mins(r.hoursUntil(0.05))).toBe(40);
    expect(mins(r.hoursToZero)).toBe(240);
  });
  it('two 13% glasses, 65 kg woman, 1 hour', () => {
    const { grams, r } = bac([[2, 150, 13]], 65, 'female', 1);
    expect(grams.toFixed(1)).toBe('30.8');
    expect(r.current.toFixed(3)).toBe('0.071');
    expect(mins(r.hoursUntil(0.05))).toBe(84);
    expect(mins(r.hoursToZero)).toBe(284);
  });
  it('one can for a 19-year-old', () => {
    const { grams, r } = bac([[1, 330, 4]], 70, 'male', 1);
    expect(grams.toFixed(1)).toBe('10.4');
    expect(r.current.toFixed(3)).toBe('0.007');
    expect(mins(r.hoursToZero)).toBe(28);
  });
  it('serve sizes quoted in the copy', () => {
    expect((alcoholGrams(150, 13) / 10).toFixed(1)).toBe('1.5');
    expect((alcoholGrams(330, 5) / 10).toFixed(1)).toBe('1.3');
    expect((alcoholGrams(250, 7) / 10).toFixed(1)).toBe('1.4');
    expect((3 * alcoholGrams(250, 7) / 10).toFixed(1)).toBe('4.1');
  });
});

describe('en-IE annuity examples', () => {
  const pay = (pv: number, rate: number, years: number, growth = 0, remain = 0) => {
    const input = { annualRate: rate, years, paymentsPerYear: 12, timing: 'ordinary' as const, growth };
    const first = annuityPayout(pv, input, remain);
    const total = annuitySchedule(pv, first, input).reduce((t, r) => t + r.payments, 0);
    return { first: r2(first), year: r2(first * 12), total: r2(total) };
  };
  it('€300,000 over 25 years at 4%', () => expect(pay(300000, 4, 25)).toEqual({ first: 1583.51, year: 19002.13, total: 475053.16 }));
  it('€600,000 over 25 years at 4%', () => expect(pay(600000, 4, 25)).toEqual({ first: 3167.02, year: 38004.25, total: 950106.31 }));
  it('rising 2% a year', () => {
    const p = pay(300000, 4, 25, 2);
    expect(p.first).toBe(1287.39);
    expect(p.total).toBe(494827.65);
    expect(r2(1287.39 * 1.02 ** 24)).toBeCloseTo(2070.69, 1);
  });
  it('€60,000 bridge over 6 years at 3%', () => expect(pay(60000, 3, 6)).toMatchObject({ first: 911.62, year: 10939.45 }));
  it('leaving €100,000 after 20 years', () => expect(pay(300000, 4, 20, 0, 100000).first).toBe(1545.29));
  it('lump sum for €1,500 a month', () => {
    expect(r2(annuityLumpSumNeeded(1500, { annualRate: 4, years: 25, paymentsPerYear: 12, timing: 'ordinary', growth: 0 }, 0))).toBe(284178.72);
  });
});

describe('en-NZ property examples', () => {
  const base = {
    homePrice: 850000, downPayment: 170000, interestRate: 5.5, loanTerm: 30, closingCosts: 4000, propertyTax: 3800, homeInsurance: 2500,
    maintenanceCost: 4000, hoaFees: 0, monthlyRent: (650 * 52) / 12, renterInsurance: 300, rentIncrease: 3, homeAppreciation: 3,
    investmentReturn: 6, inflationRate: 2.5, marginalTaxRate: 0, analysisYears: 10, sellingCosts: 3, compoundingPerYear: 12,
  };
  it('NZ$850,000 house: renting ahead after 10 years', () => {
    const r = computeRentVsBuy(base);
    expect(r2(r.monthlyPayment)).toBe(3860.97);
    expect(r2(r.netWorthDifference)).toBe(-25496.29);
    expect(r.recommendation).toBe('rent');
    expect(Math.round(computeRentVsBuy({ ...base, analysisYears: 15 }).netWorthDifference)).toBe(-21655);
  });
  it('4% price growth: buying ahead from year 4', () => {
    const r = computeRentVsBuy({ ...base, homeAppreciation: 4 });
    expect(r.breakEvenYear).toBe(4);
    expect(r2(r.netWorthDifference)).toBe(86906.07);
  });
  it('NZ$650,000 with a 5% deposit', () => {
    const r = computeRentVsBuy({ ...base, homePrice: 650000, downPayment: 32500, closingCosts: 3500, propertyTax: 3000, homeInsurance: 2000, maintenanceCost: 3000, monthlyRent: (550 * 52) / 12 });
    expect(r2(r.monthlyPayment)).toBe(3506.1);
    expect(r.breakEvenYear).toBe(6);
    expect(r2(r.netWorthDifference)).toBe(25101.47);
  });
  it('selling after four years', () => expect(r2(computeRentVsBuy({ ...base, analysisYears: 4 }).netWorthDifference)).toBe(-28338.63));

  const re = {
    purchasePrice: 750000, downPayment: 30, closingCosts: 1, loanTerm: 30, interestRate: 5.5, monthlyRent: (650 * 52) / 12, propertyTaxes: 3500,
    insurance: 2800, maintenance: 3000, vacancy: 4, propertyManagement: 8, appreciation: 3, analysisYears: 10, depreciation: 0, taxRate: 33,
    repayment: 'amortising' as const, compoundingPerYear: 12, taxModel: 'deduct' as const, lossRelief: 'none' as const,
  };
  it('ring-fenced rental: year 1 and ten-year cash flow', () => {
    const { results, metrics } = analyzeRentalProperty(re);
    const y1 = results[0];
    expect([y1.grossRent, y1.noi, y1.interestPayment, y1.cashFlow, y1.taxableProfit, y1.tax].map((x) => Math.round(x) + 0)).toEqual([33800, 20552, 28698, -15219, -8146, 0]);
    expect(metrics.capRate.toFixed(2)).toBe('2.74');
    expect(Math.round(metrics.totalAfterTaxCashFlow)).toBe(-108486);
    expect(results.slice(6).every((r) => r.tax === 0)).toBe(true);
  });
  it('the same loss set against other income', () => {
    const { results, metrics } = analyzeRentalProperty({ ...re, lossRelief: 'full' });
    expect(Math.round(results[0].tax)).toBe(-2688);
    expect(Math.round(metrics.totalAfterTaxCashFlow)).toBe(-102933);
  });
  it('40% deposit', () => {
    const { results, metrics } = analyzeRentalProperty({ ...re, downPayment: 40 });
    expect(Math.round(results[0].interestPayment)).toBe(24599);
    expect(Math.round(results[0].cashFlow)).toBe(-10108);
    expect(results.slice(4, 7).every((r) => r.tax === 0)).toBe(true);
    expect(results.slice(7).map((r) => Math.round(r.tax))).toEqual([1650, 2395, 2945]);
    expect(metrics.cashOnCashReturn.toFixed(2)).toBe('-3.29');
  });
});

describe('en-SG examples', () => {
  const div = (o: Partial<Parameters<typeof projectDividends>[0]>) => {
    const r = projectDividends({ sharePrice: 30, annualDividendPerShare: 1.5, initialInvestment: 50000, frequency: 2, years: 15, dividendGrowthPct: 3, priceGrowthPct: 3, drip: true, monthlyContribution: 0, taxPct: 0, taxMethod: 'flat', ...o });
    if (!r.ok) throw new Error('dividend projection failed');
    return r.value;
  };
  it('SGX share reinvested and as cash', () => {
    const a = div({});
    expect([a.annualIncome, a.incomePerPayment]).toEqual([2500, 1250]);
    expect(r2(a.finalValue)).toBe(160799.04);
    expect(a.rows[14].shares.toFixed(2)).toBe('3440.36');
    expect(r2(a.rows[14].forwardIncome)).toBe(8039.95);
    const b = div({ drip: false });
    expect(r2(b.finalValue)).toBe(124395.66);
    expect(r2(b.totalDividendsNet)).toBe(46497.28);
  });
  it('S-REIT quarterly, cash', () => {
    const v = div({ sharePrice: 2.5, annualDividendPerShare: 0.15, initialInvestment: 30000, frequency: 4, years: 10, dividendGrowthPct: 1, priceGrowthPct: 1, drip: false });
    expect([v.annualIncome, v.incomePerPayment]).toEqual([1800, 450]);
    expect(r2(v.totalDividendsNet)).toBe(18831.98);
    expect(r2(v.finalValue)).toBe(51970.65);
  });
  it('US share with 30% withholding', () => {
    const o = { sharePrice: 200, annualDividendPerShare: 4, frequency: 4, dividendGrowthPct: 5, priceGrowthPct: 6 };
    expect(r2(div({ ...o, taxPct: 30 }).finalValue)).toBe(144811.28);
    expect(r2(div({ ...o, taxPct: 30 }).totalDividendsNet)).toBe(16831.42);
    expect(r2(div({ ...o, taxPct: 0 }).finalValue)).toBe(157025.62);
  });
  it('investment for S$24,000 a year', () => {
    expect(investmentForIncome(24000, 5)).toBe(480000);
    expect(investmentForIncome(24000, 6)).toBeCloseTo(400000, 6);
  });

  const grow = (p: number, rate: number, years: number, cf: string, add = 0) => r2(computeCompoundGrowth({
    principal: p, ratePerPeriod: toRatePerPeriod(rate, 'annually', cf), periodsPerYear: periodsPerYear(cf), years,
    contributionsPerYear: contributionsPerYear(add, 'monthly'), contributionTiming: 'end',
  }).finalAmount);
  it('CPF and deposit compounding', () => {
    expect(grow(20000, 2.5, 10, 'annually')).toBe(25601.69);
    expect(grow(20000, 4, 10, 'annually')).toBe(29604.89);
    expect(grow(20000, 5, 10, 'annually')).toBe(32577.89);
    expect(grow(0, 4, 40, 'annually', 100)).toBe(114030.62);
    expect(grow(0, 4, 40, 'monthly', 100)).toBe(118196.13);
    expect(grow(50000, 3, 3, 'annually')).toBe(54636.35);
    expect(grow(10000, 4, 18, 'annually')).toBeGreaterThan(20000);
    expect(grow(10000, 4, 18, 'annually')).toBeLessThan(20300);
  });

  const etf = (o: Partial<Parameters<typeof simulateEtf>[0]>) => simulateEtf({
    initialAmount: 10000, monthlyContribution: 1000, contributionFrequency: 'monthly', annualReturn: 6, dividendYield: 1.5, reinvestDividends: true,
    investmentPeriod: 20, contributionIncrease: 0, contributionIncreaseFrequency: 'yearly', expenseRatio: 0.03, inflationRate: 2, ...o,
  }).summary;
  it('ETF withholding against fees', () => {
    const us = etf({ annualReturn: 5.55, dividendYield: 1.05 });
    expect([us.finalValue, us.realFinalValue, us.totalFees].map(Math.round)).toEqual([460174, 309684, 1142]);
    const none = etf({});
    expect([none.finalValue, none.realFinalValue].map(Math.round)).toEqual([485031, 326412]);
    expect(Math.round(etf({ expenseRatio: 0.5 }).finalValue)).toBe(459104);
  });
  it('MoneySense fee example', () => {
    const a = etf({ initialAmount: 50000, monthlyContribution: 0, expenseRatio: 0.1 });
    const b = etf({ initialAmount: 50000, monthlyContribution: 0, expenseRatio: 0.5 });
    expect([a.finalValue, a.totalFees, b.finalValue, b.totalFees].map(Math.round)).toEqual([157358, 1820, 145888, 8717]);
  });

  it('SGS bond prices and yields', () => {
    const b = { face: 100, couponRate: 3, years: 10, frequency: 2 };
    const p = bondPriceFromYield(b, 2.5);
    expect(p.clean.toFixed(4)).toBe('104.3998');
    expect(currentYield(b, p.clean).toFixed(3)).toBe('2.874');
    expect(p.modified.toFixed(3)).toBe('8.639');
    expect(bondPriceFromYield(b, 3.5).dirty.toFixed(2)).toBe('95.81');
    const mid = bondPriceFromYield({ ...b, years: 9.75 }, 2.5);
    expect([mid.clean.toFixed(4), mid.accrued.toFixed(4), mid.dirty.toFixed(4)]).toEqual(['104.3003', '0.7500', '105.0503']);
    const long = { face: 100, couponRate: 2.75, years: 20, frequency: 2 };
    const y = bondYieldFromPrice(long, 95, 'clean');
    expect(y.toFixed(4)).toBe('3.0869');
    expect(currentYield(long, 95).toFixed(3)).toBe('2.895');
    expect(bondPriceFromYield(long, y).modified.toFixed(3)).toBe('15.142');
  });
});

describe('en-PH currency examples (ECB rates for November 6, 2026)', () => {
  const t = { base: 'EUR', date: '2026-11-06', rates: { AUD: 1.625, CAD: 1.5705, GBP: 0.83415, HKD: 8.7505, JPY: 176.77, PHP: 70.358, SGD: 1.4309, USD: 1.1165 } };
  const conv = (a: number, f: string, to: string) => r2(convertAmount(a, crossRate(t, f, to)));
  it('converts the quoted amounts', () => {
    expect(crossRate(t, 'USD', 'PHP').toFixed(6)).toBe('63.016570');
    expect(conv(500, 'USD', 'PHP')).toBe(31508.28);
    expect(conv(1500, 'SGD', 'PHP')).toBe(73755.68);
    expect(conv(100000, 'JPY', 'PHP')).toBe(39802);
    expect(conv(50000, 'PHP', 'USD')).toBe(793.44);
  });
});
