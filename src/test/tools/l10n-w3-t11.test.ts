/**
 * Pins the worked examples of the wave 3 batch t11 market versions
 * (src/config/toolContent/l10n/<locale>/w3-t11.ts) to the tools' own
 * functions, so a change in the maths shows up as a failing example.
 */
import { describe, expect, it } from 'vitest';
import { calculateApr } from '@/lib/tools/calculators/loans';
import { calculateBalanceTransfer } from '@/lib/tools/calculators/balance-transfer-calculator';
import { computeSimpleInterest, annualRatePercent, termInYears } from '@/lib/tools/simple-interest-calculator';
import { emiTotals } from '@/lib/tools/steps/s7-emi-calculator';
import { computeCompoundGrowth } from '@/lib/finance/compoundGrowth';
import { computeSip, computeLumpSum } from '@/lib/tools/investment-calculator';
import { portfolioMetrics } from '@/lib/tools/steps/s7-investment-returns-calculator';
import { retirementPlan } from '@/lib/tools/steps/s7-retirement-calculator';

const close = (a: number, b: number, d = 2) => expect(a).toBeCloseTo(b, d);

describe('en-IE apr-calculator examples', () => {
  const apr = (loanAmount: number, ratePct: number, termMonths: number, fees: number) =>
    calculateApr({ loanAmount, ratePct, termMonths, fees, pointsPct: 0, financeFees: false })!;
  it('credit union 1% a month is 12.683% annual effective', () => {
    const r = apr(5000, 12, 36, 0);
    close(r.payment, 166.07);
    close(r.totalInterest, 978.58);
    close(r.effectiveAnnualPct, 12.683, 3);
  });
  it('a €75 fee on a €10,000 five-year loan and on a €3,000 one-year loan', () => {
    const a = apr(10000, 8.25, 60, 75);
    close(a.payment, 203.96);
    close(a.effectiveAnnualPct, 8.915, 3);
    close(a.nominalEffectivePct, 8.569, 3);
    close(a.totalFinanceCharge, 2312.75);
    const b = apr(3000, 8.25, 12, 75);
    close(b.payment, 261.31);
    close(b.effectiveAnnualPct, 13.852, 3);
    close(b.totalInterest, 135.75);
  });
  it('7.20% read as a nominal rate and as an annual effective rate', () => {
    close(apr(10000, 7.2, 60, 0).payment, 198.96);
    close(apr(10000, 1200 * (Math.pow(1.072, 1 / 12) - 1), 60, 0).payment, 197.88);
  });
});

describe('en-IE balance-transfer-calculator examples', () => {
  const base = { balance: 4000, currentAprPct: 22.9, feePct: 0, feeMin: 0, promoAprPct: 0, promoMonths: 9, goToAprPct: 22.9, monthlyPayment: 200 };
  it('9-month 0% offer at €200 a month, with and without a second stamp duty', () => {
    const r = calculateBalanceTransfer(base)!;
    expect([r.transfer.months, r.stay.months]).toEqual([22, 26]);
    close(r.transfer.totalCost, 293.3);
    close(r.stay.totalCost, 1086.58);
    close(r.savings!, 793.27);
    close(r.transfer.balanceAtPromoEnd, 2200);
    close(calculateBalanceTransfer({ ...base, feeMin: 30 })!.savings!, 754.92);
  });
  it('clearing within the offer, a 3% fee for 12 months, and a 13.8% loan', () => {
    const fast = calculateBalanceTransfer({ ...base, monthlyPayment: 450 })!;
    expect(fast.transfer.clearedInPromo).toBe(true);
    close(fast.paymentToClearInPromo, 444.44);
    close(fast.stay.totalCost, 425.56);
    const fee = calculateBalanceTransfer({ ...base, feePct: 3, promoMonths: 12 })!;
    close(fee.fee, 120);
    close(fee.transfer.balanceAtPromoEnd, 1720);
    close(fee.transfer.totalCost, 297.11);
    close(fee.savings!, 789.46);
    close(calculateBalanceTransfer({ ...base, promoAprPct: 13.8, promoMonths: 0, goToAprPct: 13.8 })!.transfer.totalCost, 571.7);
  });
});

describe('simple-interest-calculator examples (en-PH, en-PK)', () => {
  const si = (p: number, rate: number, per: 'year' | 'month', t: number, unit: 'years' | 'months' | 'days') =>
    computeSimpleInterest(p, annualRatePercent(rate, per), termInYears(t, unit))!.interest;
  it('Philippines: BSP caps, a monthly loan and a 30-day term', () => {
    close(si(10000, 6, 'month', 4, 'months'), 2400);
    close(si(10000, 15, 'month', 4, 'months'), 6000);
    close(si(50000, 3, 'month', 6, 'months'), 9000);
    close(si(50000, 36, 'year', 6, 'months'), 9000);
    close(si(10000, 6, 'month', 30, 'days'), 591.78);
  });
  it('Pakistan: National Savings monthly profit', () => {
    close(si(1000000, 12.96, 'year', 1, 'months'), 10800);
    close(si(1000000, 12.96, 'year', 1, 'years'), 129600);
    close(si(100000, 12.96, 'year', 1, 'months'), 1080);
    close(si(100000, 12.12, 'year', 1, 'months'), 1010);
    close(si(500000, 12.12, 'year', 1, 'months'), 5050);
    close(si(500000, 12.12, 'year', 18, 'months'), 90900);
    close(si(200000, 10, 'year', 3, 'months'), 5000);
  });
});

