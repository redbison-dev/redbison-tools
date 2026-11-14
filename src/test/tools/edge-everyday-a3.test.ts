/**
 * Edge, corner, positive and negative cases for the investing calculators
 * (lane 6 of docs/test-coverage-plan.md). References: Microsoft Excel
 * function documentation worked examples (IRR, MIRR, RATE), Regulation DD
 * Appendix A APY examples, BLS CPI-U annual averages, IRS 2026 limits and
 * textbook bond examples; otherwise a hand calculation in the comment.
 */
import { describe, it, expect } from 'vitest';
import {
  parseNum,
  yearsBetween,
  daysBetween,
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
  cpiYears,
  cpiFor,
  cpiAdjust,
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
  signChanges,
  irrAll,
  mirr,
  paybackPeriod,
  profitabilityIndex,
  parseCashFlows,
  annualToPeriodRate,
  periodToAnnualRate,
  type SavingsInput,
  type TvmInput,
} from '@/lib/tools/calculators/invest-a';
import {
  round,
  LIMITS_2026,
  catchUpForAge,
  indexLimit,
  parseMatchTiers,
  formatMatchTiers,
  matchPercentOfPay,
  fullMatchDeferralPct,
  project401k,
  growTaxable,
  compareRothTraditional,
  iraLimitForAge,
  aprToApy,
  apyToApr,
  regDdApy,
  growAtApr,
  computeCd,
  sipMonthlyRate,
  computeSip,
  sipFutureValue,
  computeLumpSum,
  sipForTarget,
  annuityPvFactor,
  annuityDiscount,
  levelPayment,
  annuitySchedule,
  annuityPayout,
  annuityLumpSumNeeded,
  annuityFutureValue,
  bondPeriods,
  bondPriceFromYield,
  bondYieldFromPrice,
  currentYield,
  latestRatesUrl,
  seriesUrl,
  parseLatest,
  parseSeries,
  crossRate,
  convertAmount,
  currencyDecimals,
  type FourOhOneKInput,
  type RothCompareInput,
  type CdInput,
  type SipInput,
  type AnnuityInput,
} from '@/lib/tools/calculators/invest-b';

const cents = (x: number) => Math.round(x * 100) / 100;

describe('invest-a: parsing and dates', () => {
  it('parseNum tolerates separators, currency and percent signs', () => {
    expect(parseNum('1,234,567.5')).toBe(1234567.5);
    expect(parseNum(' $ 1 000 ')).toBe(1000);
    expect(parseNum('12%')).toBe(12);
    expect(parseNum('1_000')).toBe(1000);
    expect(parseNum(42)).toBe(42);
  });
  it('parseNum: empty, lone sign, words and null are NaN', () => {
    for (const v of ['', '-', '.', 'abc', '1e999', null, undefined]) expect(parseNum(v as never)).toBeNaN();
  });
  it('days and years between dates, across a leap day', () => {
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2);
    expect(daysBetween('2023-02-28', '2023-03-01')).toBe(1);
    expect(daysBetween('2024-03-01', '2024-02-28')).toBe(-2);
    expect(yearsBetween('2024-01-01', '2025-01-01')).toBeCloseTo(366 / 365.25, 12);
    expect(yearsBetween('2020-02-29', '2024-02-29')).toBeCloseTo(1461 / 365.25, 12);
  });
  it('impossible or malformed dates give NaN instead of rolling into the next month', () => {
    // 2023 is not a leap year; V8 would otherwise read 2023-02-29 as 1 March
    expect(daysBetween('2023-02-29', '2023-03-01')).toBeNaN();
    expect(yearsBetween('2024-02-30', '2025-01-01')).toBeNaN();
    expect(yearsBetween('2024-04-31', '2025-01-01')).toBeNaN();
    expect(daysBetween('not a date', '2024-01-01')).toBeNaN();
    expect(yearsBetween('2024-01-01', '2024-13-01')).toBeNaN();
  });
  it('splitYearsMonths rounds 11.88 months up to the next year', () => {
    expect(splitYearsMonths(2.5)).toEqual({ years: 2, months: 6 });
    expect(splitYearsMonths(1.99)).toEqual({ years: 2, months: 0 });
    expect(splitYearsMonths(0)).toEqual({ years: 0, months: 0 });
    expect(splitYearsMonths(3 - 1e-12)).toEqual({ years: 3, months: 0 });
  });
});

describe('invest-a: rates and annuity factors', () => {
  it('rate per payment period: 12% monthly compounding paid quarterly = 1.01^3 - 1', () => {
    expect(ratePerPaymentPeriod(12, 12, 4)).toBeCloseTo(0.030301, 9);
    expect(ratePerPaymentPeriod(0, 12, 12)).toBe(0);
    // continuous 5% a year = e^0.05 - 1
    expect(effectiveAnnualRate(5, 'continuous')).toBeCloseTo(0.0512711, 7);
    expect(effectiveAnnualRate(12, 12)).toBeCloseTo(0.1268250, 7);
  });
  it('annuity factors: FV(0.5%, 120) = 163.8793; PV(0.5%, 360) = 166.7916; 0% gives n', () => {
    expect(fvAnnuityFactor(0.005, 120)).toBeCloseTo(163.8793, 4);
    expect(pvAnnuityFactor(0.005, 360)).toBeCloseTo(166.7916, 4);
    expect(fvAnnuityFactor(0, 12)).toBe(12);
    expect(pvAnnuityFactor(0, 12)).toBe(12);
  });
  it('annual <-> period rates are inverses', () => {
    expect(annualToPeriodRate(0.126825, 12)).toBeCloseTo(0.01, 7);
    expect(periodToAnnualRate(0.01, 12)).toBeCloseTo(0.126825, 6);
  });
});

