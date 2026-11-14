/**
 * Market conventions added for the localized mortgage tools (wave 1, batch
 * l1a): Canadian half-yearly compounding (Interest Act s. 6), the CMHC premium
 * table, Canada's minimum down payment and stress test (FCAC), FCAC payment
 * frequencies, a UK-style income multiple, and the 65% HELOC cap (FCAC).
 * The US behaviour must stay exactly as before when none of these is set.
 */
import { describe, expect, it } from 'vitest';
import {
  monthlyEquivalentRatePct, periodicRate, cmhcPremiumRatePct, canadaMinimumDownPayment, canadaMaxPriceForDown, canadaQualifyingRatePct,
  frequencyPayment, paymentFrequencyPlan, calculateMortgage, calculateAffordability, calculateRefinance, monthlyPayment,
} from '@/lib/tools/calculators/loans';
import { calculateHeloc } from '@/lib/tools/w500/finance2';
import { mortgageSteps, houseAffordabilitySteps, refinanceSteps } from '@/lib/tools/steps/s1';

const noExtras = { propertyTaxYearly: 0, insuranceYearly: 0, pmiRatePct: 0, hoaMonthly: 0 };

describe('Canadian half-yearly compounding', () => {
  it('converts a half-yearly rate to its monthly equivalent', () => {
    expect(monthlyEquivalentRatePct(5, 2)).toBeCloseTo(4.948699, 5);
    expect(monthlyEquivalentRatePct(4.5, 2)).toBeCloseTo(4.458383, 5);
    // Same growth over six months.
    expect(Math.pow(1 + monthlyEquivalentRatePct(6, 2) / 1200, 6)).toBeCloseTo(1.03, 12);
    expect(periodicRate(5, 2, 12)).toBeCloseTo(monthlyEquivalentRatePct(5, 2) / 1200, 14);
  });

  it('leaves monthly compounding untouched', () => {
    expect(monthlyEquivalentRatePct(6.5, 12)).toBe(6.5);
    expect(monthlyEquivalentRatePct(6.5)).toBe(6.5);
  });

  it('gives the textbook Canadian payment: $100,000 at 5% over 25 years is $581.60', () => {
    expect(monthlyPayment(100000, monthlyEquivalentRatePct(5, 2), 300)).toBeCloseTo(581.6, 2);
    const r = calculateMortgage({ homePrice: 125000, downPayment: 25000, ratePct: 5, termYears: 25, compoundingPerYear: 2, ...noExtras })!;
    expect(r.principalAndInterest).toBeCloseTo(581.6, 2);
    // Monthly compounding at the same quoted rate costs more.
    const us = calculateMortgage({ homePrice: 125000, downPayment: 25000, ratePct: 5, termYears: 25, ...noExtras })!;
    expect(us.principalAndInterest).toBeCloseTo(584.59, 2);
  });
});

