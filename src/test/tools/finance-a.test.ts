import { describe, it, expect } from 'vitest';
import { computeCompoundGrowth } from '@/lib/finance/compoundGrowth';
import { toRatePerPeriod, contributionsPerYear } from '@/lib/tools/compound-interest-calculator';
import { computeSimpleInterest } from '@/lib/tools/simple-interest-calculator';
import { computeEmi, buildLoanSchedule } from '@/lib/tools/emi-calculator';
import { computeSip, computeLumpSum } from '@/lib/tools/investment-calculator';
import {
  projectRetirementSavings,
  computeRetirementNeed,
  requiredExtraMonthlyContribution,
  monthlyIncomeFromSavings,
} from '@/lib/tools/retirement-calculator';
import {
  chainReturns,
  annualizeReturn,
  xirr,
  timeWeightedReturnFromUnits,
} from '@/lib/tools/investment-returns-calculator';

describe('compound-interest-calculator', () => {
  it('converts an annual rate to a monthly per-period rate when compounding monthly', () => {
    // Bug: the UI used rate / 100 as the per-period rate even when the user picked
    // "Per Year" and then monthly compounding, i.e. 10% per month.
    expect(toRatePerPeriod(10, 'annually', 'monthly')).toBeCloseTo(0.1 / 12, 12);
    const r = computeCompoundGrowth({
      principal: 10000,
      ratePerPeriod: toRatePerPeriod(10, 'annually', 'monthly'),
      periodsPerYear: 12,
      years: 2,
    });
    // A = P(1 + r/n)^(nt) = 10,000 * (1 + 0.10/12)^24
    expect(r.finalAmount).toBeCloseTo(12203.91, 2);
  });

  it('keeps a per-period rate unchanged when rate duration matches compounding', () => {
    expect(toRatePerPeriod(1, 'monthly', 'monthly')).toBeCloseTo(0.01, 12);
    expect(toRatePerPeriod(10, 'annually', 'annually')).toBeCloseTo(0.1, 12);
  });

  it('annualises contribution amounts by frequency', () => {
    expect(contributionsPerYear(100, 'monthly')).toBe(1200);
    expect(contributionsPerYear(100, 'weekly')).toBe(5200);
    expect(contributionsPerYear(100, 'quarterly')).toBe(400);
    expect(contributionsPerYear(100, 'yearly')).toBe(100);
  });

  it('handles a zero interest rate instead of returning nothing', () => {
    const r = computeCompoundGrowth({
      principal: 10000,
      ratePerPeriod: 0,
      periodsPerYear: 12,
      years: 2,
      contributionsPerYear: 1200,
    });
    expect(r.finalAmount).toBeCloseTo(12400, 6);
    expect(r.interestEarned).toBeCloseTo(0, 6);
    expect(r.rows).toHaveLength(2);
  });

  it('grows contributions with no starting principal', () => {
    const r = computeCompoundGrowth({
      principal: 0,
      ratePerPeriod: 0.1 / 12,
      periodsPerYear: 12,
      years: 1,
      contributionsPerYear: 1200,
    });
    // Ordinary annuity: 100 * ((1 + r)^12 - 1) / r
    const i = 0.1 / 12;
    expect(r.finalAmount).toBeCloseTo(100 * ((Math.pow(1 + i, 12) - 1) / i), 6);
  });
});

describe('simple-interest-calculator', () => {
  it('computes SI = P * R * T / 100', () => {
    const r = computeSimpleInterest(10000, 5, 2)!;
    expect(r.interest).toBeCloseTo(1000, 9);
    expect(r.finalAmount).toBeCloseTo(11000, 9);
  });

  it('includes the partial final year in the breakdown for fractional terms', () => {
    const r = computeSimpleInterest(10000, 5, 2.5)!;
    expect(r.interest).toBeCloseTo(1250, 9);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[2].period).toBe('Year 3 (partial)');
    expect(r.rows[2].interestEarned).toBeCloseTo(250, 9);
    expect(r.rows[2].endingBalance).toBeCloseTo(11250, 9);
    expect(r.chart[r.chart.length - 1].total).toBeCloseTo(11250, 9);
  });

  it('returns principal unchanged at a zero rate', () => {
    const r = computeSimpleInterest(5000, 0, 3)!;
    expect(r.interest).toBe(0);
    expect(r.finalAmount).toBe(5000);
  });

  it('rejects empty or negative input', () => {
    expect(computeSimpleInterest(0, 5, 1)).toBeNull();
    expect(computeSimpleInterest(1000, -1, 1)).toBeNull();
    expect(computeSimpleInterest(1000, 5, 0)).toBeNull();
    expect(computeSimpleInterest(NaN, 5, 1)).toBeNull();
  });
});