const sv = (o: Partial<SavingsInput> = {}): SavingsInput => ({
  goal: 100000, startingBalance: 0, annualRatePct: 6, compounding: 12, depositsPerYear: 12, timing: 'end', ...o,
});

describe('invest-a: savings goal', () => {
  it('100,000 in 10 years at 6% monthly: 100,000 / 163.8793 = 610.21 a month', () => {
    expect(cents(requiredDeposit(sv(), 10))).toBe(610.21);
    // deposits at the start of the month earn one more month: / 1.005
    expect(cents(requiredDeposit(sv({ timing: 'start' }), 10))).toBe(607.17);
  });
  it('0% goal: a straight division; the starting balance alone can already be enough', () => {
    expect(requiredDeposit(sv({ goal: 12000, annualRatePct: 0 }), 1)).toBe(1000);
    expect(requiredDeposit(sv({ goal: 1000, startingBalance: 1000 }), 1)).toBe(0);
    expect(requiredDeposit(sv(), 0)).toBeNaN();
    expect(requiredDeposit(sv(), 0.01)).toBeNaN();
  });
  it('periodsToGoal: doubling at 7.2% a year takes ln2/ln1.072 = 9.97 years -> 10 deposits', () => {
    const p = periodsToGoal(sv({ goal: 2000, startingBalance: 1000, annualRatePct: 7.2, compounding: 1, depositsPerYear: 1 }), 0);
    expect(p.exact).toBeCloseTo(9.9696, 3);
    expect(p.periods).toBe(10);
  });
  it('periodsToGoal at 0%: 1000 / 100 = 10 deposits; zero deposit never gets there', () => {
    expect(periodsToGoal(sv({ goal: 1000, annualRatePct: 0 }), 100)).toEqual({ exact: 10, periods: 10 });
    expect(periodsToGoal(sv({ goal: 1000, annualRatePct: 0 }), 0).periods).toBe(Infinity);
    expect(periodsToGoal(sv({ goal: 1000, startingBalance: 1000 }), 0)).toEqual({ exact: 0, periods: 0 });
  });
  it('periodsToGoal: nothing saved and nothing deposited, or a shrinking balance, never reaches the goal', () => {
    expect(periodsToGoal(sv(), 0).periods).toBe(Infinity);
    // -10% a year with no deposits only shrinks the balance
    expect(periodsToGoal(sv({ goal: 2000, startingBalance: 1000, annualRatePct: -10, compounding: 1, depositsPerYear: 1 }), 0).periods).toBe(Infinity);
  });
  it('the balance after the rounded-up periods really reaches the goal', () => {
    const inp = sv({ goal: 50000, startingBalance: 1234 });
    const p = periodsToGoal(inp, 400);
    expect(savingsBalance(inp, 400, p.periods)).toBeGreaterThanOrEqual(50000 - 1e-6);
    expect(savingsBalance(inp, 400, p.periods - 1)).toBeLessThan(50000);
  });
  it('savingsSchedule: partial last year, empty for 0 or infinite periods', () => {
    const rows = savingsSchedule(sv({ annualRatePct: 0 }), 100, 30);
    expect(rows.map((r) => r.year)).toEqual([1, 2, 2.5]);
    expect(rows[2].deposits).toBe(3000);
    expect(rows[2].interest).toBe(0);
    expect(savingsSchedule(sv(), 100, 0)).toEqual([]);
    expect(savingsSchedule(sv(), 100, Infinity)).toEqual([]);
  });
});

describe('invest-a: inflation and CPI', () => {
  it('forward and back are inverses; average rate', () => {
    expect(inflateForward(100, 3, 10)).toBeCloseTo(134.3916, 4);
    expect(deflateBack(134.3916, 3, 10)).toBeCloseTo(100, 3);
    expect(averageAnnualRate(100, 200, 10)).toBeCloseTo(Math.pow(2, 0.1) - 1, 12);
    expect(averageAnnualRate(0, 200, 10)).toBeNaN();
    expect(averageAnnualRate(100, 200, 0)).toBeNaN();
  });
  it('CPI-U: 1990 (130.7) to 2020 (258.811) roughly doubles prices', () => {
    const r = cpiAdjust(100, 1990, 2020)!;
    expect(r.value).toBeCloseTo(198.019, 3);
    expect(r.averageAnnualPct).toBeCloseTo(2.3034, 3);
    // backwards: same average rate, value shrinks
    const b = cpiAdjust(100, 2020, 1990)!;
    expect(b.value).toBeCloseTo(50.5003, 3);
    expect(b.averageAnnualPct).toBeCloseTo(2.3034, 3);
    expect(cpiAdjust(100, 2020, 2020)!.averageAnnualPct).toBe(0);
  });
  it('CPI range ends: 1913 and the last year exist, 1912 does not', () => {
    const { first, last } = cpiYears();
    expect(first).toBe(1913);
    expect(cpiFor(first)).toBe(9.9);
    expect(cpiFor(last)).toBeGreaterThan(0);
    expect(cpiAdjust(100, 1912, 2020)).toBeNull();
    expect(cpiAdjust(100, 1990, last + 1)).toBeNull();
  });
});

