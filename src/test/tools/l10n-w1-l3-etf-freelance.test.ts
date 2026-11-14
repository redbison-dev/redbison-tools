/**
 * Worked examples on the UK, India, Canada and Australia versions of the ETF
 * simulator and the UK and India versions of the freelance rate calculator
 * (src/config/toolContent/l10n/<locale>/w1-l3.ts), pinned to the tools'
 * own functions.
 */
import { describe, expect, it } from 'vitest';
import { simulateEtf, type EtfSimulationInput } from '@/lib/tools/etf-investment-simulator';
import { freelanceRate } from '@/lib/tools/w500/business2-calc';
import { formatMoneyIn } from '@/lib/tools/market-money';

const etf = (o: Partial<EtfSimulationInput>) =>
  simulateEtf({
    initialAmount: 0, monthlyContribution: 500, contributionFrequency: 'monthly', annualReturn: 6, dividendYield: 2, reinvestDividends: true,
    investmentPeriod: 20, contributionIncrease: 0, contributionIncreaseFrequency: 'yearly', expenseRatio: 0.2, inflationRate: 2, ...o,
  }).summary;

describe('ETF simulator market examples', () => {
  it('UK: £1,666 a month in an ISA for 20 years', () => {
    const s = etf({ monthlyContribution: 1666 });
    expect([s.finalValue, s.realFinalValue, s.totalContributed, s.totalFees]).toEqual([740675, 498453, 399840, 11753]);
    expect(formatMoneyIn(s.finalValue, 'GBP', 'locale')).toBe('£740,675');
  });
  it('UK: 0.2% against 0.75% ongoing charge', () => {
    expect(etf({ monthlyContribution: 300, investmentPeriod: 25 }).finalValue).toBe(197607);
    expect(etf({ monthlyContribution: 300, investmentPeriod: 25, expenseRatio: 0.75 }).finalValue).toBe(182529);
  });
  it('India: ₹10,000 SIP, flat and with a 10% step-up, shown in lakh grouping', () => {
    const base = { monthlyContribution: 10000, investmentPeriod: 15, annualReturn: 10, dividendYield: 0, inflationRate: 4 };
    expect(etf(base).finalValue).toBe(3936655);
    expect(etf({ ...base, expenseRatio: 1 }).finalValue).toBe(3681859);
    const step = etf({ ...base, salaryGrowthRate: 10 });
    expect([step.finalValue, step.realFinalValue, step.totalContributed]).toEqual([7079891, 3931212, 3812698]);
    expect(formatMoneyIn(3936655, 'INR', 'locale')).toBe('₹39,36,655');
  });
  it('Canada: TFSA limit spread monthly; MER comparison', () => {
    const s = etf({ initialAmount: 7000, monthlyContribution: 583, dividendYield: 2.5 });
    expect([s.finalValue, s.realFinalValue, s.totalContributed]).toEqual([280809, 188977, 146920]);
    expect(etf({ investmentPeriod: 25, dividendYield: 2.5 }).finalValue).toBe(329345);
    expect(etf({ investmentPeriod: 25, dividendYield: 2.5, expenseRatio: 2 }).finalValue).toBe(254873);
  });
  it('Australia: fortnightly buys; DRP against cash distributions', () => {
    const au = { annualReturn: 7, dividendYield: 3.5, inflationRate: 2.5 };
    const f = etf({ ...au, initialAmount: 10000, monthlyContribution: 1000, contributionFrequency: 'bi-weekly', investmentPeriod: 15 });
    expect([f.finalValue, f.realFinalValue, f.totalDividends]).toEqual([333866, 230523, 74049]);
    expect(etf({ ...au, initialAmount: 20000 }).finalValue).toBe(323401);
    expect(etf({ ...au, initialAmount: 20000, reinvestDividends: false }).finalValue).toBe(207262);
  });
});

describe('freelance rate market examples', () => {
  const gb = { annualExpenses: 4000, profitMarginPct: 5, daysPerWeek: 5, hoursPerDay: 7.5, vacationDays: 20, holidays: 8, sickDays: 5, billablePct: 65 };
  const ind = { daysPerWeek: 5, hoursPerDay: 8, vacationDays: 15, holidays: 12, sickDays: 5, billablePct: 65, profitMarginPct: 0 };
  const v = (r: ReturnType<typeof freelanceRate>) => (r.ok ? r.value : null)!;

  it('UK: keep £35,000 and £55,000 as a sole trader', () => {
    const a = v(freelanceRate({ ...gb, targetNetIncome: 35000, taxRatePct: 18.4 }));
    expect(a.hourlyRate).toBeCloseTo(44.604, 2);
    expect(a.dayRate).toBeCloseTo(334.53, 2);
    const b = v(freelanceRate({ ...gb, targetNetIncome: 55000, taxRatePct: 27, annualExpenses: 6000 }));
    expect(b.hourlyRate).toBeCloseTo(77.374, 2);
    expect(b.revenue).toBeCloseTo(85623.65, 1);
  });
  it('India: section 44ADA within the rebate, at 4.8%, and with a 10% platform fee', () => {
    const a = v(freelanceRate({ ...ind, targetNetIncome: 2000000, annualExpenses: 200000, taxRatePct: 0 }));
    expect([a.workingDays, a.revenue]).toEqual([228, 2200000]);
    expect(a.hourlyRate).toBeCloseTo(1855.6, 1);
    const b = v(freelanceRate({ ...ind, targetNetIncome: 3000000, annualExpenses: 300000, taxRatePct: 4.8 }));
    expect(b.revenue).toBeCloseTo(3451260.5, 0);
    const c = v(freelanceRate({ ...ind, targetNetIncome: 1200000, annualExpenses: 150000, taxRatePct: 0, profitMarginPct: 10 }));
    expect(c.revenue).toBeCloseTo(1500000, 6);
    expect(c.hourlyRate).toBeCloseTo(1265.18, 2);
  });
});