describe('en-NG emi-calculator examples', () => {
  const emi = (price: number, down: number, rate: number, tenure: number) =>
    emiTotals({ loanAmount: price, downPayment: down, rate, tenure, insurance: 0, tax: 0, maintenance: 0, insuranceFreq: 'monthly', taxFreq: 'monthly', maintenanceFreq: 'monthly' })!.loan;
  it('NHF loans at 6% and a 12% comparison', () => {
    const a = emi(20000000, 5000000, 6, 240);
    close(a.emi, 107464.66);
    close(a.totalInterest, 10791518.11);
    close(a.schedule[0].interest, 75000);
    close(a.schedule[0].principal, 32464.66);
    const max = emi(50000000, 0, 6, 360);
    close(max.emi, 299775.26);
    close(max.totalInterest, 57919094.53);
    const short = emi(15000000, 0, 6, 120);
    close(short.emi, 166530.75);
    close(short.totalInterest, 4983690.35);
    const dear = emi(15000000, 0, 12, 240);
    close(dear.emi, 165162.92);
    close(dear.totalInterest, 24639100.81);
  });
});

describe('en-SG interest, investment and returns examples', () => {
  const grow = (principal: number, rate: number, n: number, years: number, contributionsPerYear = 0) =>
    computeCompoundGrowth({ principal, ratePerPeriod: rate / 100 / n, periodsPerYear: n, years, contributionsPerYear });
  it('fixed deposit, savings account crediting and an SSB average return', () => {
    close(computeSimpleInterest(20000, 2, 1)!.interest, 400);
    close(computeSimpleInterest(20000, 2, 1)!.finalAmount, 20400);
    close(grow(20000, 2, 12, 1).finalAmount, 20403.69);
    close(grow(20000, 2, 1, 1).finalAmount, 20400);
    close(grow(20000, 2, 12, 5).finalAmount, 22101.58);
    close(grow(20000, 2, 1, 5).finalAmount, 22081.62);
    close(grow(10000, 2.2, 1, 5).finalAmount, 11149.48);
  });
  it('CPFIS lump sum and monthly plans', () => {
    close(computeLumpSum(30000, 2.5, 120)!.maturity, 38402.54);
    close(computeLumpSum(30000, 4, 120)!.maturity, 44407.33);
    close(computeLumpSum(30000, 5, 120)!.maturity, 48866.84);
    close(computeSip(800, 6, 180)!.maturity, 233818.24);
    close(computeSip(800, 4, 180)!.maturity, 197528.63);
    close(computeSip(800, 2.5, 180)!.maturity, 174862.34);
    close(computeSip(500, 5, 240)!.maturity, 206373.15);
  });
  it('portfolio XIRR with and without dividends, and a CPFIS holding', () => {
    const today = new Date('2026-11-07T00:00:00');
    const buys = ['2024-01-02', '2025-01-02', '2026-01-02'].map((date) => ({ type: 'buy' as const, date, amount: 10000 }));
    const divs = [['2024-08-15', 450], ['2025-08-15', 900], ['2026-08-14', 1350]].map(([date, amount]) => ({ type: 'sell' as const, date: date as string, amount: amount as number }));
    const withDivs = portfolioMetrics([...buys, ...divs], 33200, today)!.summary;
    close(withDivs.returnsPercentage, 21.61);
    close(withDivs.annualizedReturn!, 10.44);
    const noDivs = portfolioMetrics(buys, 33200, today)!.summary;
    close(noDivs.returnsPercentage, 10.67);
    close(noDivs.annualizedReturn!, 5.58);
    close(portfolioMetrics([{ type: 'buy', date: '2023-03-01', amount: 30000 }], 33500, today)!.summary.annualizedReturn!, 3.04);
  });
});

describe('en-NZ retirement-calculator examples', () => {
  const base = {
    householdType: 'single', spouseSocialSecurity: 0, currentAge: 35, retirementAge: 65, lifeExpectancy: 90, monthlyExpenses: 4000,
    inflationRate: 2, retirementIncomeRatio: 80, currentSavings: 30000, monthlyContribution: 240.48, annualIncrease: 3, expectedReturn: 5,
    socialSecurityBenefit: 2405.65, employerMatch: 160, pensionBenefit: 0, hasKids: false, numberOfKids: 0, educationCostPerChild: 0,
    marriageFundPerChild: 0, kidsCurrentAge: 5, healthInsuranceCost: 0, longTermCareFund: 0, healthEmergencyFund: 0,
    publicPensionAge: 65, publicPensionIndexed: true,
  };
  it('NZ Super single, retiring at 60, a 6% rate and a couple', () => {
    const a = retirementPlan(base);
    close(a.need.total, 431656.52);
    close(a.finalSavings, 596308.84);
    close(a.surplus, 164652.31);
    expect(retirementPlan({ ...base, socialSecurityBenefit: 0 }).shortfall).toBeGreaterThan(1100000);
    const early = retirementPlan({ ...base, retirementAge: 60 });
    close(early.need.total, 705960.96);
    close(early.shortfall, 286014.8);
    close(retirementPlan({ ...base, monthlyContribution: 396.73 }).finalSavings, 778375.73);
    const couple = retirementPlan({ ...base, householdType: 'married', socialSecurityBenefit: 1850.51, spouseSocialSecurity: 1850.51, monthlyExpenses: 6000, currentSavings: 60000, monthlyContribution: 480.96, employerMatch: 320 });
    close(couple.need.total, 597195.05);
    close(couple.finalSavings, 1192617.67);
  });
});