describe('invest-a: CAGR and ROI', () => {
  it('CAGR 100 -> 200 over 5 years = 2^(1/5) - 1 = 14.87%', () => {
    expect(cagr(100, 200, 5)).toBeCloseTo(0.148698, 6);
    expect(cagr(100, 0, 5)).toBe(-1);
    expect(cagr(0, 100, 5)).toBeNaN();
    expect(cagr(100, -1, 5)).toBeNaN();
    expect(cagr(100, 200, 0)).toBeNaN();
  });
  it('cagrEndValue / cagrYears', () => {
    expect(cagrEndValue(1000, 10, 2)).toBeCloseTo(1210, 9);
    expect(cagrYears(1000, 1210, 10)).toBeCloseTo(2, 9);
    expect(cagrYears(1000, 1000, 10)).toBe(0);
    expect(cagrYears(1000, 900, 10)).toBeNaN();
    expect(cagrYears(1000, 1210, 0)).toBeNaN();
    expect(cagrYears(1000, 1210, -100)).toBeNaN();
  });
  it('simple and year-by-year returns', () => {
    expect(simpleAnnualReturn(100, 150, 5)).toBeCloseTo(0.1, 12);
    expect(simpleAnnualReturn(0, 150, 5)).toBeNaN();
    const y = yearlyReturns([100, 110, 121]);
    expect(y.returns.map((r) => +r.toFixed(10))).toEqual([0.1, 0.1]);
    expect(y.arithmeticMean).toBeCloseTo(0.1, 12);
    expect(y.geometric).toBeCloseTo(0.1, 12);
    // +50% then -50% averages 0% but loses 25% overall
    const v = yearlyReturns([100, 150, 75]);
    expect(v.arithmeticMean).toBeCloseTo(0, 12);
    expect(v.geometric).toBeCloseTo(Math.sqrt(0.75) - 1, 12);
    expect(yearlyReturns([0, 10]).arithmeticMean).toBeNaN();
    expect(yearlyReturns([100]).geometric).toBeNaN();
  });
  it('ROI: 1,000 + 50 costs, back 1,500 + 100 income over 2 years', () => {
    const r = computeRoi({ invested: 1000, returned: 1500, costs: 50, income: 100, years: 2 })!;
    expect(r.totalCost).toBe(1050);
    expect(r.netGain).toBe(550);
    expect(r.roi).toBeCloseTo(550 / 1050, 12);
    expect(r.annualized).toBeCloseTo(Math.sqrt(1600 / 1050) - 1, 12);
  });
  it('ROI: total loss annualizes to -100%; no holding period leaves the annual figure NaN by design', () => {
    expect(computeRoi({ invested: 1000, returned: 0, years: 3 })!.annualized).toBe(-1);
    expect(computeRoi({ invested: 1000, returned: 1100, years: 0 })!.annualized).toBeNaN();
  });
  it('ROI rejects zero cost, negatives and non-numbers rather than returning NaN', () => {
    expect(computeRoi({ invested: 0, returned: 1, years: 1 })).toBeNull();
    expect(computeRoi({ invested: 100, returned: -1, years: 1 })).toBeNull();
    expect(computeRoi({ invested: 100, returned: 1, costs: -1, years: 1 })).toBeNull();
    expect(computeRoi({ invested: 100, returned: 1, income: -1, years: 1 })).toBeNull();
    expect(computeRoi({ invested: 100, returned: NaN, years: 1 })).toBeNull();
    expect(computeRoi({ invested: 100, returned: 120, income: NaN, years: 1 })).toBeNull();
  });
});

const tvm = (o: Partial<TvmInput> = {}): TvmInput => ({
  annualRatePct: 5, compounding: 1, years: 10, paymentsPerYear: 1, payment: 0, timing: 'end', ...o,
});

describe('invest-a: present and future value', () => {
  it('1,000 at 5% for 10 years grows to 1,628.89', () => {
    expect(cents(futureValue(1000, tvm()).total)).toBe(1628.89);
    expect(cents(presentValue(1628.89, tvm()).total)).toBe(1000);
  });
  it('100 a month at 6% for 10 years: 16,387.93 ordinary, 16,469.87 due', () => {
    const t = tvm({ annualRatePct: 6, compounding: 12, paymentsPerYear: 12, payment: 100 });
    expect(cents(futureValue(0, t).total)).toBe(16387.93);
    expect(cents(futureValue(0, { ...t, timing: 'start' }).total)).toBe(16469.87);
    // PV of 360 payments of 599.55 at 6% is the 100,000 loan
    expect(Math.round(presentValue(0, { ...t, years: 30, payment: 599.55 }).total)).toBe(100000);
  });
  it('0% and 0 years', () => {
    expect(futureValue(1000, tvm({ annualRatePct: 0, payment: 10 })).total).toBe(1100);
    expect(futureValue(1000, tvm({ years: 0 })).total).toBe(1000);
  });
  it('perpetuity: 100 / 5% = 2,000; due adds one payment; 0% has no finite value', () => {
    expect(perpetuityPv(100, 0.05, 'end')).toBe(2000);
    expect(perpetuityPv(100, 0.05, 'start')).toBe(2100);
    expect(perpetuityPv(100, 0, 'end')).toBe(Infinity);
  });
});

