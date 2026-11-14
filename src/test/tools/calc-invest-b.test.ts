import { describe, expect, it } from 'vitest';
import {
  LIMITS_2026, catchUpForAge, indexLimit, parseMatchTiers, matchPercentOfPay, fullMatchDeferralPct, project401k,
  compareRothTraditional, growTaxable, iraLimitForAge,
  aprToApy, apyToApr, regDdApy, growAtApr, computeCd,
  sipMonthlyRate, computeSip, sipFutureValue, computeLumpSum, sipForTarget,
  annuityPvFactor, annuityPayout, annuityLumpSumNeeded, annuitySchedule, levelPayment, annuityFutureValue,
  bondPriceFromYield, bondYieldFromPrice, currentYield, bondPeriods,
  latestRatesUrl, seriesUrl, parseLatest, parseSeries, crossRate, currencyDecimals,
  type FourOhOneKInput, type AnnuityInput,
} from '@/lib/tools/calculators/invest-b';

// ---------------------------------------------------------------------------
// 401(k)
// ---------------------------------------------------------------------------

describe('2026 IRS limits (IR-2025-111, Notice 2025-67)', () => {
  it('match the published values', () => {
    expect(LIMITS_2026).toMatchObject({
      year: 2026, deferral: 24500, catchUp50: 8000, catchUp6063: 11250, annualAdditions: 72000,
      compensation: 360000, ira: 7500, iraCatchUp: 1100, rothCatchUpWageThreshold: 150000,
    });
  });
  it('uses the super catch-up only at ages 60 to 63', () => {
    expect([49, 50, 59, 60, 63, 64, 70].map((a) => catchUpForAge(a, LIMITS_2026))).toEqual([0, 8000, 8000, 11250, 11250, 8000, 8000]);
  });
  it('IRA limit adds the catch-up at 50', () => {
    expect(iraLimitForAge(49)).toBe(7500);
    expect(iraLimitForAge(50)).toBe(8600);
  });
  it('indexes limits down to a $500 multiple', () => {
    expect(indexLimit(24500, 0, 5)).toBe(24500);
    expect(indexLimit(24500, 2.5, 1)).toBe(25000); // 25,112.50 -> 25,000
    expect(indexLimit(24500, 3, 2)).toBe(25500); // 25,992.05 -> 25,500
  });
});

describe('employer match formulas', () => {
  it('parses single and tiered formulas', () => {
    expect(parseMatchTiers('50:6')).toEqual([{ rate: 50, upTo: 6 }]);
    expect(parseMatchTiers('100:3, 50:2')).toEqual([{ rate: 100, upTo: 3 }, { rate: 50, upTo: 2 }]);
    expect(parseMatchTiers('junk,0:5,50:x')).toEqual([]);
  });
  it('50% up to 6%', () => {
    const t = parseMatchTiers('50:6');
    expect(matchPercentOfPay(4, t)).toBe(2);
    expect(matchPercentOfPay(6, t)).toBe(3);
    expect(matchPercentOfPay(10, t)).toBe(3);
    expect(fullMatchDeferralPct(t)).toBe(6);
  });
  it('safe harbor basic match: 100% of 3% plus 50% of the next 2% = 4% at 5%', () => {
    const t = parseMatchTiers('100:3,50:2');
    expect(matchPercentOfPay(2, t)).toBe(2);
    expect(matchPercentOfPay(4, t)).toBe(3.5);
    expect(matchPercentOfPay(5, t)).toBe(4);
    expect(matchPercentOfPay(8, t)).toBe(4);
  });
});

const base401k: FourOhOneKInput = {
  currentAge: 30, retirementAge: 31, currentBalance: 0, salary: 100000, salaryGrowth: 0, contributionPct: 10,
  match: parseMatchTiers('50:6'), annualReturn: 0, limits: LIMITS_2026, enforceLimit: true, useCatchUp: true, limitGrowth: 0,
};

