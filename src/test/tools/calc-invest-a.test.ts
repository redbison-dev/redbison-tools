import { describe, it, expect } from 'vitest';
import {
  parseNum,
  yearsBetween,
  splitYearsMonths,
  ratePerPaymentPeriod,
  effectiveAnnualRate,
  fvAnnuityFactor,
  pvAnnuityFactor,
  savingsBalance,
  requiredDeposit,
  periodsToGoal,
  savingsSchedule,
  inflateForward,
  deflateBack,
  averageAnnualRate,
  cpiAdjust,
  cpiFor,
  cpiYears,
  cagr,
  cagrEndValue,
  cagrYears,
  simpleAnnualReturn,
  yearlyReturns,
  computeRoi,
  futureValue,
  presentValue,
  perpetuityPv,
  npv,
  irrAll,
  mirr,
  paybackPeriod,
  profitabilityIndex,
  parseCashFlows,
  signChanges,
  annualToPeriodRate,
  type SavingsInput,
  type TvmInput,
} from '@/lib/tools/calculators/invest-a';

describe('shared helpers', () => {
  it('parses typed numbers with separators and symbols', () => {
    expect(parseNum('1,234.5')).toBe(1234.5);
    expect(parseNum('$ 2 000')).toBe(2000);
    expect(parseNum('7%')).toBe(7);
    expect(parseNum('')).toBeNaN();
    expect(parseNum('abc')).toBeNaN();
  });

  it('measures years between dates with actual days / 365.25', () => {
    expect(yearsBetween('2020-01-01', '2024-01-01')).toBeCloseTo(1461 / 365.25, 12);
    expect(yearsBetween('2020-01-01', 'nope')).toBeNaN();
    expect(splitYearsMonths(2.5)).toEqual({ years: 2, months: 6 });
    expect(splitYearsMonths(2.99)).toEqual({ years: 3, months: 0 });
  });

  it('converts nominal rates between compounding and payment frequencies', () => {
    // 12% compounded monthly, paid monthly: 1% per month.
    expect(ratePerPaymentPeriod(12, 12, 12)).toBeCloseTo(0.01, 12);
    // 10% compounded monthly: APY 10.4713%.
    expect(effectiveAnnualRate(10, 12)).toBeCloseTo(0.104713067, 8);
    // Continuous: e^0.10 - 1 = 10.517%.
    expect(effectiveAnnualRate(10, 'continuous')).toBeCloseTo(0.105170918, 8);
    // 6% compounded annually but paid monthly: (1.06)^(1/12) - 1.
    expect(ratePerPaymentPeriod(6, 1, 12)).toBeCloseTo(Math.pow(1.06, 1 / 12) - 1, 12);
    expect(ratePerPaymentPeriod(0, 12, 12)).toBe(0);
  });

  it('annuity factors fall back to n at a zero rate', () => {
    expect(fvAnnuityFactor(0, 10)).toBe(10);
    expect(pvAnnuityFactor(0, 10)).toBe(10);
    // Standard tables: FVIFA(5%, 10) = 12.5779, PVIFA(5%, 10) = 7.7217.
    expect(fvAnnuityFactor(0.05, 10)).toBeCloseTo(12.577893, 5);
    expect(pvAnnuityFactor(0.05, 10)).toBeCloseTo(7.721735, 5);
  });
});