describe('invest-a: NPV, IRR, MIRR, payback', () => {
  it('NPV at the IRR is 0; rate of -100% is undefined', () => {
    expect(npv(0.1, [-100, 110])).toBeCloseTo(0, 12);
    expect(npv(0, [-100, 30, 80])).toBe(10);
    expect(npv(-1, [-100, 110])).toBeNaN();
    expect(npv(0.1, [])).toBe(0);
  });
  it('signChanges skips zeros', () => {
    expect(signChanges([-1, 0, 2, -3])).toBe(2);
    expect(signChanges([0, 0])).toBe(0);
    expect(signChanges([1, 2])).toBe(0);
  });
  it('Excel IRR example: -70,000 then 12k 15k 18k 21k -> -2.1%; adding 26k -> 8.66%', () => {
    const four = irrAll([-70000, 12000, 15000, 18000, 21000]);
    expect(four.rates.length).toBe(1);
    expect(four.rates[0]).toBeCloseTo(-0.021245, 5);
    expect(irrAll([-70000, 12000, 15000, 18000, 21000, 26000]).rates[0]).toBeCloseTo(0.086631, 5);
  });
  it('two IRRs: -100, 230, -132 has roots at 10% and 20% ((1+r) = 1.1 or 1.2)', () => {
    const r = irrAll([-100, 230, -132]);
    expect(r.note).toBe('multiple');
    expect(r.signChanges).toBe(2);
    expect(r.rates[0]).toBeCloseTo(0.1, 8);
    expect(r.rates[1]).toBeCloseTo(0.2, 8);
  });
  it('no sign change, or a sign change with no root', () => {
    expect(irrAll([100, 200])).toEqual({ rates: [], signChanges: 0, note: 'no-sign-change' });
    // -100 + 50v - 100v^2 < 0 for every v > 0
    expect(irrAll([-100, 50, -100]).note).toBe('no-root');
  });
  it('Excel MIRR example: -120,000, 39k 30k 21k 37k 46k at 10% finance / 12% reinvest = 12.61%', () => {
    expect(mirr([-120000, 39000, 30000, 21000, 37000, 46000], 0.1, 0.12)).toBeCloseTo(0.126094, 5);
    expect(mirr([-100], 0.1, 0.1)).toBeNaN();
    expect(mirr([100, 100], 0.1, 0.1)).toBeNaN();
    expect(mirr([-100, -100], 0.1, 0.1)).toBeNaN();
  });
  it('payback: -1000, 300, 400, 500 pays back at 2 + 300/500 = 2.6 periods', () => {
    expect(paybackPeriod([-1000, 300, 400, 500])).toBeCloseTo(2.6, 12);
    expect(paybackPeriod([-1000, 1000])).toBe(1);
    expect(paybackPeriod([0, 100])).toBe(0);
    expect(paybackPeriod([-1000, 100])).toBeNull();
    expect(paybackPeriod([])).toBeNull();
    // discounted payback is later than simple payback
    // at 5%: 285.71 + 362.81 + 431.92 = 1,080.44 -> pays back in year 3, later than 2.6
    expect(paybackPeriod([-1000, 300, 400, 500], 0.05)!).toBeGreaterThan(2.6);
    // at 10%: 272.73 + 330.58 + 375.66 = 978.96 < 1,000 -> never
    expect(paybackPeriod([-1000, 300, 400, 500], 0.1)).toBeNull();
  });
  it('profitability index: PV of later flows / outlay', () => {
    expect(profitabilityIndex(0.1, [-1000, 1100])).toBeCloseTo(1, 12);
    expect(profitabilityIndex(0.1, [1000, 1100])).toBeNaN();
    expect(profitabilityIndex(0.1, [-1000])).toBeNaN();
  });
  it('parseCashFlows handles parentheses negatives, thousands separators, Unicode minus and junk', () => {
    expect(parseCashFlows('(1,000)\n2,000; 3000, 4000').flows).toEqual([-1000, 2000, 3000, 4000]);
    expect(parseCashFlows('-1000,300,400').flows).toEqual([-1000, 300, 400]);
    expect(parseCashFlows('−500\t$1,234.50').flows).toEqual([-500, 1234.5]);
    const bad = parseCashFlows('100\nabc\n\n200');
    expect(bad.flows).toEqual([100, 200]);
    expect(bad.errors).toEqual(['Entry 2 ("abc") is not a number']);
    expect(parseCashFlows('   ')).toEqual({ flows: [], errors: [] });
  });
});

const k401 = (o: Partial<FourOhOneKInput> = {}): FourOhOneKInput => ({
  currentAge: 40, retirementAge: 41, currentBalance: 0, salary: 100000, salaryGrowth: 0, contributionPct: 10, match: [],
  annualReturn: 0, limits: LIMITS_2026, enforceLimit: true, useCatchUp: true, limitGrowth: 0, ...o,
});

describe('invest-b: limits and match', () => {
  it('round handles halves and negatives', () => {
    expect(round(1.005)).toBe(1.01);
    expect(round(-1.005)).toBe(-1.01);
    expect(round(2.5, 0)).toBe(3);
  });
  it('catch-up by age (SECURE 2.0): 49 none, 50-59 8,000, 60-63 11,250, 64 back to 8,000', () => {
    expect(catchUpForAge(49, LIMITS_2026)).toBe(0);
    expect(catchUpForAge(50, LIMITS_2026)).toBe(8000);
    expect(catchUpForAge(59, LIMITS_2026)).toBe(8000);
    expect(catchUpForAge(60, LIMITS_2026)).toBe(11250);
    expect(catchUpForAge(63, LIMITS_2026)).toBe(11250);
    expect(catchUpForAge(64, LIMITS_2026)).toBe(8000);
    expect(iraLimitForAge(49)).toBe(7500);
    expect(iraLimitForAge(50)).toBe(8600);
  });
  it('indexLimit rounds down to $500 (24,500 x 1.03 = 25,235 -> 25,000)', () => {
    expect(indexLimit(24500, 3, 1)).toBe(25000);
    expect(indexLimit(24500, 0, 5)).toBe(24500);
    expect(indexLimit(24500, 3, 0)).toBe(24500);
    expect(indexLimit(24500, NaN, 3)).toBe(24500);
  });
  it('match tiers: "100:3,50:2" -> 4% match at a 5% deferral; junk parts skipped', () => {
    const t = parseMatchTiers('100:3, 50:2, bad, 0:5, 5, 50:-1');
    expect(t).toEqual([{ rate: 100, upTo: 3 }, { rate: 50, upTo: 2 }]);
    expect(formatMatchTiers(t)).toBe('100:3,50:2');
    expect(matchPercentOfPay(5, t)).toBe(4);
    expect(matchPercentOfPay(10, t)).toBe(4);
    expect(matchPercentOfPay(2, t)).toBe(2);
    expect(matchPercentOfPay(-5, t)).toBe(0);
    expect(fullMatchDeferralPct(t)).toBe(5);
    expect(parseMatchTiers('')).toEqual([]);
  });
});