describe('emi-calculator', () => {
  it('matches EMI = P r (1+r)^n / ((1+r)^n - 1) for 100,000 at 10% over 12 months', () => {
    expect(computeEmi(100000, 10, 12)).toBeCloseTo(8791.59, 2);
  });

  it('matches the standard 30-year mortgage payment', () => {
    // 160,000 at 6.5% for 360 months (the tool's default inputs)
    const s = buildLoanSchedule(160000, 6.5, 360)!;
    expect(s.emi).toBeCloseTo(1011.31, 2);
    expect(s.totalInterest).toBeCloseTo(204071.18, 1);
    expect(s.schedule).toHaveLength(360);
    expect(s.schedule[359].balance).toBeCloseTo(0, 4);
  });

  it('splits the first instalment into interest on the full balance and principal', () => {
    const s = buildLoanSchedule(100000, 12, 12)!;
    expect(s.schedule[0].interest).toBeCloseTo(1000, 9);
    expect(s.schedule[0].principal).toBeCloseTo(s.emi - 1000, 9);
  });

  it('divides the principal evenly at a zero interest rate', () => {
    expect(computeEmi(120000, 0, 12)).toBe(10000);
    const s = buildLoanSchedule(120000, 0, 12)!;
    expect(s.totalInterest).toBeCloseTo(0, 9);
    expect(s.schedule[11].balance).toBeCloseTo(0, 9);
  });

  it('returns null for impossible input', () => {
    expect(buildLoanSchedule(0, 10, 12)).toBeNull();
    expect(buildLoanSchedule(1000, 10, 0)).toBeNull();
    expect(buildLoanSchedule(1000, -1, 12)).toBeNull();
  });
});

describe('investment-calculator', () => {
  it('computes SIP maturity with contributions at the start of each month (annuity due)', () => {
    const r = computeSip(5000, 12, 60)!;
    // 5000 * [((1.01)^60 - 1) / 0.01] * 1.01
    expect(r.maturity).toBeCloseTo(412431.83, 2);
    expect(r.invested).toBe(300000);
  });

  it('shows the real value in the final partial year of a SIP', () => {
    // Bug: for 18 months the Year 2 row repeated the Year 1 value.
    const r = computeSip(5000, 12, 18)!;
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1].invested).toBe(90000);
    expect(r.rows[1].value).toBeCloseTo(99054.48, 2);
    expect(r.rows[1].value).toBeCloseTo(r.maturity, 9);
  });

  it('handles a zero expected return for SIP', () => {
    const r = computeSip(5000, 0, 24)!;
    expect(r.maturity).toBe(120000);
    expect(r.rows[1].value).toBe(120000);
  });

  it('compounds a lump sum annually and stops the chart at the real end date', () => {
    // Bug: an 18-month lump sum charted two full years of growth.
    const r = computeLumpSum(10000, 12, 18)!;
    expect(r.maturity).toBeCloseTo(11852.97, 2);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[1].value).toBeCloseTo(r.maturity, 9);
    expect(computeLumpSum(10000, 12, 60)!.maturity).toBeCloseTo(17623.42, 2);
  });
});