describe('savings-goal-calculator', () => {
  const base: SavingsInput = { goal: 100000, startingBalance: 0, annualRatePct: 6, compounding: 12, depositsPerYear: 12, timing: 'end' };

  it('solves the monthly deposit like Excel PMT', () => {
    // PMT(0.5%, 120, 0, -100000) = 610.21
    expect(requiredDeposit(base, 10)).toBeCloseTo(610.205, 2);
    // Deposits at the start of each month need slightly less: 610.205 / 1.005
    expect(requiredDeposit({ ...base, timing: 'start' }, 10)).toBeCloseTo(610.205 / 1.005, 2);
  });

  it('is plain division at 0% and zero when the starting balance already covers the goal', () => {
    expect(requiredDeposit({ ...base, goal: 10000, annualRatePct: 0 }, 3)).toBeCloseTo(277.78, 2);
    expect(requiredDeposit({ ...base, goal: 10000, startingBalance: 9000, annualRatePct: 5 }, 3)).toBe(0);
  });

  it('projects the final balance of a deposit series', () => {
    // 100 a month at 5% compounded monthly for 10 years = 15,528.23
    expect(savingsBalance({ ...base, annualRatePct: 5 }, 100, 120)).toBeCloseTo(15528.23, 2);
    // Starting balance only: 10,000 at 6% monthly for 10 years = 18,193.97
    expect(savingsBalance({ ...base, startingBalance: 10000 }, 0, 120)).toBeCloseTo(18193.97, 2);
  });

  it('finds the number of deposits needed to reach a goal', () => {
    expect(periodsToGoal({ ...base, goal: 10000, annualRatePct: 0 }, 500).periods).toBe(20);
    const r = periodsToGoal(base, 610.21);
    expect(r.periods).toBe(120);
    expect(r.exact).toBeCloseTo(120, 2);
    expect(periodsToGoal({ ...base, annualRatePct: 0 }, 0).periods).toBe(Infinity);
    expect(periodsToGoal({ ...base, startingBalance: 200000 }, 0).periods).toBe(0);
    // Growth alone eventually gets there: 50,000 at 6% monthly doubles in ~139 months.
    expect(periodsToGoal({ ...base, startingBalance: 50000 }, 0).periods).toBe(139);
  });

  it('builds a yearly schedule with a partial final year', () => {
    const rows = savingsSchedule({ ...base, annualRatePct: 0 }, 100, 18);
    expect(rows).toHaveLength(2);
    expect(rows[1].year).toBe(1.5);
    expect(rows[1].balance).toBe(1800);
    expect(rows[1].interest).toBe(0);
  });
});

describe('inflation-calculator', () => {
  it('compounds an assumed rate forward and back', () => {
    expect(inflateForward(100, 3, 10)).toBeCloseTo(134.39, 2);
    expect(deflateBack(134.3916, 3, 10)).toBeCloseTo(100, 3);
    expect(inflateForward(100, 0, 10)).toBe(100);
    expect(averageAnnualRate(100, 134.3916, 10)).toBeCloseTo(0.03, 6);
  });

  it('uses BLS CPI-U annual averages', () => {
    expect(cpiYears()).toEqual({ first: 1913, last: 2025 });
    // Published annual averages, series CUUR0000SA0.
    expect(cpiFor(1913)).toBe(9.9);
    expect(cpiFor(1982)).toBe(96.5);
    expect(cpiFor(2020)).toBe(258.811);
    expect(cpiFor(2022)).toBe(292.655);
    expect(cpiFor(2024)).toBe(313.689);
    const r = cpiAdjust(100, 2020, 2025)!;
    expect(r.value).toBeCloseTo(124.39, 2);
    expect(r.cumulativePct).toBeCloseTo(24.39, 2);
    expect(cpiAdjust(100, 1913, 2025)!.value).toBeCloseTo(3251.95, 2);
    // Backwards: 2025 dollars to 2000 dollars.
    expect(cpiAdjust(100, 2025, 2000)!.value).toBeCloseTo(100 * 172.2 / 321.943, 6);
    expect(cpiAdjust(100, 1900, 2000)).toBeNull();
  });

  it('every CPI year between the first and last has a value', () => {
    const { first, last } = cpiYears();
    for (let y = first; y <= last; y++) expect(cpiFor(y), String(y)).toBeGreaterThan(0);
  });
});

describe('cagr-calculator', () => {
  it('matches textbook CAGR values', () => {
    // Doubling in 10 years: 2^(1/10) - 1 = 7.1773%
    expect(cagr(100, 200, 10)).toBeCloseTo(0.0717735, 6);
    // 10,000 to 19,000 over 5 years: 13.70%
    expect(cagr(10000, 19000, 5)).toBeCloseTo(0.136973, 5);
    expect(cagr(100, 50, 2)).toBeCloseTo(Math.sqrt(0.5) - 1, 10);
    expect(cagr(100, 0, 3)).toBe(-1);
  });

  it('rejects undefined cases', () => {
    expect(cagr(0, 100, 5)).toBeNaN();
    expect(cagr(-100, 100, 5)).toBeNaN();
    expect(cagr(100, 200, 0)).toBeNaN();
  });

  it('solves for end value and years in reverse', () => {
    expect(cagrEndValue(1000, 10, 3)).toBeCloseTo(1331, 8);
    // Rule of 72 check: 10% doubles in log(2)/log(1.1) = 7.2725 years
    expect(cagrYears(1000, 2000, 10)).toBeCloseTo(7.27254, 4);
    expect(cagrYears(1000, 2000, 0)).toBeNaN();
    expect(cagrYears(2000, 1000, 10)).toBeNaN();
  });

  it('shows why the simple average return overstates compound growth', () => {
    expect(simpleAnnualReturn(100, 200, 10)).toBeCloseTo(0.1, 12);
    // +50% then -50%: arithmetic mean 0%, but you lost 25% (CAGR -13.4%)
    const y = yearlyReturns([100, 150, 75]);
    expect(y.returns[0]).toBeCloseTo(0.5, 12);
    expect(y.returns[1]).toBeCloseTo(-0.5, 12);
    expect(y.arithmeticMean).toBeCloseTo(0, 12);
    expect(y.geometric).toBeCloseTo(Math.sqrt(0.75) - 1, 12);
  });
});

