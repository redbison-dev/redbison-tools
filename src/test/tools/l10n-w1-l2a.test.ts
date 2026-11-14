/**
 * Localization wave 1, batch l2a: market currencies for the interest,
 * investment, EMI, returns and retirement calculators, and the retirement
 * plan's public pension timing (UK State Pension age, CPP/OAS, Age Pension).
 */
import { describe, expect, it } from 'vitest';
import { axisMoneyIn, formatMoneyIn, localizeMoneyText, localizeSteps } from '@/lib/tools/market-money';
import { retirementPlan, type RetirementPlanInput } from '@/lib/tools/steps/s7-retirement-calculator';
import { retirementSteps, compoundInterestSteps, compoundResult } from '@/lib/tools/steps/s7';

describe('formatMoneyIn', () => {
  it('keeps the US strings the pages printed before', () => {
    expect(formatMoneyIn(10600, 'USD')).toBe('$10600.00');
    expect(formatMoneyIn(1234.5, 'USD', 'locale')).toBe(`$${(1234.5).toLocaleString()}`);
    expect(formatMoneyIn(1234567, 'USD', 'whole')).toBe('$1,234,567');
  });

  it('groups rupees in lakh and crore', () => {
    expect(formatMoneyIn(1234567.891, 'INR')).toBe('₹12,34,567.89');
    expect(formatMoneyIn(4069556, 'INR', 'whole')).toBe('₹40,69,556');
    expect(formatMoneyIn(-150000, 'INR', 'locale')).toBe('-₹1,50,000');
  });

  it('uses the pound, Canadian and Australian dollar with standard grouping', () => {
    expect(formatMoneyIn(20000, 'GBP')).toBe('£20,000.00');
    expect(formatMoneyIn(7000, 'CAD', 'whole')).toBe('$7,000');
    expect(formatMoneyIn(250000.5, 'AUD', 'locale')).toBe('$250,000.5');
  });

  it('shortens axes in lakh and crore for rupees', () => {
    const ax = axisMoneyIn('INR');
    expect(ax(50000)).toBe('₹50K');
    expect(ax(1250000)).toBe('₹12.5L');
    expect(ax(12000000)).toBe('₹1.2Cr');
    expect(axisMoneyIn('GBP')(250000)).toBe('£250k');
  });
});

describe('localizeSteps', () => {
  it('rewrites dollar amounts in working, keeping the decimals', () => {
    expect(localizeMoneyText('$500000 × (1 + 0.0175)^20', 'INR')).toBe('₹5,00,000 × (1 + 0.0175)^20');
    expect(localizeMoneyText('$1,234,567.50', 'INR')).toBe('₹12,34,567.50');
    expect(localizeMoneyText('$10600.00', 'GBP')).toBe('£10,600.00');
  });

  it('leaves US steps untouched', () => {
    const steps = compoundInterestSteps({ principal: 10000, rate: 10, time: 1, rateDuration: 'annually', compoundFrequency: 'annually', additionalPrincipal: 0, additionalFrequency: 'monthly' });
    expect(localizeSteps(steps, 'USD')).toBe(steps);
    expect(localizeSteps(steps, 'GBP').at(-1)!.result).toBe('£11,000.00');
  });
});

const base: RetirementPlanInput = {
  householdType: 'single', spouseSocialSecurity: 0, currentAge: 35, retirementAge: 60, lifeExpectancy: 90,
  monthlyExpenses: 2500, inflationRate: 2, retirementIncomeRatio: 70, currentSavings: 40000, monthlyContribution: 400,
  annualIncrease: 2, expectedReturn: 5, socialSecurityBenefit: 1046, employerMatch: 150, pensionBenefit: 0,
  hasKids: false, numberOfKids: 1, educationCostPerChild: 0, marriageFundPerChild: 0, kidsCurrentAge: 5,
  healthInsuranceCost: 0, longTermCareFund: 0, healthEmergencyFund: 0,
};

describe('retirement plan with a later public pension', () => {
  it('is unchanged when the new inputs are left out', () => {
    const p = retirementPlan(base);
    expect(p.bridgeYears).toBe(0);
    expect(p.publicMonthlyIncome).toBe(1046);
    expect(p.need.total).toBeCloseTo(p.need.monthlyGap * 12 * 30, 6);
  });

  it('makes savings cover the whole gap until the public pension age', () => {
    const late = retirementPlan({ ...base, publicPensionAge: 68 });
    const now = retirementPlan(base);
    expect(late.bridgeYears).toBe(8);
    expect(late.bridgeMonthlyGap).toBeCloseTo(late.need.monthlySpending, 6);
    expect(late.need.total - now.need.total).toBeCloseTo(1046 * 12 * 8, 6);
  });

  it('caps the bridge at the years in retirement and ignores an earlier age', () => {
    expect(retirementPlan({ ...base, publicPensionAge: 95 }).bridgeYears).toBe(30);
    expect(retirementPlan({ ...base, publicPensionAge: 55 }).bridgeYears).toBe(0);
  });

  it('raises a public pension entered in today\'s money by inflation to retirement', () => {
    const p = retirementPlan({ ...base, publicPensionIndexed: true });
    expect(p.publicMonthlyIncome).toBeCloseTo(1046 * Math.pow(1.02, 25), 6);
    expect(p.need.monthlyGap).toBeCloseTo(Math.max(0, p.need.monthlySpending - p.publicMonthlyIncome), 6);
  });

  it('shows the bridge and the indexed pension in the working, ending on the shortfall', () => {
    const i = { ...base, publicPensionAge: 68, publicPensionIndexed: true };
    const steps = retirementSteps(i);
    const labels = steps.map((s) => s.label);
    expect(labels).toContain('Public pension at retirement');
    expect(labels).toContain('Gap before the public pension starts');
    const p = retirementPlan(i);
    expect(steps.find((s) => s.label === 'Savings needed at retirement')!.result).toBe(formatMoneyIn(p.need.total, 'USD', 'whole'));
  });
});

describe('deposits paid at the start of each period (annuity due)', () => {
  const ppf = { principal: 0, rate: 7.1, time: 15, rateDuration: 'annually', compoundFrequency: 'annually', additionalPrincipal: 150000, additionalFrequency: 'yearly' };

  it('matches the PPF figure for ₹1.5 lakh paid in by 5 April for 15 years at 7.1%', () => {
    const due = compoundResult({ ...ppf, depositTiming: 'start' });
    const fv = 150000 * ((Math.pow(1.071, 15) - 1) / 0.071) * 1.071;
    expect(due.finalAmount).toBeCloseTo(fv, 4);
    expect(Math.round(due.finalAmount)).toBe(4068209);
  });

  it('is one period of interest above the end-of-period result, and the default is unchanged', () => {
    const end = compoundResult(ppf);
    expect(compoundResult({ ...ppf, depositTiming: 'end' }).finalAmount).toBe(end.finalAmount);
    expect(compoundResult({ ...ppf, depositTiming: 'start' }).finalAmount).toBeCloseTo(end.finalAmount * 1.071, 4);
  });

  it('shows the annuity-due factor in the working and ends on the page figure', () => {
    const steps = compoundInterestSteps({ ...ppf, depositTiming: 'start' });
    expect(steps.some((s) => (s.formula ?? '').includes('× (1 + r)'))).toBe(true);
    expect(localizeSteps(steps, 'INR').at(-1)!.result).toBe(formatMoneyIn(compoundResult({ ...ppf, depositTiming: 'start' }).finalAmount, 'INR'));
  });
});