describe('CMHC premium and Canadian down payment rules', () => {
  it('reads the CMHC premium table by loan-to-value', () => {
    expect(cmhcPremiumRatePct(65)).toBe(0.6);
    expect(cmhcPremiumRatePct(75)).toBe(1.7);
    expect(cmhcPremiumRatePct(80)).toBe(2.4);
    expect(cmhcPremiumRatePct(80.01)).toBe(2.8);
    expect(cmhcPremiumRatePct(90)).toBe(3.1);
    expect(cmhcPremiumRatePct(95)).toBe(4.0);
    expect(cmhcPremiumRatePct(95.5)).toBeNaN();
  });

  it('applies FCAC minimum down payment tiers', () => {
    expect(canadaMinimumDownPayment(480000)).toBe(24000);
    expect(canadaMinimumDownPayment(650000)).toBe(40000);
    expect(canadaMinimumDownPayment(900000)).toBe(65000);
    expect(canadaMinimumDownPayment(1500000)).toBe(300000);
    expect(canadaMaxPriceForDown(30000)).toBeCloseTo(550000, 6);
    expect(canadaMaxPriceForDown(25000)).toBeCloseTo(500000, 6);
    expect(canadaMaxPriceForDown(200000)).toBeLessThan(1500000);
    expect(canadaMaxPriceForDown(400000)).toBe(2000000);
  });

  it('adds the premium to the loan only under 20% down (CA$650,000, 10% down)', () => {
    const r = calculateMortgage({ homePrice: 650000, downPayment: 65000, ratePct: 4.5, termYears: 25, compoundingPerYear: 2, insurance: 'cmhc', ...noExtras })!;
    expect(r.baseLoanAmount).toBe(585000);
    expect(r.insurancePremiumPct).toBe(3.1);
    expect(r.insurancePremium).toBeCloseTo(18135, 6);
    expect(r.loanAmount).toBeCloseTo(603135, 6);
    expect(r.principalAndInterest).toBeCloseTo(3338.19, 2);
    expect(r.monthlyPmi).toBe(0);
    const twenty = calculateMortgage({ homePrice: 650000, downPayment: 130000, ratePct: 4.5, termYears: 25, compoundingPerYear: 2, insurance: 'cmhc', ...noExtras })!;
    expect(twenty.insurancePremium).toBe(0);
    expect(twenty.principalAndInterest).toBeCloseTo(2878.06, 2);
    expect(calculateMortgage({ homePrice: 500000, downPayment: 20000, ratePct: 4.5, termYears: 25, insurance: 'cmhc', ...noExtras })).toBeNull();
  });

  // CMHC notice "CMHC revises homeowner mortgage loan insurance premiums" (2024):
  // a 0.20-point surcharge when an insured amortization is longer than 25 years.
  it('adds the 0.20-point surcharge to the premium for an amortization over 25 years', () => {
    expect(cmhcPremiumRatePct(95, 25)).toBe(4.0);
    expect(cmhcPremiumRatePct(95, 30)).toBe(4.2);
    expect(cmhcPremiumRatePct(90, 30)).toBe(3.3);
    expect(cmhcPremiumRatePct(95.5, 30)).toBeNaN();
    const r = calculateMortgage({ homePrice: 480000, downPayment: 24000, ratePct: 4.5, termYears: 30, compoundingPerYear: 2, insurance: 'cmhc', ...noExtras })!;
    expect(r.insurancePremiumPct).toBe(4.2);
    expect(r.insurancePremium).toBeCloseTo(19152, 6);
    expect(r.loanAmount).toBeCloseTo(475152, 6);
    expect(r.principalAndInterest).toBeCloseTo(2395.79, 2);
    const a = calculateAffordability({
      annualIncome: 140000, monthlyDebts: 600, downPayment: 30000, ratePct: 4.5, termYears: 30, propertyTaxRatePct: 0.8, insuranceYearly: 0, hoaMonthly: 0,
      pmiRatePct: 0, frontEndPct: 39, backEndPct: 44, compoundingPerYear: 2, insurance: 'cmhc', canadaMinimumDown: true,
    })!;
    expect(a.insurancePremium).toBeCloseTo((a.loanAmount / 1.042) * 0.042, 6);
  });

  it("'none' charges no PMI even with a small deposit", () => {
    const r = calculateMortgage({ homePrice: 300000, downPayment: 30000, ratePct: 4.5, termYears: 25, insurance: 'none', propertyTaxYearly: 0, insuranceYearly: 0, pmiRatePct: 0.5, hoaMonthly: 0 })!;
    expect(r.monthlyPmi).toBe(0);
    expect(r.principalAndInterest).toBeCloseTo(1500.75, 2);
  });

  it('the stress test qualifies at the higher of 5.25% and rate + 2', () => {
    expect(canadaQualifyingRatePct(4.5)).toBe(6.5);
    expect(canadaQualifyingRatePct(3)).toBe(5.25);
  });
});

