/**
 * Rent vs buy market conventions (localization wave 1, batch l3):
 * half-yearly compounding for Canadian fixed-rate mortgages (Interest Act,
 * s. 6) and a yearly deduction limit for India's Section 24(b) cap. The
 * worked examples on the market versions are pinned here.
 */
import { describe, expect, it } from 'vitest';
import { computeRentVsBuy, monthlyMortgagePayment, monthlyRateFor, type RentVsBuyInput } from '@/lib/tools/rent-vs-buy-calculator';
import { rentVsBuySteps } from '@/lib/tools/steps/s7';
import { localizeSteps } from '@/lib/tools/market-money';

const us: RentVsBuyInput = {
  homePrice: 400000, downPayment: 80000, interestRate: 6.5, loanTerm: 30, closingCosts: 8000, sellingCosts: 6, propertyTax: 6000, homeInsurance: 1200,
  maintenanceCost: 4000, hoaFees: 0, monthlyRent: 2500, renterInsurance: 200, rentIncrease: 3, homeAppreciation: 3, investmentReturn: 7, inflationRate: 2.5,
  marginalTaxRate: 24, analysisYears: 10,
};

describe('US behaviour is unchanged', () => {
  it('monthly compounding and no cap give the same result as before', () => {
    const base = computeRentVsBuy(us);
    expect(base.monthlyPayment).toBeCloseTo(2022.62, 2);
    expect(computeRentVsBuy({ ...us, compoundingPerYear: 12, deductionCap: 0 })).toEqual(base);
    expect(monthlyRateFor(6.5)).toBe(6.5 / 100 / 12);
  });
});

describe('half-yearly compounding (Canada)', () => {
  it('5% compounded half-yearly is 0.41239% a month', () => {
    expect(monthlyRateFor(5, 2) * 100).toBeCloseTo(0.412392, 6);
    // Same effective annual rate: (1 + 0.05 / 2)^2 = 1.050625.
    expect((1 + monthlyRateFor(5, 2)) ** 12).toBeCloseTo(1.050625, 10);
  });
  it('lowers the payment against monthly compounding', () => {
    expect(monthlyMortgagePayment(680000, 4.5, 25, 2)).toBeCloseTo(3763.62, 2);
    expect(monthlyMortgagePayment(680000, 4.5, 25, 12)).toBeCloseTo(3779.66, 2);
  });
  it('the working shows the half-yearly rate and the steps end on the net worth difference', () => {
    const ca: RentVsBuyInput = { ...us, homePrice: 850000, downPayment: 170000, interestRate: 4.5, loanTerm: 25, compoundingPerYear: 2 };
    const s = rentVsBuySteps(ca);
    expect(s[1].working).toContain('r = (1 + 4.5% / 2)^(2 / 12) − 1');
    expect(s[1].result).toBe(`$${monthlyMortgagePayment(680000, 4.5, 25, 2).toFixed(2)} a month`);
  });
});

describe('yearly deduction limit (India, Section 24(b))', () => {
  const ind: RentVsBuyInput = {
    homePrice: 10000000, downPayment: 2500000, interestRate: 8.5, loanTerm: 20, closingCosts: 650000, sellingCosts: 1, propertyTax: 10000, homeInsurance: 3000,
    maintenanceCost: 20000, hoaFees: 48000, monthlyRent: 25000, renterInsurance: 0, rentIncrease: 5, homeAppreciation: 6, investmentReturn: 8, inflationRate: 4,
    marginalTaxRate: 0, analysisYears: 15, propertyTaxDeductible: false,
  };
  it('new regime (no deduction): renting ahead by about ₹30.1 lakh after 15 years', () => {
    const r = computeRentVsBuy(ind);
    expect(r.monthlyPayment).toBeCloseTo(65086.74, 2);
    expect(Math.round(r.netWorthDifference)).toBe(-3012095);
  });
  it('old regime capped at ₹2,00,000 saves ₹62,400 a year at 31.2%', () => {
    const r = computeRentVsBuy({ ...ind, marginalTaxRate: 31.2, deductionCap: 200000 });
    expect(r.years[0].taxDeduction).toBeCloseTo(62400, 6);
    expect(Math.round(r.netWorthDifference)).toBe(-1250031);
  });
  it('without the cap the deduction is overstated enough to flip the answer', () => {
    const r = computeRentVsBuy({ ...ind, marginalTaxRate: 31.2 });
    // Section 24(b) on a self-occupied home covers interest only, so property tax is left out.
    expect(Math.round(r.years[0].taxDeduction)).toBe(197113);
    expect(Math.round(r.netWorthDifference)).toBe(1615160);
    expect(r.recommendation).toBe('buy');
  });
  it('the cap applies to interest; property tax stays deductible outside it unless switched off', () => {
    const capped = computeRentVsBuy({ ...us, deductionCap: 1000 });
    const noTax = computeRentVsBuy({ ...us, deductionCap: 1000, propertyTaxDeductible: false });
    expect(capped.years[0].taxDeduction - noTax.years[0].taxDeduction).toBeCloseTo((us.propertyTax * us.marginalTaxRate) / 100, 6);
    expect(noTax.years[0].taxDeduction).toBeCloseTo((1000 * us.marginalTaxRate) / 100, 6);
  });
  it('a cap above the deductible amount changes nothing', () => {
    expect(computeRentVsBuy({ ...us, deductionCap: 1e9 })).toEqual(computeRentVsBuy(us));
  });
});