describe('invest-b: project401k', () => {
  it('one year, 0% return: 10% of 100,000 = 10,000', () => {
    const r = project401k(k401());
    expect(r.years).toBe(1);
    expect(r.finalBalance).toBe(10000);
    expect(r.rows[0]).toMatchObject({ year: 2026, age: 41, employee: 10000, employer: 0, growth: 0, limit: 24500, capped: false });
  });
  it('7% a year with month-end deposits: 1,000 x ((1.07 - 1) / i) where i = 1.07^(1/12) - 1', () => {
    const i = Math.pow(1.07, 1 / 12) - 1;
    const r = project401k(k401({ contributionPct: 12, annualReturn: 7 }));
    expect(r.finalBalance).toBeCloseTo(1000 * (0.07 / i), 6);
    expect(r.totalGrowth).toBeCloseTo(r.finalBalance - 12000, 6);
  });
  it('deferral capped at 24,500 under 50; 60-year-old gets 24,500 + 11,250', () => {
    const young = project401k(k401({ contributionPct: 30 }));
    expect(young.rows[0].employee).toBe(24500);
    expect(young.rows[0].capped).toBe(true);
    const sixty = project401k(k401({ currentAge: 59, retirementAge: 60, salary: 200000, contributionPct: 30 }));
    expect(sixty.rows[0].age).toBe(60);
    expect(sixty.rows[0].employee).toBe(35750);
    const noCatch = project401k(k401({ currentAge: 59, retirementAge: 60, salary: 200000, contributionPct: 30, useCatchUp: false }));
    expect(noCatch.rows[0].employee).toBe(24500);
    const unlimited = project401k(k401({ contributionPct: 30, enforceLimit: false }));
    expect(unlimited.rows[0].employee).toBe(30000);
    expect(unlimited.rows[0].limit).toBeNull();
  });
  it('415(c): employer money is cut so deferral + employer stays within 72,000', () => {
    const r = project401k(k401({ salary: 300000, contributionPct: 30, match: [{ rate: 300, upTo: 30 }] }));
    // actual deferral 24,500 = 8.1667% of pay -> 300% match = 73,500, capped at 72,000 - 24,500
    expect(r.rows[0].employer).toBe(47500);
  });
  it('401(a)(17): the match is figured on pay up to 360,000', () => {
    const r = project401k(k401({ salary: 500000, contributionPct: 4.9, match: [{ rate: 100, upTo: 6 }] }));
    expect(r.rows[0].employee).toBeCloseTo(24500, 9);
    expect(r.rows[0].employer).toBeCloseTo(360000 * 0.049, 6);
  });
  it('limits indexed from a later start year; salary growth; inflation-adjusted balance', () => {
    const r = project401k(k401({ startYear: 2027, limitGrowth: 3, contributionPct: 50, salaryGrowth: 10, retirementAge: 42, inflation: 3 }));
    expect(r.rows[0].limit).toBe(25000);
    expect(r.rows[1].salary).toBeCloseTo(110000, 6);
    expect(r.finalBalanceReal).toBeCloseTo(r.finalBalance / 1.03 ** 2, 6);
  });
  it('rejects bad horizons and amounts with a message', () => {
    expect(project401k(k401({ retirementAge: 40 })).error).toBeDefined();
    expect(project401k(k401({ currentAge: -1 })).error).toBeDefined();
    expect(project401k(k401({ retirementAge: 121 })).error).toMatch(/80 years/);
    expect(project401k(k401({ salary: -1 })).error).toBeDefined();
    expect(project401k(k401({ contributionPct: 101 })).error).toBeDefined();
    expect(project401k(k401({ annualReturn: -100 })).error).toBeDefined();
  });
  it('non-numeric fields give an error, never a NaN balance', () => {
    for (const bad of [{ salary: NaN }, { contributionPct: NaN }, { currentBalance: NaN }, { annualReturn: NaN }, { salaryGrowth: NaN }]) {
      const r = project401k(k401({ ...bad, retirementAge: 42 }));
      expect(r.error).toBeDefined();
      expect(Number.isNaN(r.finalBalance)).toBe(false);
    }
  });
});

const roth = (o: Partial<RothCompareInput> = {}): RothCompareInput => ({
  annualContribution: 1000, years: 1, annualReturn: 10, currentTaxRate: 25, retirementTaxRate: 25,
  capitalGainsRate: 15, dividendYield: 0, investTaxSavings: false, ...o,
});