describe('payment frequencies (FCAC definitions)', () => {
  it('derives each payment from the monthly payment', () => {
    expect(frequencyPayment(2000, 'semi-monthly')).toBe(1000);
    expect(frequencyPayment(2000, 'biweekly')).toBeCloseTo(923.08, 2);
    expect(frequencyPayment(2000, 'weekly')).toBeCloseTo(461.54, 2);
    expect(frequencyPayment(2000, 'accelerated-biweekly')).toBe(1000);
    expect(frequencyPayment(2000, 'accelerated-weekly')).toBe(500);
  });

  it('accelerated bi-weekly shortens a 25-year loan by over three years', () => {
    const p = paymentFrequencyPlan(603135, 4.5, 300, 2, 'accelerated-biweekly')!;
    expect(p.payment).toBeCloseTo(1669.09, 2);
    expect(p.payments).toBe(564);
    expect(p.years).toBeCloseTo(21.69, 2);
    expect(p.interestSaved).toBeCloseTo(60407.81, 1);
    const plain = paymentFrequencyPlan(603135, 4.5, 300, 2, 'biweekly')!;
    expect(plain.payment).toBeCloseTo(1540.70, 2);
    expect(plain.years).toBeCloseTo(25, 0);
    const monthly = paymentFrequencyPlan(603135, 4.5, 300, 2, 'monthly')!;
    expect(monthly.payments).toBe(300);
    expect(monthly.interestSaved).toBeCloseTo(0, 6);
  });
});

describe('affordability with market rules', () => {
  const ca = {
    annualIncome: 140000, monthlyDebts: 600, downPayment: 80000, ratePct: 4.5, termYears: 25, propertyTaxRatePct: 0.8, insuranceYearly: 0, hoaMonthly: 0,
    pmiRatePct: 0, frontEndPct: 39, backEndPct: 44, compoundingPerYear: 2, heatingMonthly: 120, hoaSharePct: 50, insurance: 'cmhc' as const,
    canadaMinimumDown: true, qualifyingRatePct: canadaQualifyingRatePct(4.5),
  };
  it('Canada: GDS/TDS at the 6.5% qualifying rate with the CMHC premium financed', () => {
    const r = calculateAffordability(ca)!;
    expect(r.binding).toBe('back-end');
    expect(r.maxPrice).toBeCloseTo(655763.79, 1);
    expect(r.qualifyingRatePct).toBe(6.5);
    expect(r.contractPayment).toBeCloseTo(3285.48, 1);
    expect(r.backEndRatio).toBeCloseTo(44, 6);
    expect(r.frontEndRatio).toBeLessThanOrEqual(39);
    // Without the stress test the same household would qualify for far more.
    expect(calculateAffordability({ ...ca, qualifyingRatePct: undefined })!.maxPrice).toBeCloseTo(764139.12, 1);
    // Condo fees count at 50%.
    expect(calculateAffordability({ ...ca, hoaMonthly: 450 })!.maxPrice).toBeCloseTo(626051.21, 1);
  });

  it('Canada: a small down payment caps the price by the minimum down payment rule', () => {
    const r = calculateAffordability({ ...ca, downPayment: 30000 })!;
    expect(r.binding).toBe('minimum-down-payment');
    expect(r.maxPrice).toBeCloseTo(550000, 4);
  });

  it('UK: an income multiple with no payment ratios', () => {
    const r = calculateAffordability({
      annualIncome: 55000, monthlyDebts: 0, downPayment: 40000, ratePct: 4.5, termYears: 30, propertyTaxRatePct: 0, insuranceYearly: 0, hoaMonthly: 0,
      pmiRatePct: 0, frontEndPct: 0, backEndPct: 0, maxLoanToIncome: 4.5, insurance: 'none',
    })!;
    expect(r.binding).toBe('income-multiple');
    expect(r.maxPrice).toBeCloseTo(287500, 6);
    expect(r.loanToIncome).toBeCloseTo(4.5, 9);
    expect(r.principalAndInterest).toBeCloseTo(1254.05, 2);
    const steps = houseAffordabilitySteps({
      annualIncome: 55000, monthlyDebts: 0, downPayment: 40000, ratePct: 4.5, termYears: 30, propertyTaxRatePct: 0, insuranceYearly: 0, hoaMonthly: 0,
      pmiRatePct: 0, frontEndPct: 0, backEndPct: 0, maxLoanToIncome: 4.5, insurance: 'none',
    }, 'GBP');
    expect(steps.at(-1)!.result).toContain('287,500');
  });

  it('rejects a missing back-end limit without an income multiple', () => {
    expect(calculateAffordability({ ...ca, backEndPct: 0 })).toBeNull();
  });
});