describe('market worked examples', () => {
  const gb: RentVsBuyInput = {
    homePrice: 350000, downPayment: 35000, interestRate: 4.5, loanTerm: 25, closingCosts: 5000, sellingCosts: 2, propertyTax: 0, homeInsurance: 400, maintenanceCost: 3500,
    hoaFees: 0, monthlyRent: 1500, renterInsurance: 100, rentIncrease: 3, homeAppreciation: 3, investmentReturn: 5, inflationRate: 2, marginalTaxRate: 0, analysisYears: 10,
  };
  it('UK first-time buyer vs mover (SDLT £2,500 vs £7,500 plus £2,500 fees)', () => {
    const ftb = computeRentVsBuy(gb);
    const mover = computeRentVsBuy({ ...gb, closingCosts: 10000 });
    expect(ftb.monthlyPayment).toBeCloseTo(1750.87, 2);
    expect([ftb.breakEvenYear, Math.round(ftb.netWorthDifference)]).toEqual([2, 105733]);
    expect([mover.breakEvenYear, Math.round(mover.netWorthDifference)]).toEqual([3, 97588]);
  });
  it('Toronto condo: renting ahead at 20% and 10% down (CMHC premium financed)', () => {
    const ca: RentVsBuyInput = {
      homePrice: 850000, downPayment: 170000, interestRate: 4.5, loanTerm: 25, closingCosts: 29450, sellingCosts: 5, propertyTax: 5500, homeInsurance: 500, maintenanceCost: 2000,
      hoaFees: 8400, monthlyRent: 2800, renterInsurance: 250, rentIncrease: 3, homeAppreciation: 3, investmentReturn: 5, inflationRate: 2, marginalTaxRate: 0, analysisYears: 10, compoundingPerYear: 2,
    };
    expect(Math.round(computeRentVsBuy(ca).netWorthDifference)).toBe(-50730);
    const insured = computeRentVsBuy({ ...ca, downPayment: 85000 - 23715, closingCosts: 31347 });
    expect(insured.monthlyPayment).toBeCloseTo(4365.32, 2);
    expect(Math.round(insured.netWorthDifference)).toBe(-48698);
  });
  it('Melbourne: established house vs first home unit', () => {
    const au: RentVsBuyInput = {
      homePrice: 800000, downPayment: 160000, interestRate: 6, loanTerm: 30, closingCosts: 45570, sellingCosts: 2.5, propertyTax: 2200, homeInsurance: 1800, maintenanceCost: 4000,
      hoaFees: 0, monthlyRent: 2600, renterInsurance: 300, rentIncrease: 3, homeAppreciation: 4, investmentReturn: 6, inflationRate: 2.5, marginalTaxRate: 0, analysisYears: 10,
    };
    const house = computeRentVsBuy(au);
    expect(house.monthlyPayment).toBeCloseTo(3837.12, 2);
    expect(Math.round(house.netWorthDifference)).toBe(-11252);
    const unit = computeRentVsBuy({ ...au, homePrice: 600000, downPayment: 120000, closingCosts: 2500, propertyTax: 1500, homeInsurance: 400, maintenanceCost: 2000, hoaFees: 4000, monthlyRent: (520 * 52) / 12 });
    expect([unit.breakEvenYear, Math.round(unit.netWorthDifference)]).toEqual([3, 76713]);
  });
});

describe('localized working', () => {
  it('rupee steps use Indian grouping, USD steps are untouched', () => {
    const s = rentVsBuySteps({ ...us, homePrice: 10000000, downPayment: 2500000 });
    expect(localizeSteps(s, 'INR')[0].result).toBe('₹75,00,000');
    expect(localizeSteps(s, 'USD')).toBe(s);
  });
});