describe('invest-b: Roth vs traditional vs taxable', () => {
  it('one year at 10%: Roth 1,100; traditional after 25% tax 825; taxable 1,100 - 15% of 100 = 1,085', () => {
    const r = compareRothTraditional(roth());
    expect(r.roth).toBeCloseTo(1100, 9);
    expect(r.traditionalAfterTax).toBeCloseTo(825, 9);
    expect(r.taxable).toBeCloseTo(1085, 9);
    expect(r.rows[0].taxable).toBeCloseTo(1085, 9);
  });
  it('a 2% dividend is taxed yearly but the total tax is the same after one year', () => {
    // dividend 20 taxed 3 -> 1,097 with basis 1,017; gain 80 taxed 12 -> 1,085
    const r = compareRothTraditional(roth({ dividendYield: 2 }));
    expect(r.taxable).toBeCloseTo(1085, 9);
    expect(r.taxableTaxPaid).toBeCloseTo(15, 9);
  });
  it('investing the deduction: 250 grows to 275, 15% on the 25 gain -> 271.25 extra', () => {
    const r = compareRothTraditional(roth({ investTaxSavings: true }));
    expect(r.taxSavingsValue).toBeCloseTo(271.25, 9);
    expect(r.traditionalAfterTax).toBeCloseTo(1096.25, 9);
  });
  it('growTaxable caps the dividend at the return and handles a loss', () => {
    const g = growTaxable([1000], 2, 5, 20);
    // dividend capped at 2% -> 20 taxed 4; value 1,016; no unrealised gain left
    expect(g.final).toBeCloseTo(1016, 9);
    const loss = growTaxable([1000], -10, 2, 20);
    expect(loss.final).toBeCloseTo(900, 9);
    expect(loss.taxPaid).toBe(0);
    expect(growTaxable([], 10, 0, 15, true, 500).final).toBe(500);
  });
  it('rejects bad input with a message', () => {
    expect(compareRothTraditional(roth({ years: 0 })).error).toBeDefined();
    expect(compareRothTraditional(roth({ years: 81 })).error).toBeDefined();
    expect(compareRothTraditional(roth({ annualContribution: -1 })).error).toBeDefined();
    expect(compareRothTraditional(roth({ currentBalance: -1 })).error).toBeDefined();
    expect(compareRothTraditional(roth({ retirementTaxRate: 100 })).error).toBeDefined();
    expect(compareRothTraditional(roth({ capitalGainsRate: NaN })).error).toBeDefined();
    expect(compareRothTraditional(roth({ annualReturn: -100 })).error).toBeDefined();
  });
  it('non-numeric contribution, return or dividend yield gives an error, not NaN', () => {
    for (const bad of [{ annualContribution: NaN }, { annualReturn: NaN }, { dividendYield: NaN }]) {
      const r = compareRothTraditional(roth(bad));
      expect(r.error).toBeDefined();
      expect(Number.isNaN(r.taxable)).toBe(false);
    }
  });
});

describe('invest-b: APY, Reg DD and CDs', () => {
  it('5% APR: 5.1162% APY monthly, 5.1271% continuous; inverses', () => {
    expect(aprToApy(5, 12)).toBeCloseTo(5.116190, 5);
    expect(aprToApy(5, 0)).toBeCloseTo(5.127110, 5);
    expect(apyToApr(5.116190, 12)).toBeCloseTo(5, 5);
    expect(apyToApr(5.127110, 0)).toBeCloseTo(5, 5);
    expect(apyToApr(-100, 12)).toBeNaN();
  });
  it('Regulation DD Appendix A: 1,000 earning 61.68 in 365 days = 6.17%; 30.37 in 182 days = 6.18%', () => {
    expect(regDdApy(1000, 61.68, 365)).toBeCloseTo(6.168, 3);
    expect(+regDdApy(1000, 30.37, 182).toFixed(2)).toBe(6.18);
    expect(regDdApy(0, 10, 365)).toBeNaN();
    expect(regDdApy(1000, 10, 0)).toBeNaN();
  });
  it('growAtApr annual and continuous', () => {
    expect(growAtApr(1000, 5, 1, 12)).toBeCloseTo(1050, 9);
    expect(growAtApr(1000, 5, 0, 12)).toBeCloseTo(1000 * Math.E ** 0.05, 9);
  });
  const cd = (o: Partial<CdInput> = {}): CdInput => ({ deposit: 10000, rate: 5, rateType: 'apy', compounding: 12, termMonths: 12, penaltyMonths: 3, ...o });
  it('12-month CD at 5% APY matures at exactly 10,500; 3-month penalty on the APR', () => {
    const r = computeCd(cd({ withdrawMonth: 6 }));
    expect(r.maturity).toBeCloseTo(10500, 6);
    const apr = 12 * (Math.pow(1.05, 1 / 12) - 1) * 100;
    expect(r.apr).toBeCloseTo(apr, 9);
    expect(r.penalty).toBeCloseTo((10000 * apr) / 100 / 4, 9);
    expect(r.earlyValue!).toBeCloseTo(10000 * Math.sqrt(1.05) - r.penalty, 6);
    expect(r.schedule.length).toBe(12);
  });
  it('schedule steps: 36 months by quarter, 61 months by year with the odd last month', () => {
    expect(computeCd(cd({ termMonths: 36 })).schedule.length).toBe(12);
    expect(computeCd(cd({ termMonths: 61 })).schedule.map((s) => s.month)).toEqual([12, 24, 36, 48, 60, 61]);
  });
  it('withdraw month outside the term gives no early value', () => {
    expect(computeCd(cd({ withdrawMonth: 12 })).earlyValue).toBeNull();
    expect(computeCd(cd({ withdrawMonth: 0 })).earlyValue).toBeNull();
  });
  it('rejects bad input; a non-numeric penalty is treated as no penalty rather than NaN', () => {
    expect(computeCd(cd({ deposit: -1 })).error).toBeDefined();
    expect(computeCd(cd({ termMonths: 0 })).error).toBeDefined();
    expect(computeCd(cd({ termMonths: 601 })).error).toBeDefined();
    expect(computeCd(cd({ rate: -100 })).error).toBeDefined();
    expect(computeCd(cd({ rate: NaN })).error).toBeDefined();
    expect(computeCd(cd({ penaltyMonths: -2 })).penalty).toBe(0);
    expect(computeCd(cd({ penaltyMonths: NaN })).penalty).toBe(0);
  });
});

const sip = (o: Partial<SipInput> = {}): SipInput => ({ monthly: 1000, annualReturn: 12, years: 1, stepUp: 0, convention: 'nominal', ...o });