describe('refinance and HELOC', () => {
  it('Canada: refinancing at half-yearly compounding with a penalty', () => {
    const r = calculateRefinance({ currentBalance: 420000, currentRatePct: 5.49, remainingMonths: 252, newRatePct: 4.29, newTermMonths: 252, closingCosts: 10500, pointsPct: 0, rollCostsIntoLoan: false, cashOut: 0, compoundingPerYear: 2 })!;
    expect(r.currentPayment).toBeCloseTo(2796.68, 2);
    expect(r.newPayment).toBeCloseTo(2522.86, 2);
    expect(r.simpleBreakEvenMonth).toBe(39);
    expect(r.breakEvenMonth).toBe(26);
    const steps = refinanceSteps({ currentBalance: 420000, currentRatePct: 5.49, remainingMonths: 252, newRatePct: 4.29, newTermMonths: 252, closingCosts: 10500, pointsPct: 0, rollCostsIntoLoan: false, cashOut: 0, compoundingPerYear: 2 }, 'CAD');
    expect(steps[0].working).toContain('^(2/12)');
  });

  it('UK: remortgaging off a reversion rate', () => {
    const r = calculateRefinance({ currentBalance: 180000, currentRatePct: 7.5, remainingMonths: 264, newRatePct: 4.3, newTermMonths: 264, closingCosts: 999, pointsPct: 0, rollCostsIntoLoan: true, cashOut: 0 })!;
    expect(r.monthlySavings).toBeCloseTo(332.70, 2);
    expect(r.breakEvenMonth).toBe(3);
  });

  it('Canada: the 65% cap limits a HELOC once the mortgage is small', () => {
    const big = calculateHeloc({ homeValue: 900000, mortgageBalance: 400000, cltvLimitPct: 80, lineCapPct: 65, drawAmount: 80000, ratePct: 5.45, drawYears: 10, repayYears: 15 });
    expect(big.ok && big.value.maxLine).toBe(320000);
    expect(big.ok && big.value.lineCapBinds).toBe(false);
    expect(big.ok && big.value.interestOnlyPayment).toBeCloseTo(363.33, 2);
    const small = calculateHeloc({ homeValue: 900000, mortgageBalance: 100000, cltvLimitPct: 80, lineCapPct: 65, ratePct: 5.45, drawYears: 10, repayYears: 15 });
    expect(small.ok && small.value.maxLine).toBe(585000);
    expect(small.ok && small.value.lineCapBinds).toBe(true);
    const noCap = calculateHeloc({ homeValue: 900000, mortgageBalance: 100000, cltvLimitPct: 80, lineCapPct: 100, ratePct: 5.45, drawYears: 10, repayYears: 15 });
    expect(noCap.ok && noCap.value.maxLine).toBe(620000);
    expect(calculateHeloc({ homeValue: 900000, mortgageBalance: 0, cltvLimitPct: 80, lineCapPct: 0, ratePct: 5, drawYears: 10, repayYears: 15 }).ok).toBe(false);
  });

  it('mortgage steps show the premium and the half-yearly working', () => {
    const steps = mortgageSteps({ homePrice: 650000, downPayment: 65000, ratePct: 4.5, termYears: 25, compoundingPerYear: 2, insurance: 'cmhc', ...noExtras }, 'CAD');
    expect(steps[0].formula).toContain('CMHC premium');
    expect(steps[1].working).toContain('^(2/12)');
    expect(steps.at(-1)!.result).toContain('3,338.19');
  });
});