describe('project401k', () => {
  it('one year at 0% return is just contributions', () => {
    const r = project401k(base401k);
    expect(r.rows).toHaveLength(1);
    expect(r.totalEmployee).toBe(10000);
    expect(r.totalEmployer).toBe(3000);
    expect(r.finalBalance).toBeCloseTo(13000, 6);
    expect(r.rows[0].capped).toBe(false);
  });
  it('a balance with no contributions grows by exactly the annual return', () => {
    const r = project401k({ ...base401k, currentBalance: 10000, contributionPct: 0, annualReturn: 7 });
    expect(r.finalBalance).toBeCloseTo(10700, 6);
    expect(r.totalEmployer).toBe(0);
  });
  it('caps deferrals at $24,500 under 50 and recalculates the match on what was deferred', () => {
    const r = project401k({ ...base401k, salary: 200000, contributionPct: 20 });
    expect(r.rows[0].employee).toBe(24500);
    expect(r.rows[0].capped).toBe(true);
    // deferred 12.25% of pay, match is 50% of the first 6% = 3% of 200,000
    expect(r.rows[0].employer).toBe(6000);
  });
  it('adds $8,000 catch-up at 50 and $11,250 at 60 to 63', () => {
    const at50 = project401k({ ...base401k, currentAge: 49, retirementAge: 50, salary: 300000, contributionPct: 50 });
    expect(at50.rows[0].age).toBe(50);
    expect(at50.rows[0].employee).toBe(32500);
    const at61 = project401k({ ...base401k, currentAge: 60, retirementAge: 61, salary: 300000, contributionPct: 50 });
    expect(at61.rows[0].employee).toBe(35750);
    const at64 = project401k({ ...base401k, currentAge: 63, retirementAge: 64, salary: 300000, contributionPct: 50 });
    expect(at64.rows[0].employee).toBe(32500);
    const noCatchUp = project401k({ ...base401k, currentAge: 60, retirementAge: 61, salary: 300000, contributionPct: 50, useCatchUp: false });
    expect(noCatchUp.rows[0].employee).toBe(24500);
  });
  it('limits employer money with the 415(c) $72,000 annual additions cap', () => {
    const r = project401k({ ...base401k, salary: 300000, contributionPct: 30, match: parseMatchTiers('300:10') });
    expect(r.rows[0].employee).toBe(24500);
    expect(r.rows[0].employer).toBe(72000 - 24500);
  });
  it('applies the match to pay only up to the $360,000 compensation limit', () => {
    const r = project401k({ ...base401k, salary: 500000, contributionPct: 4, match: parseMatchTiers('100:4') });
    expect(r.rows[0].employee).toBe(20000);
    // 4% of 500,000 deferred; match 100% of 4% on 360,000 (deferral % is still 4%)
    expect(r.rows[0].employer).toBeCloseTo(14400, 6);
  });
  it('ignores limits when told to', () => {
    const r = project401k({ ...base401k, salary: 300000, contributionPct: 20, enforceLimit: false });
    expect(r.rows[0].employee).toBe(60000);
  });
  it('compounds monthly deposits at the monthly equivalent rate', () => {
    const r = project401k({ ...base401k, contributionPct: 12, match: [], annualReturn: 12 });
    const i = 1.12 ** (1 / 12) - 1;
    expect(r.finalBalance).toBeCloseTo(1000 * ((1 + i) ** 12 - 1) / i, 6);
  });
  it('applies raises after each year and reports real value', () => {
    const r = project401k({ ...base401k, retirementAge: 33, salaryGrowth: 10, inflation: 2 });
    expect(r.rows.map((x) => Math.round(x.salary))).toEqual([100000, 110000, 121000]);
    expect(r.finalBalanceReal).toBeCloseTo(r.finalBalance / 1.02 ** 3, 6);
  });
  it('validates inputs', () => {
    expect(project401k({ ...base401k, retirementAge: 30 }).error).toBeTruthy();
    expect(project401k({ ...base401k, salary: -1 }).error).toBeTruthy();
    expect(project401k({ ...base401k, contributionPct: 120 }).error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Roth vs traditional vs taxable
// ---------------------------------------------------------------------------

describe('compareRothTraditional', () => {
  const base = {
    annualContribution: 7000, years: 30, annualReturn: 7, currentTaxRate: 22, retirementTaxRate: 22,
    capitalGainsRate: 0, dividendYield: 0, investTaxSavings: true,
  };
  const fv = 7000 * ((1.07 ** 30 - 1) / 0.07) * 1.07;

  it('Roth equals the future value of an annuity due', () => {
    expect(compareRothTraditional(base).roth).toBeCloseTo(fv, 4);
  });
  it('equal tax rates and untaxed reinvestment of the deduction make Roth and traditional identical', () => {
    const r = compareRothTraditional(base);
    expect(r.traditionalAfterTax).toBeCloseTo(r.roth, 4);
  });
  it('traditional wins when the retirement rate is lower, Roth when it is higher', () => {
    expect(compareRothTraditional({ ...base, retirementTaxRate: 12 }).traditionalAfterTax).toBeGreaterThan(fv);
    expect(compareRothTraditional({ ...base, retirementTaxRate: 32 }).traditionalAfterTax).toBeLessThan(fv);
  });
  it('without reinvesting the deduction, traditional is FV × (1 − retirement rate)', () => {
    const r = compareRothTraditional({ ...base, investTaxSavings: false });
    expect(r.traditionalAfterTax).toBeCloseTo(fv * 0.78, 4);
    expect(r.traditionalTax).toBeCloseTo(fv * 0.22, 4);
  });
  it('taxable account with no dividends pays gains tax once at the end', () => {
    const r = compareRothTraditional({ ...base, capitalGainsRate: 15 });
    expect(r.taxable).toBeCloseTo(fv - 0.15 * (fv - 210000), 4);
  });
  it('dividends taxed every year create drag (one-year hand check)', () => {
    // 1,000 grows 10%, 2% dividend taxed at 15% = 3 tax; basis 1,000 + 17; gain 80 taxed 12.
    const g = growTaxable([1000], 10, 2, 15);
    expect(g.balances[0]).toBeCloseTo(1097, 9);
    expect(g.basis).toBeCloseTo(1017, 9);
    expect(g.final).toBeCloseTo(1097 - 12, 9);
    expect(g.taxPaid).toBeCloseTo(15, 9);
  });
  it('validates', () => {
    expect(compareRothTraditional({ ...base, years: 0 }).error).toBeTruthy();
    expect(compareRothTraditional({ ...base, currentTaxRate: 100 }).error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// APY / CD
// ---------------------------------------------------------------------------

describe('APR and APY', () => {
  it('converts textbook values', () => {
    expect(aprToApy(5, 12)).toBeCloseTo(5.11619, 4);
    expect(aprToApy(5, 365)).toBeCloseTo(5.12675, 4);
    expect(aprToApy(5, 0)).toBeCloseTo(5.12711, 4); // e^0.05 − 1
    expect(aprToApy(5, 1)).toBeCloseTo(5, 10);
    expect(aprToApy(0, 12)).toBe(0);
  });
  it('round-trips', () => {
    for (const n of [1, 2, 4, 12, 52, 365, 0]) expect(apyToApr(aprToApy(4.35, n), n)).toBeCloseTo(4.35, 9);
    expect(apyToApr(-100, 12)).toBeNaN();
  });
  it('matches Regulation DD Appendix A examples', () => {
    expect(regDdApy(1000, 61.68, 365)).toBeCloseTo(6.17, 2);
    expect(regDdApy(1000, 30.37, 182)).toBeCloseTo(6.18, 2);
    expect(regDdApy(1000, 26.68, 183)).toBeCloseTo(5.39, 2);
    expect(regDdApy(1000, 133.13, 730)).toBeCloseTo(6.45, 2);
  });
  it('computes a CD from an APY quote so a 12-month CD earns exactly the APY', () => {
    const r = computeCd({ deposit: 10000, rate: 4.5, rateType: 'apy', compounding: 365, termMonths: 12, penaltyMonths: 3 });
    expect(r.maturity).toBeCloseTo(10450, 6);
    expect(r.interest).toBeCloseTo(450, 6);
  });
  it('computes a CD from an APR quote with monthly compounding', () => {
    const r = computeCd({ deposit: 10000, rate: 5, rateType: 'apr', compounding: 12, termMonths: 24, penaltyMonths: 6, withdrawMonth: 12 });
    expect(r.maturity).toBeCloseTo(10000 * (1 + 0.05 / 12) ** 24, 6);
    expect(r.penalty).toBeCloseTo(250, 9); // 6 months of 5% simple interest on 10,000
    expect(r.earlyValue).toBeCloseTo(growAtApr(10000, 5, 12, 12) - 250, 6);
    expect(r.schedule.at(-1)?.month).toBe(24);
  });
  it('validates CD inputs', () => {
    expect(computeCd({ deposit: 1000, rate: 4, rateType: 'apr', compounding: 12, termMonths: 0, penaltyMonths: 0 }).error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// SIP
// ---------------------------------------------------------------------------

describe('SIP', () => {
  it('5,000 a month at 12% for 5 years = 4,12,431.83 (annual/12, start of month)', () => {
    const r = computeSip({ monthly: 5000, annualReturn: 12, years: 5, stepUp: 0, convention: 'nominal' });
    expect(r.value).toBeCloseTo(412431.83, 2);
    expect(r.invested).toBe(300000);
    expect(r.rows).toHaveLength(5);
  });
  it('5,000 a month at 12% for 10 years = about 11,61,695', () => {
    expect(computeSip({ monthly: 5000, annualReturn: 12, years: 10, stepUp: 0, convention: 'nominal' }).value).toBeCloseTo(1161695.38, 2);
  });
  it('effective monthly rate (HDFC MF / Groww convention): 1,000 a month for a year at 12% ≈ 12,766', () => {
    expect(sipMonthlyRate(12, 'effective')).toBeCloseTo(0.0094888, 6);
    expect(Math.round(computeSip({ monthly: 1000, annualReturn: 12, years: 1, stepUp: 0, convention: 'effective' }).value)).toBe(12766);
  });
  it('matches the closed form and the end-of-month variant', () => {
    expect(computeSip({ monthly: 5000, annualReturn: 12, years: 5, stepUp: 0, convention: 'nominal', timing: 'end' }).value)
      .toBeCloseTo(sipFutureValue(5000, 0.01, 60, false), 6);
    expect(sipFutureValue(5000, 0.01, 60, false)).toBeCloseTo(408348.35, 2);
  });
  it('steps the instalment up each year', () => {
    const r = computeSip({ monthly: 10000, annualReturn: 12, years: 2, stepUp: 10, convention: 'nominal' });
    // Year 1 instalments grow 12 more months; year 2 instalments are 11,000.
    const year1 = sipFutureValue(10000, 0.01, 12) * 1.01 ** 12;
    const year2 = sipFutureValue(11000, 0.01, 12);
    expect(r.value).toBeCloseTo(year1 + year2, 6);
    expect(r.invested).toBe(120000 + 132000);
    expect(r.rows[1].monthly).toBeCloseTo(11000, 9);
  });
  it('0% return returns what was invested', () => {
    const r = computeSip({ monthly: 2500, annualReturn: 0, years: 3, stepUp: 0, convention: 'nominal' });
    expect(r.value).toBe(90000);
    expect(r.gains).toBe(0);
  });
  it('lump sum compounds annually with fractional years', () => {
    expect(computeLumpSum(300000, 12, 5).value).toBeCloseTo(528702.5, 1);
    expect(computeLumpSum(10000, 12, 1.5).value).toBeCloseTo(11852.97, 2);
    expect(computeLumpSum(10000, 12, 1.5).rows).toHaveLength(2);
  });
  it('monthly SIP needed for a target inverts the formula', () => {
    expect(sipForTarget(412431.83, 0.01, 60)).toBeCloseTo(5000, 2);
  });
  it('validates', () => {
    expect(computeSip({ monthly: -1, annualReturn: 12, years: 1, stepUp: 0, convention: 'nominal' }).error).toBeTruthy();
    expect(computeSip({ monthly: 100, annualReturn: 12, years: 0, stepUp: 0, convention: 'nominal' }).error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Annuity
// ---------------------------------------------------------------------------

describe('annuity', () => {
  const monthly20: AnnuityInput = { annualRate: 6, years: 20, paymentsPerYear: 12, timing: 'ordinary', growth: 0 };

  it('100,000 at 6% over 20 years pays 716.43 a month (ordinary) and 712.87 (due)', () => {
    expect(annuityPayout(100000, monthly20)).toBeCloseTo(716.43, 2);
    expect(annuityPayout(100000, { ...monthly20, timing: 'due' })).toBeCloseTo(712.87, 2);
    expect(levelPayment(100000, 0.005, 240)).toBeCloseTo(716.43, 2);
  });
  it('lump sum for 1,000 a month over 20 years at 6% is 139,580.77', () => {
    expect(annuityLumpSumNeeded(1000, monthly20)).toBeCloseTo(139580.77, 2);
  });
  it('0% rate divides the lump sum evenly', () => {
    expect(annuityPayout(120000, { ...monthly20, annualRate: 0, years: 10 })).toBeCloseTo(1000, 9);
  });
  it('growing annual payments match a hand-built PV', () => {
    const input: AnnuityInput = { annualRate: 5, years: 3, paymentsPerYear: 1, timing: 'ordinary', growth: 3 };
    const pv = 1 / 1.05 + 1.03 / 1.05 ** 2 + 1.03 ** 2 / 1.05 ** 3;
    expect(annuityPvFactor(input)).toBeCloseTo(pv, 12);
    expect(annuityLumpSumNeeded(10000, input)).toBeCloseTo(10000 * pv, 6);
  });
  it('leaving a remaining balance lowers the payout by its present value', () => {
    const p = annuityPayout(100000, monthly20, 50000);
    expect(p).toBeCloseTo((100000 - 50000 * 1.005 ** -240) / annuityPvFactor(monthly20), 9);
  });
  it('schedule runs the balance to zero', () => {
    for (const timing of ['ordinary', 'due'] as const) {
      const input = { ...monthly20, timing, growth: 2 };
      const pmt = annuityPayout(100000, input);
      const rows = annuitySchedule(100000, pmt, input);
      expect(rows).toHaveLength(20);
      expect(rows.at(-1)!.endBalance).toBeCloseTo(0, 4);
    }
  });
  it('future value of contributions (accumulation)', () => {
    // 200/month for 30 years at 6% monthly, ordinary: 200 × ((1.005^360 − 1)/0.005)
    expect(annuityFutureValue(0, 200, { annualRate: 6, years: 30, paymentsPerYear: 12, timing: 'ordinary', growth: 0 }))
      .toBeCloseTo(200 * ((1.005 ** 360 - 1) / 0.005), 6);
  });
});

// ---------------------------------------------------------------------------
// Bonds
// ---------------------------------------------------------------------------

describe('bonds', () => {
  const tenYear = { face: 1000, couponRate: 5, years: 10, frequency: 2 };

  it('prices a 10-year 5% semiannual bond at a 6% yield: 925.61', () => {
    const p = bondPriceFromYield(tenYear, 6);
    expect(p.clean).toBeCloseTo(925.61, 2);
    expect(p.accrued).toBe(0);
  });
  it('prices at par when yield equals coupon', () => {
    expect(bondPriceFromYield(tenYear, 5).clean).toBeCloseTo(1000, 8);
  });
  it('solves YTM back from price, including premium and discount prices', () => {
    expect(bondYieldFromPrice(tenYear, 925.6126)).toBeCloseTo(6, 4);
    expect(bondYieldFromPrice(tenYear, 1100)).toBeCloseTo(3.78927, 4); // independent bisection check
    expect(bondPriceFromYield(tenYear, bondYieldFromPrice(tenYear, 1100)).clean).toBeCloseTo(1100, 6);
    expect(bondYieldFromPrice(tenYear, 0)).toBeNaN();
  });
  it('Macaulay 4.1699 and modified 3.7908 for a 5-year 10% annual bond at 10%', () => {
    const p = bondPriceFromYield({ face: 100, couponRate: 10, years: 5, frequency: 1 }, 10);
    expect(p.macaulay).toBeCloseTo(4.1699, 4);
    expect(p.modified).toBeCloseTo(3.7908, 4);
  });
  it('a zero-coupon bond has duration equal to maturity', () => {
    const p = bondPriceFromYield({ face: 1000, couponRate: 0, years: 7, frequency: 2 }, 4);
    expect(p.macaulay).toBeCloseTo(7, 10);
    expect(p.clean).toBeCloseTo(1000 / 1.02 ** 14, 8);
  });
  it('modified duration predicts small price changes', () => {
    const p0 = bondPriceFromYield(tenYear, 6);
    const p1 = bondPriceFromYield(tenYear, 6.01);
    expect((p1.dirty - p0.dirty) / p0.dirty).toBeCloseTo(-p0.modified * 0.0001, 5);
  });
  it('handles a bond between coupon dates (accrued interest, clean vs dirty)', () => {
    const { n, w } = bondPeriods(9.75, 2);
    expect(n).toBe(20);
    expect(w).toBeCloseTo(0.5, 12);
    const p = bondPriceFromYield({ ...tenYear, years: 9.75 }, 5);
    expect(p.accrued).toBeCloseTo(12.5, 9);
    // At yield = coupon the dirty price is par grown for half a period; clean = dirty − accrued.
    expect(p.dirty).toBeCloseTo(1000 * 1.025 ** 0.5, 6);
    expect(p.clean).toBeCloseTo(p.dirty - 12.5, 9);
  });
  it('current yield and yield to call', () => {
    expect(currentYield(tenYear, 925.61)).toBeCloseTo(5.4018, 4);
    // Callable in 5 years at 1,020: yield to call from a 1,050 price.
    const ytc = bondYieldFromPrice({ ...tenYear, years: 5, redemption: 1020 }, 1050);
    expect(bondPriceFromYield({ ...tenYear, years: 5, redemption: 1020 }, ytc).clean).toBeCloseTo(1050, 6);
    expect(ytc).toBeLessThan(bondYieldFromPrice(tenYear, 1050));
  });
});

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

describe('currency helpers', () => {
  it('builds Frankfurter URLs and rejects bad codes', () => {
    expect(latestRatesUrl('usd', ['EUR', 'inr', 'USD', 'EUR'])).toBe('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR%2CINR');
    expect(() => latestRatesUrl('US', [])).toThrow();
    expect(seriesUrl('USD', 'EUR', new Date('2026-10-28T12:00:00Z'), 30)).toBe('https://api.frankfurter.dev/v1/2026-09-28..2026-10-28?base=USD&symbols=EUR');
  });
  it('parses /latest and computes cross rates', () => {
    const t = parseLatest({ amount: 1, base: 'EUR', date: '2026-10-28', rates: { USD: 1.1, GBP: 0.85, bad: 3, JPY: -1 } });
    expect(t.rates).toEqual({ USD: 1.1, GBP: 0.85, EUR: 1 });
    expect(crossRate(t, 'EUR', 'USD')).toBe(1.1);
    expect(crossRate(t, 'USD', 'GBP')).toBeCloseTo(0.85 / 1.1, 12);
    expect(crossRate(t, 'USD', 'JPY')).toBeNaN();
    expect(() => parseLatest({ message: 'not found' })).toThrow();
  });
  it('parses a time series in date order', () => {
    expect(parseSeries({ rates: { '2026-10-02': { EUR: 0.9 }, '2026-10-01': { EUR: 0.8 }, '2026-10-03': {} } }, 'EUR'))
      .toEqual([{ date: '2026-10-01', rate: 0.8 }, { date: '2026-10-02', rate: 0.9 }]);
  });
  it('knows zero-decimal currencies', () => {
    expect(currencyDecimals('JPY')).toBe(0);
    expect(currencyDecimals('USD')).toBe(2);
  });
});