describe('invest-b: SIP and lump sum', () => {
  it('1,000 a month for a year at 12% (1% a month, start of month) = 12,809.33', () => {
    const r = computeSip(sip());
    expect(cents(r.value)).toBe(12809.33);
    expect(r.invested).toBe(12000);
    expect(cents(sipFutureValue(1000, 0.01, 12))).toBe(12809.33);
  });
  it('end-of-month instalments and the effective-rate convention', () => {
    expect(cents(computeSip(sip({ timing: 'end' })).value)).toBe(12682.5);
    const i = sipMonthlyRate(12, 'effective');
    expect(i).toBeCloseTo(Math.pow(1.12, 1 / 12) - 1, 12);
    expect(computeSip(sip({ convention: 'effective' })).value).toBeCloseTo(sipFutureValue(1000, i, 12), 6);
  });
  it('10% step-up: year 2 instalment is 1,100 -> 25,200 invested; partial last year gets a row', () => {
    const r = computeSip(sip({ years: 2, stepUp: 10 }));
    expect(r.invested).toBeCloseTo(25200, 9);
    expect(r.rows[1].monthly).toBeCloseTo(1100, 9);
    expect(computeSip(sip({ years: 1.5 })).rows.map((x) => x.year)).toEqual([1, 2]);
  });
  it('0% return and sipForTarget', () => {
    expect(sipFutureValue(1000, 0, 12)).toBe(12000);
    expect(sipFutureValue(1000, 0.01, 12, false)).toBeCloseTo(12682.5, 2);
    expect(sipForTarget(12809.33, 0.01, 12)).toBeCloseTo(1000, 2);
    expect(sipForTarget(1000, 0.01, 0)).toBeNaN();
  });
  it('SIP rejects bad input, including a non-numeric step-up', () => {
    expect(computeSip(sip({ monthly: -1 })).error).toBeDefined();
    expect(computeSip(sip({ years: 0.04 })).error).toBeDefined();
    expect(computeSip(sip({ years: 101 })).error).toBeDefined();
    expect(computeSip(sip({ annualReturn: -100 })).error).toBeDefined();
    const r = computeSip(sip({ years: 2, stepUp: NaN }));
    expect(r.error).toBeDefined();
    expect(Number.isNaN(r.value)).toBe(false);
  });
  it('lump sum: 100,000 at 10% for 2.5 years = 100,000 x 1.1^2.5 = 126,905.9', () => {
    const r = computeLumpSum(100000, 10, 2.5);
    expect(r.value).toBeCloseTo(126905.9, 0);
    expect(r.rows.map((x) => x.year)).toEqual([1, 2, 3]);
    expect(r.rows[2].value).toBeCloseTo(r.value, 9);
    expect(computeLumpSum(-1, 10, 1).error).toBeDefined();
    expect(computeLumpSum(1, 10, 0).error).toBeDefined();
    expect(computeLumpSum(1, -100, 1).error).toBeDefined();
  });
});

const ann = (o: Partial<AnnuityInput> = {}): AnnuityInput => ({ annualRate: 6, years: 10, paymentsPerYear: 12, timing: 'ordinary', growth: 0, ...o });

describe('invest-b: annuities', () => {
  it('100,000 over 10 years at 6%/12: 1,110.21 ordinary, 1,110.205 / 1.005 = 1,104.68 due', () => {
    expect(cents(annuityPayout(100000, ann()))).toBe(1110.21);
    expect(cents(annuityPayout(100000, ann({ timing: 'due' })))).toBe(1104.68);
    expect(cents(levelPayment(100000, 0.005, 120))).toBe(1110.21);
    expect(cents(levelPayment(100000, 0.005, 120, true))).toBe(1104.68);
    expect(levelPayment(1200, 0, 12)).toBe(100);
    expect(levelPayment(1200, 0.01, 0)).toBeNaN();
  });
  it('drawdown schedule ends at zero with 10 yearly rows', () => {
    const pay = annuityPayout(100000, ann());
    const rows = annuitySchedule(100000, pay, ann());
    expect(rows.length).toBe(10);
    expect(rows.at(-1)!.endBalance).toBe(0);
    const due = annuitySchedule(100000, annuityPayout(100000, ann({ timing: 'due' })), ann({ timing: 'due' }));
    expect(due.at(-1)!.endBalance).toBe(0);
  });
  it('growing annuity matches the closed form P/(r-g) x (1 - ((1+g)/(1+r))^n)', () => {
    const f = annuityPvFactor(ann({ annualRate: 5, growth: 2, paymentsPerYear: 1 }));
    expect(f).toBeCloseTo((1 / 0.03) * (1 - Math.pow(1.02 / 1.05, 10)), 9);
  });
  it('lump sum needed with a remaining balance: + 10,000 x 1.005^-120', () => {
    expect(annuityDiscount(ann())).toBeCloseTo(Math.pow(1.005, -120), 12);
    expect(annuityLumpSumNeeded(1110.205, ann(), 10000)).toBeCloseTo(100000 + 10000 * Math.pow(1.005, -120), 0);
    expect(annuityPayout(100000, ann({ years: 0 }))).toBeNaN();
  });
  it('accumulation: 100 a month at 6% for 10 years = 16,387.93 (16,469.87 due)', () => {
    expect(cents(annuityFutureValue(0, 100, ann()))).toBe(16387.93);
    expect(cents(annuityFutureValue(0, 100, ann({ timing: 'due' })))).toBe(16469.87);
    expect(annuityFutureValue(500, 0, ann({ annualRate: 0 }))).toBe(500);
  });
});

