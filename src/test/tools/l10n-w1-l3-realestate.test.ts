/**
 * Market options of the Real Estate Investment Analyzer (localization wave 1, batch l3):
 * interest-only loans, semi-annual compounding and the tax treatments of rental
 * profit in the UK, Canada, Australia and India. The US defaults stay pre-tax and unchanged.
 */
import { describe, expect, it } from 'vitest';
import { analyzeRentalProperty, monthlyNominalRatePct, rentalMonthlyPayment, rentalYearTax, type RentalPropertyInput } from '@/lib/tools/real-estate-investment-analyzer';
import { monthlyMortgagePayment } from '@/lib/tools/rent-vs-buy-calculator';
import { realEstateInvestmentSteps } from '@/lib/tools/steps/s8';

const us: RentalPropertyInput = { purchasePrice: 300000, downPayment: 20, closingCosts: 3, loanTerm: 30, interestRate: 6.5, monthlyRent: 2500, propertyTaxes: 3600, insurance: 1200, maintenance: 2400, vacancy: 5, propertyManagement: 8, appreciation: 3, analysisYears: 10, depreciation: 3.636, taxRate: 25 };
const st = () => ({ lossCf: 0, financeCf: 0 });
const base = { effectiveGrossIncome: 0, propertyTaxes: 0, depreciation: 0, ratePct: 40, lossRelief: 'full' as const, lossCap: 0 };

describe('US behaviour is unchanged', () => {
  it('the default inputs give the same figures as before and no tax', () => {
    const { results, metrics } = analyzeRentalProperty(us);
    expect(metrics.capRate).toBe(6.34);
    expect(results[0].noi).toBe(19020);
    expect(results.every((r) => r.tax === 0 && r.afterTaxCashFlow === r.cashFlow)).toBe(true);
    expect(metrics.afterTaxCashOnCash).toBe(metrics.cashOnCashReturn);
    expect(rentalMonthlyPayment(240000, 6.5, 30)).toBe(monthlyMortgagePayment(240000, 6.5, 30));
    expect(realEstateInvestmentSteps(us).some((s) => s.label.startsWith('Tax on'))).toBe(false);
  });
});

describe('financing options', () => {
  it('interest-only pays L x r a month and repays nothing', () => {
    expect(rentalMonthlyPayment(150000, 5, 25, 'interest-only')).toBeCloseTo(625, 9);
    const { results, metrics } = analyzeRentalProperty({ ...us, repayment: 'interest-only' });
    expect(results[0].mortgagePayment).toBe(Math.round(240000 * 0.065));
    expect(results[results.length - 1].remainingBalance).toBe(240000);
    expect(metrics.totalEquityBuildup).toBe(0);
  });
  it('semi-annual compounding: 5% is 4.9487% compounded monthly (Canadian fixed rate)', () => {
    expect(monthlyNominalRatePct(5, 2)).toBeCloseTo(4.94869, 4);
    expect(monthlyNominalRatePct(5, 12)).toBe(5);
    expect(rentalMonthlyPayment(400000, 5, 25, 'amortising', 2)).toBeCloseTo(monthlyMortgagePayment(400000, monthlyNominalRatePct(5, 2), 25), 9);
    expect(rentalMonthlyPayment(400000, 5, 25, 'amortising', 2)).toBeLessThan(monthlyMortgagePayment(400000, 5, 25));
  });
});