describe('retirement-calculator', () => {
  const base = {
    currentAge: 30,
    retirementAge: 32,
    currentSavings: 10000,
    monthlyContribution: 100,
    employerMatch: 0,
    annualIncrease: 0,
    expectedReturn: 10,
    inflationRate: 3,
  };

  it('projects savings with mid-year contributions', () => {
    const rows = projectRetirementSavings(base);
    expect(rows).toHaveLength(3);
    // Year 1: 10,000 * 1.1 + 1,200 * 1.05
    expect(rows[1].totalSavings).toBeCloseTo(12260, 6);
    expect(rows[2].totalSavings).toBeCloseTo(12260 * 1.1 + 1260, 6);
    expect(rows[2].totalContributions).toBe(12400);
  });

  it('subtracts guaranteed income and does not scale health insurance by the income ratio', () => {
    const need = computeRetirementNeed({
      yearsToRetirement: 0,
      yearsInRetirement: 20,
      monthlyExpenses: 5000,
      healthInsuranceCost: 500,
      inflationRate: 3,
      retirementIncomeRatio: 80,
      guaranteedMonthlyIncome: 2000,
      lumpSumGoals: 0,
    });
    // (5000 * 0.8 + 500 - 2000) * 12 * 20
    expect(need.monthlyGap).toBeCloseTo(2500, 9);
    expect(need.total).toBeCloseTo(600000, 6);
  });

  it('never asks for negative savings when benefits exceed spending', () => {
    const need = computeRetirementNeed({
      yearsToRetirement: 0,
      yearsInRetirement: 20,
      monthlyExpenses: 1000,
      healthInsuranceCost: 0,
      inflationRate: 3,
      retirementIncomeRatio: 80,
      guaranteedMonthlyIncome: 5000,
      lumpSumGoals: 1000,
    });
    expect(need.total).toBe(1000);
  });

  it('avoids NaN when retirement age equals life expectancy', () => {
    expect(monthlyIncomeFromSavings(100000, 0)).toBe(0);
  });

  it('accounts for growth when sizing the extra monthly contribution', () => {
    const extra = requiredExtraMonthlyContribution(12260, 1, 10);
    // One year at 10% with mid-year timing: 12 * x * 1.05 = 12,260
    expect(extra).toBeCloseTo(12260 / 12.6, 6);
    expect(requiredExtraMonthlyContribution(1200, 1, 0)).toBeCloseTo(100, 9);
  });
});

describe('investment-returns-calculator', () => {
  it('chains sub-period returns geometrically instead of averaging them', () => {
    expect(chainReturns([0.1, -0.05, 0.2])).toBeCloseTo(0.254, 12);
    expect(chainReturns([0.5, -0.5])).toBeCloseTo(-0.25, 12);
  });

  it('annualises a cumulative return', () => {
    expect(annualizeReturn(0.21, 2)).toBeCloseTo(0.1, 12);
  });

  it('matches the Excel XIRR reference example', () => {
    const rate = xirr([
      { date: '2008-01-01', amount: -10000 },
      { date: '2008-03-01', amount: 2750 },
      { date: '2008-10-30', amount: 4250 },
      { date: '2009-02-15', amount: 3250 },
      { date: '2009-04-01', amount: 2750 },
    ]);
    expect(rate).toBeCloseTo(0.373362535, 6);
  });

  it('returns 10% XIRR for 1,000 growing to 1,100 over 365 days', () => {
    expect(xirr([
      { date: '2023-01-01', amount: -1000 },
      { date: '2024-01-01', amount: 1100 },
    ])).toBeCloseTo(0.1, 9);
  });

  it('computes time-weighted return from unit prices, ignoring cash-flow size', () => {
    const r = timeWeightedReturnFromUnits(
      [
        { type: 'buy', date: '2023-01-01', amount: 1000, shares: 100 },
        { type: 'buy', date: '2023-07-01', amount: 6000, shares: 500 }, // price 12
      ],
      600 * 15,
    );
    // 10 -> 12 -> 15: (1.2)(1.25) - 1 = 50%, regardless of the big second buy
    expect(r!.subPeriodReturns).toHaveLength(2);
    expect(r!.subPeriodReturns[0]).toBeCloseTo(0.2, 12);
    expect(r!.subPeriodReturns[1]).toBeCloseTo(0.25, 12);
    expect(r!.twr).toBeCloseTo(0.5, 12);
  });

  it('handles sells and an explicit price per share', () => {
    const r = timeWeightedReturnFromUnits(
      [
        { type: 'buy', date: '2023-01-01', amount: 1000, shares: 100, price: 10 },
        { type: 'sell', date: '2023-06-01', amount: 400, shares: 50, price: 8 },
      ],
      50 * 9,
    );
    // 10 -> 8 -> 9 = -10%
    expect(r!.twr).toBeCloseTo(-0.1, 12);
  });

  it('returns null when a transaction has no share count', () => {
    expect(timeWeightedReturnFromUnits(
      [{ type: 'buy', date: '2023-01-01', amount: 1000 }],
      1100,
    )).toBeNull();
  });
});