describe('roi-calculator', () => {
  it('computes total and annualized ROI', () => {
    const r = computeRoi({ invested: 1000, returned: 1500, years: 2 })!;
    expect(r.roi).toBeCloseTo(0.5, 12);
    expect(r.annualized).toBeCloseTo(Math.sqrt(1.5) - 1, 12); // 22.47%
    expect(r.netGain).toBe(500);
  });

  it('adds costs to the basis and counts income received', () => {
    const r = computeRoi({ invested: 10000, returned: 12000, costs: 200, income: 300, years: 3 })!;
    expect(r.totalCost).toBe(10200);
    expect(r.netGain).toBe(2100);
    expect(r.roi).toBeCloseTo(2100 / 10200, 12);
    expect(r.annualized).toBeCloseTo(Math.pow(12300 / 10200, 1 / 3) - 1, 12);
  });

  it('handles losses, total loss and missing duration', () => {
    expect(computeRoi({ invested: 1000, returned: 0, years: 2 })!.annualized).toBe(-1);
    expect(computeRoi({ invested: 1000, returned: 800, years: 0 })!.annualized).toBeNaN();
    expect(computeRoi({ invested: 0, returned: 800, years: 1 })).toBeNull();
    // Under a year the annualized figure is larger than the total.
    expect(computeRoi({ invested: 100, returned: 105, years: 0.5 })!.annualized).toBeCloseTo(0.1025, 10);
  });
});

describe('present-future-value-calculator', () => {
  const t: TvmInput = { annualRatePct: 5, compounding: 1, years: 10, paymentsPerYear: 1, payment: 1000, timing: 'end' };

  it('matches standard annuity table values', () => {
    expect(futureValue(0, t).total).toBeCloseTo(12577.89, 2); // FV ordinary annuity
    expect(presentValue(0, t).total).toBeCloseTo(7721.73, 2); // PV ordinary annuity
    expect(futureValue(0, { ...t, timing: 'start' }).total).toBeCloseTo(13206.79, 2); // FV annuity due
    expect(presentValue(0, { ...t, timing: 'start' }).total).toBeCloseTo(8107.82, 2); // PV annuity due
  });

  it('handles lump sums at any compounding frequency', () => {
    const m: TvmInput = { annualRatePct: 6, compounding: 12, years: 10, paymentsPerYear: 12, payment: 0, timing: 'end' };
    expect(futureValue(10000, m).total).toBeCloseTo(18193.97, 2);
    expect(presentValue(18193.97, m).total).toBeCloseTo(10000, 1);
    // Quarterly compounding with annual payments uses the effective annual rate.
    const q = futureValue(1000, { ...m, compounding: 4, paymentsPerYear: 1, years: 5 });
    expect(q.total).toBeCloseTo(1000 * Math.pow(1.015, 20), 8);
    // Continuous: 1000 e^(0.06*5)
    expect(futureValue(1000, { ...m, compounding: 'continuous', years: 5 }).total).toBeCloseTo(1000 * Math.exp(0.3), 8);
  });

  it('combines a lump sum with a payment series and works at 0%', () => {
    const r = futureValue(5000, { ...t, annualRatePct: 0 });
    expect(r.total).toBe(15000);
    expect(r.lump).toBe(5000);
    expect(r.series).toBe(10000);
    expect(perpetuityPv(100, 0.05, 'end')).toBeCloseTo(2000, 10);
    expect(perpetuityPv(100, 0.05, 'start')).toBeCloseTo(2100, 10);
  });
});