describe('rentalYearTax', () => {
  it('deduct: a loss saves tax on other income, or is capped, or carried forward', () => {
    expect(rentalYearTax('deduct', { ...base, noi: 10000, interest: 15000 }, st())).toEqual({ taxableProfit: -5000, tax: -2000 });
    const s = st();
    expect(rentalYearTax('deduct', { ...base, noi: 10000, interest: 15000, lossRelief: 'none' }, s).tax).toBeCloseTo(0, 9);
    expect(s.lossCf).toBe(5000);
    expect(rentalYearTax('deduct', { ...base, noi: 20000, interest: 12000, lossRelief: 'none' }, s)).toEqual({ taxableProfit: 3000, tax: 1200 });
    expect(rentalYearTax('deduct', { ...base, noi: 0, interest: 300000, lossRelief: 'capped', lossCap: 200000, ratePct: 30 }, st()).tax).toBeCloseTo(-60000, 9);
  });
  it('deduct-cca: CCA cannot create or increase a rental loss', () => {
    expect(rentalYearTax('deduct-cca', { ...base, noi: 20000, interest: 15000, depreciation: 8000 }, st())).toEqual({ taxableProfit: 0, tax: 0 });
    expect(rentalYearTax('deduct-cca', { ...base, noi: 20000, interest: 25000, depreciation: 8000 }, st())).toEqual({ taxableProfit: -5000, tax: -2000 });
    expect(rentalYearTax('deduct-cca', { ...base, noi: 30000, interest: 15000, depreciation: 8000 }, st())).toEqual({ taxableProfit: 7000, tax: 2800 });
  });
  it('UK Section 24: tax on profit before interest, less 20% of the lower of interest and profit', () => {
    // GOV.UK case study style: profit 10,000 before finance costs of 6,000 at 40%: 4,000 - 1,200 = 2,800.
    expect(rentalYearTax('uk-finance-credit', { ...base, noi: 10000, interest: 6000 }, st()).tax).toBeCloseTo(2800, 9);
    // Interest above profit: the credit is limited to 20% of the profit and the rest carries forward.
    const s = st();
    expect(rentalYearTax('uk-finance-credit', { ...base, noi: 5000, interest: 8000 }, s).tax).toBeCloseTo(1000, 9);
    expect(s.financeCf).toBe(3000);
    expect(rentalYearTax('uk-finance-credit', { ...base, noi: 10000, interest: 6000 }, s).tax).toBeCloseTo(4000 - 1800, 9);
    // A loss before finance costs is carried forward, never a refund.
    const s2 = st();
    expect(rentalYearTax('uk-finance-credit', { ...base, noi: -1000, interest: 6000 }, s2).tax).toBe(0);
    expect(s2).toEqual({ lossCf: 1000, financeCf: 6000 });
  });
  it('India house property: 30% standard deduction on rent less municipal tax, then interest; loss set-off capped', () => {
    // Rent 3,60,000, municipal tax 10,000: NAV 3,50,000, 70% = 2,45,000, less interest 1,00,000 = 1,45,000 at 30%.
    const r = rentalYearTax('india-house-property', { ...base, noi: 999999, effectiveGrossIncome: 360000, propertyTaxes: 10000, interest: 100000, ratePct: 30 }, st());
    expect(r.taxableProfit).toBeCloseTo(145000, 6);
    expect(r.tax).toBeCloseTo(43500, 6);
    const s = st();
    const loss = rentalYearTax('india-house-property', { ...base, noi: 0, effectiveGrossIncome: 360000, propertyTaxes: 10000, interest: 600000, ratePct: 30, lossRelief: 'capped', lossCap: 200000 }, s);
    expect(loss.taxableProfit).toBeCloseTo(-355000, 6);
    expect(loss.tax).toBeCloseTo(-60000, 6);
    expect(s.lossCf).toBeCloseTo(155000, 6);
  });
});

describe('analysis with a tax model', () => {
  it('after-tax cash flow = cash flow - tax, and the steps end with the total ROI', () => {
    const i: RentalPropertyInput = { ...us, taxModel: 'uk-finance-credit', depreciation: 0, repayment: 'interest-only', taxRate: 40 };
    const { results, metrics } = analyzeRentalProperty(i);
    for (const r of results) expect(Math.abs(r.afterTaxCashFlow - (r.cashFlow - r.tax))).toBeLessThanOrEqual(1);
    const steps = realEstateInvestmentSteps(i);
    expect(steps[steps.length - 1].result).toBe(`${metrics.totalROI}%`);
    expect(steps.find((s) => s.label === 'After-tax cash flow, year 1')).toBeTruthy();
  });
});