describe('invest-b: bonds', () => {
  const bond = { face: 1000, couponRate: 5, years: 5, frequency: 2 };
  it('5-year 5% semi-annual bond at a 6% yield prices at 957.35', () => {
    const p = bondPriceFromYield(bond, 6);
    expect(cents(p.clean)).toBe(957.35);
    expect(p.accrued).toBe(0);
    expect(p.coupons).toBe(10);
    expect(bondYieldFromPrice(bond, 957.35)).toBeCloseTo(6, 3);
  });
  it('at a yield equal to the coupon the bond prices at par', () => {
    expect(bondPriceFromYield(bond, 5).clean).toBeCloseTo(1000, 9);
  });
  it('textbook duration: 3-year 10% annual bond at 10% has Macaulay 2.7355, modified 2.4869', () => {
    const p = bondPriceFromYield({ face: 1000, couponRate: 10, years: 3, frequency: 1 }, 10);
    expect(p.macaulay).toBeCloseTo(2.7355, 4);
    expect(p.modified).toBeCloseTo(2.4869, 4);
    expect(p.convexity).toBeGreaterThan(0);
  });
  it('2.25 years semi-annual: 5 coupons, half a period accrued (12.50)', () => {
    expect(bondPeriods(2.25, 2)).toEqual({ n: 5, w: 0.5 });
    expect(bondPeriods(0, 2)).toEqual({ n: 1, w: 1e-9 });
    const p = bondPriceFromYield({ ...bond, years: 2.25 }, 5);
    expect(p.accrued).toBe(12.5);
    expect(p.dirty - p.clean).toBeCloseTo(12.5, 12);
  });
  it('zero-coupon bond yields and call redemption', () => {
    // 1000 in 10 years at 4% semi-annual = 1000 / 1.02^20
    const z = bondPriceFromYield({ face: 1000, couponRate: 0, years: 10, frequency: 2 }, 4);
    expect(z.clean).toBeCloseTo(1000 / Math.pow(1.02, 20), 9);
    expect(bondYieldFromPrice({ face: 1000, couponRate: 0, years: 10, frequency: 2 }, z.clean)).toBeCloseTo(4, 6);
    const call = bondPriceFromYield({ ...bond, redemption: 1020 }, 5);
    expect(call.clean).toBeGreaterThan(1000);
    expect(bondYieldFromPrice(bond, 957.35, 'dirty')).toBeCloseTo(6, 3);
  });
  it('bad prices give NaN, current yield', () => {
    expect(bondYieldFromPrice(bond, 0)).toBeNaN();
    expect(bondYieldFromPrice(bond, -5)).toBeNaN();
    expect(currentYield(bond, 950)).toBeCloseTo(5.2632, 4);
    expect(currentYield(bond, 0)).toBeNaN();
  });
});

describe('invest-b: currency helpers (no network)', () => {
  it('builds URLs, de-duplicating symbols and dropping the base', () => {
    expect(latestRatesUrl('eur', ['usd', 'USD', 'gbp', 'EUR', 'xx'])).toBe('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD%2CGBP');
    expect(latestRatesUrl('USD', [])).toBe('https://api.frankfurter.dev/v1/latest?base=USD');
    expect(() => latestRatesUrl('EURO', [])).toThrow(/Invalid currency code/);
    expect(seriesUrl('usd', 'eur', new Date(Date.UTC(2026, 0, 31)), 30)).toBe('https://api.frankfurter.dev/v1/2026-01-01..2026-01-31?base=USD&symbols=EUR');
  });
  it('parseLatest keeps valid positive rates and adds the base at 1', () => {
    const t = parseLatest({ base: 'EUR', date: '2026-01-02', rates: { USD: 1.1, GBP: 0.85, BAD: -1, xx: 2, JPY: 'x' } });
    expect(t.rates).toEqual({ USD: 1.1, GBP: 0.85, EUR: 1 });
    expect(() => parseLatest(null)).toThrow();
    expect(() => parseLatest({ base: 'EUR', date: '2026-01-02' })).toThrow();
  });
  it('parseSeries sorts by date and drops missing points', () => {
    const s = parseSeries({ rates: { '2026-01-03': { USD: 1.2 }, '2026-01-01': { USD: 1.1 }, '2026-01-02': { GBP: 0.8 } } }, 'USD');
    expect(s).toEqual([{ date: '2026-01-01', rate: 1.1 }, { date: '2026-01-03', rate: 1.2 }]);
    expect(parseSeries(null, 'USD')).toEqual([]);
  });
  it('cross rate through the base: GBP -> USD = 1.1 / 0.85', () => {
    const t = parseLatest({ base: 'EUR', date: 'd', rates: { USD: 1.1, GBP: 0.85 } });
    expect(crossRate(t, 'GBP', 'USD')).toBeCloseTo(1.1 / 0.85, 12);
    expect(crossRate(t, 'EUR', 'USD')).toBe(1.1);
    expect(crossRate(t, 'USD', 'EUR')).toBeCloseTo(1 / 1.1, 12);
    expect(crossRate(t, 'CHF', 'USD')).toBeNaN();
    expect(convertAmount(100, 1.1)).toBeCloseTo(110, 12);
    expect(currencyDecimals('JPY')).toBe(0);
    expect(currencyDecimals('KRW')).toBe(0);
    expect(currencyDecimals('USD')).toBe(2);
  });
});

describe('invest-b: tiny positive rates (boundary fuzzer regression)', () => {
  it('sipFutureValue tends to monthly x months (was 0 when (1 + r)^n rounded to 1)', () => {
    expect(sipFutureValue(1000, 1e-300, 12)).toBeCloseTo(12000, 9);
    expect(sipFutureValue(1000, 1e-300, 12, false)).toBeCloseTo(12000, 9);
    expect(sipForTarget(12000, 1e-300, 12)).toBeCloseTo(1000, 9);
  });
  it('levelPayment tends to pv / n (was Infinity)', () => {
    expect(levelPayment(12000, 1e-300, 12)).toBeCloseTo(1000, 9);
    expect(levelPayment(12000, 1e-300, 12, true)).toBeCloseTo(1000, 9);
  });
});