describe('npv-irr-calculator', () => {
  it('matches the Excel NPV examples (adjusted for a t = 0 first flow)', () => {
    // Excel NPV(10%, -10000, 3000, 4200, 6800) = 1,188.44 discounts every flow
    // one period, which equals our NPV with a zero at t = 0.
    expect(npv(0.1, [0, -10000, 3000, 4200, 6800])).toBeCloseTo(1188.44, 2);
    // NPV(8%, 8000, 9200, 10000, 12000, 14500) - 40000 = 1,922.06
    expect(npv(0.08, [-40000, 8000, 9200, 10000, 12000, 14500])).toBeCloseTo(1922.06, 2);
    expect(npv(0, [-100, 60, 60])).toBe(20);
  });

  it('matches the Excel IRR examples', () => {
    const flows = [-70000, 12000, 15000, 18000, 21000, 26000];
    const r = irrAll(flows);
    expect(r.rates).toHaveLength(1);
    expect(r.rates[0]).toBeCloseTo(0.086631, 5); // 8.7%
    expect(npv(r.rates[0], flows)).toBeCloseTo(0, 6);
    expect(irrAll(flows.slice(0, 5)).rates[0]).toBeCloseTo(-0.021245, 5); // -2.1%
    expect(irrAll(flows.slice(0, 3)).rates[0]).toBeCloseTo(-0.443507, 5); // -44.4%
  });

  it('finds every IRR when cash flows change sign twice', () => {
    // -100 + 230/(1+r) - 132/(1+r)^2 = 0 has roots at 10% and 20%.
    const r = irrAll([-100, 230, -132]);
    expect(signChanges([-100, 230, -132])).toBe(2);
    expect(r.note).toBe('multiple');
    expect(r.rates).toHaveLength(2);
    expect(r.rates[0]).toBeCloseTo(0.1, 9);
    expect(r.rates[1]).toBeCloseTo(0.2, 9);
  });

  it('reports no IRR when there is no sign change or no root', () => {
    expect(irrAll([100, 200, 300]).note).toBe('no-sign-change');
    // -100 + 50/(1+r) ... never reaches zero: always negative.
    const none = irrAll([-100, 300, -300]);
    expect(none.rates).toHaveLength(0);
    expect(none.note).toBe('no-root');
  });

  it('finds very high and very negative IRRs', () => {
    expect(irrAll([-100, 1100]).rates[0]).toBeCloseTo(10, 8); // 1,000%
    expect(irrAll([-100, 5]).rates[0]).toBeCloseTo(-0.95, 9);
  });

  it('matches the Excel MIRR examples', () => {
    const flows = [-120000, 39000, 30000, 21000, 37000, 46000];
    expect(mirr(flows, 0.1, 0.12)).toBeCloseTo(0.126094, 5);
    expect(mirr(flows.slice(0, 4), 0.1, 0.12)).toBeCloseTo(-0.048044, 5);
    expect(mirr(flows, 0.1, 0.14)).toBeCloseTo(0.134759, 5);
    expect(mirr([100, 200], 0.1, 0.1)).toBeNaN();
  });

  it('computes simple and discounted payback with interpolation', () => {
    expect(paybackPeriod([-1000, 300, 400, 500])).toBeCloseTo(2.6, 12);
    expect(paybackPeriod([-1000, 300, 300])).toBeNull();
    expect(paybackPeriod([-1000, 1000])).toBe(1);
    // Discounted at 10%: -1000, 272.73, 330.58, 375.66 → never (cum -21.04)
    expect(paybackPeriod([-1000, 300, 400, 500], 0.1)).toBeNull();
    // -1000, 500, 500, 500 at 10%: cum -545.45, -132.23, then +375.66 → 2 + 132.23/375.66
    expect(paybackPeriod([-1000, 500, 500, 500], 0.1)).toBeCloseTo(2 + (1000 - 500 / 1.1 - 500 / 1.21) / (500 / 1.331), 10);
  });

  it('profitability index and rate conversion', () => {
    expect(profitabilityIndex(0.1, [-1000, 1100])).toBeCloseTo(1, 12);
    expect(annualToPeriodRate(0.12682503, 12)).toBeCloseTo(0.01, 8);
  });

  it('parses cash flows typed in different ways', () => {
    expect(parseCashFlows('-1000\n300\n400').flows).toEqual([-1000, 300, 400]);
    expect(parseCashFlows('-1000, 300, 400').flows).toEqual([-1000, 300, 400]);
    expect(parseCashFlows('-1000,300,400').flows).toEqual([-1000, 300, 400]);
    expect(parseCashFlows('-70,000\n12,000').flows).toEqual([-70000, 12000]);
    expect(parseCashFlows('(5000); 2000; −300').flows).toEqual([-5000, 2000, -300]);
    expect(parseCashFlows('100\nabc').errors).toHaveLength(1);
  });
});
