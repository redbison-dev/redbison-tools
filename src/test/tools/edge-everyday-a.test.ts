/**
 * Edge, corner, positive and negative cases for the loan and pay calculators
 * (lane 6 of docs/test-coverage-plan.md). Every expected value comes from a
 * published table or a hand calculation written in the comment beside it.
 */
import { describe, it, expect } from 'vitest';
import {
  monthlyPayment,
  presentValue,
  effectiveAnnualRate,
  paymentDate,
  formatPaymentDate,
  formatDuration,
  amortize,
  yearlySummary,
  firstMonthAtOrBelow,
  calculateMortgage,
  calculateAffordability,
  housingCostForPrice,
  calculateRefinance,
  calculateAutoLoan,
  calculateLease,
  moneyFactorToApr,
  aprToMoneyFactor,
  simulatePayoff,
  calculateDti,
  dtiBand,
  calculateStudentLoan,
  solveRate,
  calculateApr,
  aprIfRepaidAfter,
  type MortgageInput,
  type AffordabilityInput,
  type RefinanceInput,
  type AutoLoanInput,
  type LeaseInput,
  type StudentLoanInput,
  type AprInput,
} from '@/lib/tools/calculators/loans';

const cents = (x: number) => Math.round(x * 100) / 100;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** Closed-form balance after k level payments (independent of the row-by-row loop). */
const closedBalance = (p: number, ratePct: number, pay: number, k: number) => {
  const r = ratePct / 1200;
  const g = Math.pow(1 + r, k);
  return p * g - (pay * (g - 1)) / r;
};

describe('loans: helpers', () => {
  it('monthlyPayment: one-month term repays principal plus one month of interest', () => {
    // 1000 at 12%/yr = 1% for one month -> 1010
    expect(cents(monthlyPayment(1000, 12, 1))).toBe(1010);
    // 0% for one month is the principal itself
    expect(monthlyPayment(1000, 0, 1)).toBe(1000);
  });
  it('monthlyPayment: negatives and infinities give 0, never NaN', () => {
    expect(monthlyPayment(-1000, 5, 12)).toBe(0);
    expect(monthlyPayment(1000, 5, -12)).toBe(0);
    expect(monthlyPayment(1000, Infinity, 12)).toBe(0);
    expect(monthlyPayment(1000, NaN, 12)).toBe(0);
  });
  it('monthlyPayment: huge principal scales linearly (corner)', () => {
    // 200,000 at 6% for 30y = 1,199.10 (published); x 5,000 = 5,995,505.0 for 1e9
    expect(Math.round(monthlyPayment(1e9, 6, 360))).toBe(5995505);
  });
  it('presentValue at 0% is payment x months; otherwise inverts monthlyPayment', () => {
    expect(presentValue(100, 0, 12)).toBe(1200);
    // RATE(12,-100,1000) = 2.9229% per month (Excel worked example) -> PV ~ 1000
    expect(presentValue(100, 0.0292285, 12)).toBeCloseTo(1000, 1);
  });
  it('effectiveAnnualRate: 12% monthly -> 1.01^12 - 1 = 12.6825%', () => {
    expect(effectiveAnnualRate(12)).toBeCloseTo(12.6825, 4);
    expect(effectiveAnnualRate(12, 1)).toBeCloseTo(12, 10);
    expect(effectiveAnnualRate(0)).toBe(0);
  });
  it('paymentDate / formatPaymentDate cross a year end', () => {
    expect(paymentDate(2024, 12, 1)).toEqual({ year: 2024, month: 12 });
    expect(paymentDate(2024, 12, 2)).toEqual({ year: 2025, month: 1 });
    expect(formatPaymentDate(2024, 11, 3)).toBe('Jan 2025');
    // 360th payment from Jan 2025 is Dec 2054
    expect(formatPaymentDate(2025, 1, 360)).toBe('Dec 2054');
  });
  it('formatDuration: singular, plural and zero', () => {
    expect(formatDuration(0)).toBe('0 months');
    expect(formatDuration(1)).toBe('1 month');
    expect(formatDuration(12)).toBe('1 year');
    expect(formatDuration(13)).toBe('1 year 1 month');
    expect(formatDuration(26)).toBe('2 years 2 months');
  });
});

describe('loans: amortize', () => {
  it('0% loan: equal principal-only payments, no interest', () => {
    const a = amortize(1200, 0, 12);
    expect(a.payment).toBe(100);
    expect(a.months).toBe(12);
    expect(a.totalInterest).toBe(0);
    expect(a.rows.every((r) => r.principal === 100)).toBe(true);
    expect(a.rows[11].balance).toBe(0);
  });
  it('principal parts sum to the loan to the cent and the last row is zero', () => {
    const a = amortize(100000, 6, 360);
    expect(cents(sum(a.rows.map((r) => r.principal + r.extra)))).toBe(100000);
    expect(a.rows.at(-1)!.balance).toBe(0);
    // published 100,000 @ 6% / 30y: payment 599.55, total interest 115,838.19
    expect(cents(a.payment)).toBe(599.55);
    expect(cents(a.totalInterest)).toBe(115838.19);
    expect(cents(a.totalPaid)).toBe(cents(100000 + a.totalInterest));
  });
  it('final payment is trimmed when an extra payment overshoots', () => {
    // 1000 at 0% over 10 months with 950 extra in month 1: 100 + 900 (extra capped at remaining) -> done
    const a = amortize(1000, 0, 10, { oneTime: [{ month: 1, amount: 950 }] });
    expect(a.months).toBe(1);
    expect(a.rows[0].extra).toBe(900);
    expect(a.totalPaid).toBe(1000);
  });
  it('one-time extras: month < 1 and non-positive amounts are ignored; duplicates add up', () => {
    const a = amortize(1200, 0, 12, {
      oneTime: [
        { month: 0, amount: 500 },
        { month: 3, amount: -100 },
        { month: 2, amount: 100 },
        { month: 2.4, amount: 100 },
      ],
    });
    expect(a.rows[0].extra).toBe(0);
    expect(a.rows[1].extra).toBe(200);
    expect(a.rows[2].extra).toBe(0);
    // 1200 - 200 extra = 1000 left after 2 payments of 100 -> 10 more payments: 10 months total
    expect(a.months).toBe(10);
  });
  it('yearly extra is applied on payments 12, 24 ...', () => {
    const a = amortize(2400, 0, 24, { yearly: 300 });
    expect(a.rows[10].extra).toBe(0);
    expect(a.rows[11].extra).toBe(300);
  });
  it('payment below the interest stops after two rows instead of looping (negative amortization guard)', () => {
    // 1000 at 12% -> 10 interest; a 5 payment never reduces the balance
    const a = amortize(1000, 12, 12, {}, { payment: 5 });
    expect(a.rows.length).toBe(2);
    expect(a.rows[0].payment).toBe(10);
    expect(a.rows[0].principal).toBe(0);
    expect(a.rows[1].balance).toBe(1000);
  });
  it('yearlySummary groups 13 rows into 2 loan years and adds extra costs', () => {
    const a = amortize(1300, 0, 13);
    const ys = yearlySummary(a.rows, () => 5);
    expect(ys.length).toBe(2);
    expect(ys[0].principal).toBe(1200);
    expect(ys[0].paid).toBe(1200 + 12 * 5);
    expect(ys[1].balance).toBe(0);
    expect(yearlySummary([])).toEqual([]);
  });
  it('firstMonthAtOrBelow returns 0 when never reached', () => {
    const a = amortize(1200, 0, 12);
    expect(firstMonthAtOrBelow(a.rows, 600)).toBe(6);
    expect(firstMonthAtOrBelow(a.rows, -1)).toBe(0);
  });
});

const mortgage = (o: Partial<MortgageInput> = {}): MortgageInput => ({
  homePrice: 300000, downPayment: 60000, ratePct: 6, termYears: 30,
  propertyTaxYearly: 3600, insuranceYearly: 1200, pmiRatePct: 0.5, hoaMonthly: 50, ...o,
});

describe('loans: calculateMortgage', () => {
  it('exactly 20% down: no PMI (LTV 80 is not above 80)', () => {
    const m = calculateMortgage(mortgage())!;
    expect(m.loanAmount).toBe(240000);
    expect(m.ltvPct).toBe(80);
    // 200k @ 6% = 1,199.10 published; 240k = 1,438.92
    expect(cents(m.principalAndInterest)).toBe(1438.92);
    expect(m.monthlyPmi).toBe(0);
    expect(m.pmiLastMonth).toBe(0);
    // 1438.92 + 300 tax + 100 insurance + 50 HOA
    expect(cents(m.monthlyTotal)).toBe(1888.92);
  });
  it('5% down: PMI on the original loan until the balance reaches 78% of value', () => {
    const m = calculateMortgage(mortgage({ homePrice: 200000, downPayment: 10000 }))!;
    // 190,000 x 0.5% / 12 = 79.17
    expect(cents(m.monthlyPmi)).toBe(79.17);
    // independent: first k with closed-form balance <= 156,000 (78%) and <= 160,000 (80%)
    const pay = monthlyPayment(190000, 6, 360);
    let k78 = 1;
    while (closedBalance(190000, 6, pay, k78) > 156000) k78++;
    let k80 = 1;
    while (closedBalance(190000, 6, pay, k80) > 160000) k80++;
    expect(m.pmiLastMonth).toBe(k78);
    expect(m.pmiScheduledAutoMonth).toBe(k78);
    expect(m.pmiRequestMonth).toBe(k80);
    expect(m.totalPmi).toBeCloseTo(m.monthlyPmi * k78, 6);
  });
  it('a one-time extra with no month is applied to payment 1; extras save interest and months', () => {
    const m = calculateMortgage(mortgage({ oneTimeAmount: 10000, extraMonthly: 100, extraYearly: 1000 }))!;
    expect(m.schedule.rows[0].extra).toBe(10000 + 100);
    expect(m.schedule.rows[11].extra).toBe(100 + 1000);
    expect(m.monthsSaved).toBeGreaterThan(0);
    expect(m.interestSaved).toBeGreaterThan(0);
    expect(cents(sum(m.schedule.rows.map((r) => r.principal + r.extra)))).toBe(240000);
  });
  it('negative extras are ignored, not subtracted', () => {
    const m = calculateMortgage(mortgage({ extraMonthly: -500, extraYearly: -500 }))!;
    expect(m.monthsSaved).toBe(0);
    expect(m.schedule.months).toBe(360);
  });
  it('0% interest, 1-year term: 12 equal payments of 1/12', () => {
    const m = calculateMortgage(mortgage({ ratePct: 0, termYears: 1, propertyTaxYearly: 0, insuranceYearly: 0, hoaMonthly: 0 }))!;
    expect(m.principalAndInterest).toBe(20000);
    expect(m.totalInterest).toBe(0);
    expect(m.totalOfPayments).toBe(240000);
  });
  it('rejects invalid input', () => {
    expect(calculateMortgage(mortgage({ downPayment: 300000 }))).toBeNull();
    expect(calculateMortgage(mortgage({ downPayment: -1 }))).toBeNull();
    expect(calculateMortgage(mortgage({ homePrice: NaN }))).toBeNull();
    expect(calculateMortgage(mortgage({ ratePct: -1 }))).toBeNull();
    expect(calculateMortgage(mortgage({ termYears: 0 }))).toBeNull();
  });
  it('a term that rounds to zero months is rejected, not shown as a 0 payment', () => {
    // 0.04 years = 0.48 months -> 0 payments: no valid schedule exists
    expect(calculateMortgage(mortgage({ termYears: 0.04 }))).toBeNull();
  });
});

const afford = (o: Partial<AffordabilityInput> = {}): AffordabilityInput => ({
  annualIncome: 120000, monthlyDebts: 0, downPayment: 0, ratePct: 0, termYears: 30,
  propertyTaxRatePct: 0, insuranceYearly: 0, hoaMonthly: 0, pmiRatePct: 0,
  frontEndPct: 28, backEndPct: 36, ...o,
});

describe('loans: calculateAffordability', () => {
  it('front-end binding at 0%: 28% of 10,000/month x 360 months', () => {
    const a = calculateAffordability(afford())!;
    expect(a.binding).toBe('front-end');
    expect(a.frontEndBudget).toBe(2800);
    expect(a.backEndBudget).toBe(3600);
    expect(Math.round(a.maxPrice)).toBe(1008000);
    expect(a.frontEndRatio).toBeCloseTo(28, 6);
  });
  it('back-end binding when debts are large: (3600 - 1000) x 360', () => {
    const a = calculateAffordability(afford({ monthlyDebts: 1000 }))!;
    expect(a.binding).toBe('back-end');
    expect(Math.round(a.maxPrice)).toBe(936000);
    expect(a.backEndRatio).toBeCloseTo(36, 6);
  });
  it('front-end limit 0 means no front-end limit', () => {
    const a = calculateAffordability(afford({ frontEndPct: 0 }))!;
    expect(a.frontEndBudget).toBe(Infinity);
    expect(a.binding).toBe('back-end');
    expect(Math.round(a.maxPrice)).toBe(3600 * 360);
  });
  it('debts above the back-end budget: you can only afford the down payment', () => {
    const a = calculateAffordability(afford({ monthlyDebts: 4000, downPayment: 25000 }))!;
    expect(a.binding).toBe('down-payment-only');
    expect(a.maxPrice).toBe(25000);
    expect(a.maxHousingPayment).toBe(0);
    expect(a.downPaymentPct).toBe(100);
  });
  it('zero down and no budget: max price 0 and 0% down (no divide by zero)', () => {
    const a = calculateAffordability(afford({ monthlyDebts: 4000 }))!;
    expect(a.maxPrice).toBe(0);
    expect(a.downPaymentPct).toBe(0);
  });
  it('housingCostForPrice: PMI only above 80% LTV', () => {
    const base = { downPayment: 20000, ratePct: 0, termYears: 10, propertyTaxRatePct: 1.2, insuranceYearly: 1200, hoaMonthly: 0, pmiRatePct: 1 };
    // price 100k, loan 80k: exactly 80%, no PMI; tax 1200/12 = 100; P&I 80000/120 = 666.67
    const at80 = housingCostForPrice(100000, base);
    expect(at80.pmi).toBe(0);
    expect(cents(at80.total)).toBe(cents(80000 / 120 + 100 + 100));
    // price 100,001 -> loan above 80%: PMI = 80,001 x 1% / 12
    expect(housingCostForPrice(100001, base).pmi).toBeCloseTo(80001 / 1200, 6);
    // price below the down payment: loan 0
    expect(housingCostForPrice(10000, base).loan).toBe(0);
  });
  it('rejects invalid input', () => {
    expect(calculateAffordability(afford({ annualIncome: 0 }))).toBeNull();
    expect(calculateAffordability(afford({ backEndPct: 0 }))).toBeNull();
    expect(calculateAffordability(afford({ monthlyDebts: -1 }))).toBeNull();
    expect(calculateAffordability(afford({ ratePct: NaN }))).toBeNull();
  });
});

const refi = (o: Partial<RefinanceInput> = {}): RefinanceInput => ({
  currentBalance: 200000, currentRatePct: 6, remainingMonths: 360, newRatePct: 5, newTermMonths: 360,
  closingCosts: 3000, pointsPct: 0, rollCostsIntoLoan: false, cashOut: 0, ...o,
});

describe('loans: calculateRefinance', () => {
  it('6% -> 5% on 200k/30y: savings 1,199.10 - 1,073.64 and break-even ceil(3000/125.46) = 24', () => {
    const r = calculateRefinance(refi())!;
    expect(cents(r.currentPayment)).toBe(1199.1);
    expect(cents(r.newPayment)).toBe(1073.64);
    expect(r.simpleBreakEvenMonth).toBe(24);
    expect(r.upfrontCash).toBe(3000);
    expect(r.breakEvenMonth).toBeGreaterThan(0);
  });
  it('rolling costs and points into the loan: 200k + 1% points (2,000) + 3,000', () => {
    const r = calculateRefinance(refi({ pointsPct: 1, rollCostsIntoLoan: true }))!;
    expect(r.totalCosts).toBe(5000);
    expect(r.newLoanAmount).toBe(205000);
    expect(r.upfrontCash).toBe(0);
  });
  it('same rate and term with no costs breaks even immediately; no savings -> simple break-even 0', () => {
    const r = calculateRefinance(refi({ newRatePct: 6, closingCosts: 0 }))!;
    expect(r.monthlySavings).toBeCloseTo(0, 9);
    expect(r.simpleBreakEvenMonth).toBe(0);
    expect(r.breakEvenMonth).toBe(1);
  });
  it('a higher new rate never breaks even within the term', () => {
    const r = calculateRefinance(refi({ newRatePct: 8, newTermMonths: 360 }))!;
    expect(r.simpleBreakEvenMonth).toBe(0);
    expect(r.breakEvenMonth).toBe(0);
    expect(r.interestDifference).toBeLessThan(0);
  });
  it('shorter new term: horizon covers the longer loan, missing rows count as 0', () => {
    const r = calculateRefinance(refi({ newTermMonths: 180, closingCosts: 0 }))!;
    expect(r.netByMonth.length).toBe(360);
    expect(r.netByMonth[200].newBalance).toBe(0);
  });
  it('rejects invalid input, including terms that round to zero months', () => {
    expect(calculateRefinance(refi({ currentBalance: 0 }))).toBeNull();
    expect(calculateRefinance(refi({ closingCosts: -1 }))).toBeNull();
    expect(calculateRefinance(refi({ cashOut: -1 }))).toBeNull();
    expect(calculateRefinance(refi({ pointsPct: NaN }))).toBeNull();
    expect(calculateRefinance(refi({ remainingMonths: 0.4 }))).toBeNull();
    expect(calculateRefinance(refi({ newTermMonths: 0.4 }))).toBeNull();
  });
});

const auto = (o: Partial<AutoLoanInput> = {}): AutoLoanInput => ({
  price: 30000, downPayment: 5000, tradeInValue: 0, tradeInOwed: 0, salesTaxPct: 0,
  taxAfterTradeIn: true, fees: 0, financeTaxAndFees: false, ratePct: 5, termMonths: 60, ...o,
});

describe('loans: calculateAutoLoan', () => {
  it('25,000 at 5% for 60 months: 30,000 -> 566.14 published, so 25,000 -> 471.78', () => {
    const a = calculateAutoLoan(auto())!;
    expect(a.loanAmount).toBe(25000);
    expect(cents(a.payment)).toBe(471.78);
    expect(cents(sum(a.schedule.rows.map((r) => r.principal)))).toBe(25000);
  });
  it('sales tax after trade-in vs on the full price (7%)', () => {
    expect(calculateAutoLoan(auto({ tradeInValue: 10000, salesTaxPct: 7 }))!.salesTax).toBeCloseTo(1400, 9);
    expect(calculateAutoLoan(auto({ tradeInValue: 10000, salesTaxPct: 7, taxAfterTradeIn: false }))!.salesTax).toBeCloseTo(2100, 9);
  });
  it('negative trade-in equity is rolled into the loan; tax and fees financed', () => {
    // 30,000 - 5,000 + 3,000 owed beyond value + 2,100 tax + 500 fees
    const a = calculateAutoLoan(auto({ tradeInValue: 5000, tradeInOwed: 8000, salesTaxPct: 7, taxAfterTradeIn: false, fees: 500, financeTaxAndFees: true }))!;
    expect(a.tradeEquity).toBe(-3000);
    expect(a.loanAmount).toBeCloseTo(30600, 6);
    expect(a.upfront).toBe(5000);
  });
  it('down payment covers the price: no loan, cost is price + tax + fees', () => {
    const a = calculateAutoLoan(auto({ downPayment: 30000, salesTaxPct: 5, fees: 100 }))!;
    expect(a.loanAmount).toBe(0);
    expect(a.payment).toBe(0);
    expect(a.schedule.rows).toEqual([]);
    expect(a.totalCost).toBe(30000 + 1500 + 100);
    expect(a.upfront).toBe(30000 + 1500 + 100);
  });
  it('rejects invalid input, including a term below one month', () => {
    expect(calculateAutoLoan(auto({ price: 0 }))).toBeNull();
    expect(calculateAutoLoan(auto({ fees: -1 }))).toBeNull();
    expect(calculateAutoLoan(auto({ tradeInOwed: -1 }))).toBeNull();
    expect(calculateAutoLoan(auto({ ratePct: Infinity }))).toBeNull();
    expect(calculateAutoLoan(auto({ termMonths: 0.4 }))).toBeNull();
  });
});

const lease = (o: Partial<LeaseInput> = {}): LeaseInput => ({
  msrp: 30000, negotiatedPrice: 28000, capCostReduction: 2000, acquisitionFee: 0, otherCapitalizedFees: 0,
  residualPct: 60, moneyFactor: 0.0025, termMonths: 36, salesTaxPct: 0, ...o,
});

describe('loans: calculateLease', () => {
  it('textbook lease: depreciation (26000-18000)/36 + rent (26000+18000) x 0.0025', () => {
    const l = calculateLease(lease())!;
    expect(l.adjustedCapCost).toBe(26000);
    expect(l.residualValue).toBe(18000);
    expect(cents(l.depreciation)).toBe(222.22);
    expect(cents(l.rentCharge)).toBe(110);
    expect(cents(l.basePayment)).toBe(332.22);
    expect(l.aprEquivalent).toBe(6);
  });
  it('sales tax on the payment, negative fees ignored', () => {
    const l = calculateLease(lease({ salesTaxPct: 10, acquisitionFee: -500, otherCapitalizedFees: -100 }))!;
    expect(l.grossCapCost).toBe(28000);
    expect(l.tax).toBeCloseTo(l.basePayment * 0.1, 9);
    expect(l.totalLeaseCost).toBeCloseTo(l.payment * 36 + 2000, 6);
  });
  it('residual 0% and 100% are accepted edges; 0 money factor = no rent charge', () => {
    expect(calculateLease(lease({ residualPct: 0, moneyFactor: 0 }))!.basePayment).toBeCloseTo(26000 / 36, 9);
    expect(calculateLease(lease({ residualPct: 100 }))).not.toBeNull();
  });
  it('money factor <-> APR: 0.00125 x 2400 = 3%', () => {
    expect(moneyFactorToApr(0.00125)).toBe(3);
    expect(aprToMoneyFactor(3)).toBe(0.00125);
  });
  it('rejects invalid input', () => {
    expect(calculateLease(lease({ residualPct: 101 }))).toBeNull();
    expect(calculateLease(lease({ residualPct: -1 }))).toBeNull();
    expect(calculateLease(lease({ capCostReduction: 28000 }))).toBeNull();
    expect(calculateLease(lease({ capCostReduction: -1 }))).toBeNull();
    expect(calculateLease(lease({ moneyFactor: NaN }))).toBeNull();
    // a term rounding to 0 months used to give an Infinity depreciation
    expect(calculateLease(lease({ termMonths: 0.3 }))).toBeNull();
  });
});

describe('loans: simulatePayoff', () => {
  it('0% debt: 1000 at 100/month clears in 10 months with no interest', () => {
    const r = simulatePayoff([{ name: 'A', balance: 1000, aprPct: 0, minPayment: 100 }], 100, 'avalanche');
    expect(r.months).toBe(10);
    expect(r.totalInterest).toBe(0);
    expect(r.totalPaid).toBe(1000);
    expect(r.balances.length).toBe(11);
  });
  it('avalanche pays the highest APR first, snowball the smallest balance', () => {
    const debts = [
      { name: 'Small', balance: 300, aprPct: 12, minPayment: 0 },
      { name: 'Costly', balance: 600, aprPct: 24, minPayment: 0 },
    ];
    // avalanche month 1: interest 3 + 12; Costly 612 gets the full 400 -> Small cleared later
    const av = simulatePayoff(debts, 400, 'avalanche');
    const sb = simulatePayoff(debts, 400, 'snowball');
    expect(av.order[0].name).toBe('Costly');
    expect(sb.order[0].name).toBe('Small');
    expect(sb.order[0].month).toBe(1);
    expect(av.totalInterest).toBeLessThan(sb.totalInterest);
  });
  it('hand-checked avalanche run: 3 months and 18.2912 interest', () => {
    // m1: A 600@12 -> 606, B 300@24 -> 306; pay B 306, A 94 -> A 512
    // m2: A 517.12 -> pay 400 -> 117.12; m3: 118.2912 -> cleared
    const r = simulatePayoff([
      { name: 'A', balance: 600, aprPct: 12, minPayment: 0 },
      { name: 'B', balance: 300, aprPct: 24, minPayment: 0 },
    ], 400, 'avalanche');
    expect(r.months).toBe(3);
    expect(r.totalInterest).toBeCloseTo(18.2912, 6);
    expect(r.totalPaid).toBeCloseTo(918.2912, 6);
    expect(r.order).toEqual([
      { name: 'B', month: 1, interest: 6 },
      { name: 'A', month: 3, interest: expect.closeTo(12.2912, 6) },
    ]);
  });
  it('minimum-only payment below the interest never clears: months null, debt reported stuck', () => {
    // 1000 @ 24% accrues 20/month; a 10 minimum never catches up
    const r = simulatePayoff([{ name: 'Card', balance: 1000, aprPct: 24, minPayment: 10 }], 0, 'minimum');
    expect(r.months).toBeNull();
    expect(r.stuck).toEqual(['Card']);
    expect(r.balances.length).toBe(601);
  });
  it('zero-balance and negative-balance debts are skipped; empty list is done at month 0', () => {
    const r = simulatePayoff([{ name: 'Z', balance: 0, aprPct: 10, minPayment: 10 }, { name: 'N', balance: -5, aprPct: 10, minPayment: 10 }], 100, 'snowball');
    expect(r.months).toBe(0);
    expect(r.order).toEqual([]);
    expect(r.balances).toEqual([0]);
  });
  it('a negative or NaN budget pays nothing instead of growing the debt', () => {
    for (const budget of [-500, NaN]) {
      const r = simulatePayoff([{ name: 'A', balance: 1000, aprPct: 0, minPayment: 100 }], budget, 'avalanche');
      expect(r.months).toBeNull();
      expect(r.totalPaid).toBe(0);
      expect(r.balances.every((b) => b === 1000)).toBe(true);
    }
  });
  it('a negative minimum payment is treated as 0, never as a charge', () => {
    const r = simulatePayoff([{ name: 'A', balance: 1000, aprPct: 0, minPayment: -50 }], 0, 'minimum');
    expect(r.totalPaid).toBe(0);
    expect(r.balances.at(-1)).toBe(1000);
  });
});

describe('loans: DTI', () => {
  it('6000 income, 1500 housing, 600 other -> 25% / 35%', () => {
    expect(calculateDti(6000, 1500, 600)).toEqual({ frontEnd: 25, backEnd: 35, totalDebts: 2100 });
    expect(calculateDti(6000, 0, 0)).toEqual({ frontEnd: 0, backEnd: 0, totalDebts: 0 });
  });
  it('rejects zero income and negative debts', () => {
    expect(calculateDti(0, 1, 1)).toBeNull();
    expect(calculateDti(1000, -1, 0)).toBeNull();
    expect(calculateDti(1000, 0, -1)).toBeNull();
    expect(calculateDti(NaN, 0, 0)).toBeNull();
  });
  it('dtiBand thresholds are inclusive at 36 / 43 / 50', () => {
    expect(dtiBand(36)).toBe('good');
    expect(dtiBand(36.01)).toBe('ok');
    expect(dtiBand(43)).toBe('ok');
    expect(dtiBand(43.01)).toBe('stretched');
    expect(dtiBand(50)).toBe('stretched');
    expect(dtiBand(50.01)).toBe('high');
  });
});

const student = (o: Partial<StudentLoanInput> = {}): StudentLoanInput => ({
  balance: 30000, ratePct: 6.8, termYears: 10, deferMonths: 0, subsidized: false,
  payInterestWhileDeferred: false, capitalize: true, extraMonthly: 0, ...o,
});

describe('loans: calculateStudentLoan', () => {
  it('standard 10-year plan: 30,000 @ 6.8% -> 345.24 (studentaid.gov repayment estimator)', () => {
    const s = calculateStudentLoan(student())!;
    expect(cents(s.payment)).toBe(345.24);
    expect(s.months).toBe(120);
    expect(s.accruedInterest).toBe(0);
    expect(cents(s.totalPaid)).toBe(cents(30000 + s.totalInterest));
  });
  it('6 months unsubsidized deferment: simple interest 30000 x 6.8% x 6/12 = 1,020 capitalized', () => {
    const s = calculateStudentLoan(student({ deferMonths: 6 }))!;
    expect(s.accruedInterest).toBeCloseTo(1020, 9);
    expect(s.capitalizedInterest).toBeCloseTo(1020, 9);
    expect(s.repaymentPrincipal).toBeCloseTo(31020, 9);
    expect(cents(s.payment)).toBe(cents(monthlyPayment(31020, 6.8, 120)));
  });
  it('uncapitalized interest is cleared within the term and paid exactly once', () => {
    const s = calculateStudentLoan(student({ deferMonths: 6, capitalize: false }))!;
    expect(s.outstandingInterest).toBeCloseTo(1020, 9);
    expect(s.months).toBe(120);
    // the payment is between the capitalized-free and capitalized payments
    expect(s.payment).toBeGreaterThan(monthlyPayment(30000, 6.8, 120));
    expect(s.payment).toBeLessThan(monthlyPayment(31020, 6.8, 120));
    expect(s.totalPaid).toBeCloseTo(30000 + s.totalInterest, 4);
  });
  it('subsidized or interest paid while deferred: nothing accrues on the balance', () => {
    expect(calculateStudentLoan(student({ deferMonths: 12, subsidized: true }))!.accruedInterest).toBe(0);
    const p = calculateStudentLoan(student({ deferMonths: 6, payInterestWhileDeferred: true }))!;
    expect(p.interestPaidWhileDeferred).toBeCloseTo(1020, 9);
    expect(p.repaymentPrincipal).toBe(30000);
  });
  it('extra payments shorten the loan', () => {
    const s = calculateStudentLoan(student({ extraMonthly: 200 }))!;
    expect(s.months).toBeLessThan(s.baselineMonths);
    expect(s.baselineMonths).toBe(120);
  });
  it('0% loan: 12,000 over 1 year is 1,000 a month', () => {
    const s = calculateStudentLoan(student({ balance: 12000, ratePct: 0, termYears: 1 }))!;
    expect(s.payment).toBe(1000);
    expect(s.totalInterest).toBe(0);
  });
  it('rejects invalid input, including a term below half a month', () => {
    expect(calculateStudentLoan(student({ balance: 0 }))).toBeNull();
    expect(calculateStudentLoan(student({ deferMonths: -1 }))).toBeNull();
    expect(calculateStudentLoan(student({ extraMonthly: -1 }))).toBeNull();
    expect(calculateStudentLoan(student({ ratePct: NaN }))).toBeNull();
    expect(calculateStudentLoan(student({ termYears: 0.01 }))).toBeNull();
  });
});

const apr = (o: Partial<AprInput> = {}): AprInput => ({
  loanAmount: 200000, ratePct: 6, termMonths: 360, fees: 0, pointsPct: 0, financeFees: false, ...o,
});

describe('loans: APR', () => {
  it('solveRate: RATE(12,-100,1000) = 2.92285% a month (Excel worked example) = 35.074% a year', () => {
    expect(solveRate(1000, 100, 12)).toBeCloseTo(35.074, 2);
  });
  it('solveRate: payments that do not exceed the amount give 0%; bad input gives NaN', () => {
    expect(solveRate(1200, 100, 12)).toBe(0);
    expect(solveRate(0, 100, 12)).toBeNaN();
    expect(solveRate(1000, -1, 12)).toBeNaN();
    expect(solveRate(1000, 100, 0)).toBeNaN();
  });
  it('no fees: APR equals the note rate', () => {
    const a = calculateApr(apr())!;
    expect(a.aprPct).toBe(6);
    expect(a.financeCharges).toBe(0);
  });
  it('fees from proceeds: APR is the rate at which the payments are worth the amount financed (TILA definition)', () => {
    const a = calculateApr(apr({ fees: 2000, pointsPct: 1 }))!;
    expect(a.financeCharges).toBe(4000);
    expect(a.amountFinanced).toBe(196000);
    expect(cents(a.payment)).toBe(1199.1);
    expect(presentValue(a.payment, a.aprPct / 1200, 360)).toBeCloseTo(196000, 2);
    expect(a.aprPct).toBeGreaterThan(6);
    expect(a.totalFinanceCharge).toBeCloseTo(a.totalInterest + 4000, 6);
  });
  it('financed fees raise the note amount', () => {
    const a = calculateApr(apr({ fees: 4000, financeFees: true }))!;
    expect(a.noteAmount).toBe(204000);
    expect(a.amountFinanced).toBe(200000);
  });
  it('rejects invalid input: fees eating the whole loan, negatives, sub-month term', () => {
    expect(calculateApr(apr({ loanAmount: 1000, fees: 1000 }))).toBeNull();
    expect(calculateApr(apr({ fees: -1 }))).toBeNull();
    expect(calculateApr(apr({ pointsPct: NaN }))).toBeNull();
    expect(calculateApr(apr({ termMonths: 0.3 }))).toBeNull();
  });
  it('aprIfRepaidAfter: fees cost more per year when repaid early; full term equals the APR', () => {
    const i = apr({ fees: 4000 });
    const full = calculateApr(i)!.aprPct;
    expect(aprIfRepaidAfter(i, 360)).toBeCloseTo(full, 6);
    expect(aprIfRepaidAfter(i, 999)).toBeCloseTo(full, 6);
    expect(aprIfRepaidAfter(i, 60)!).toBeGreaterThan(full);
    expect(aprIfRepaidAfter(i, 0)).toBeNull();
    expect(aprIfRepaidAfter(apr({ loanAmount: -1 }), 60)).toBeNull();
  });
  it('aprIfRepaidAfter: no fees -> the note rate; 0% note with fees still has a positive cost', () => {
    expect(aprIfRepaidAfter(apr(), 60)).toBeCloseTo(6, 6);
    expect(aprIfRepaidAfter(apr({ ratePct: 0, loanAmount: 12000, termMonths: 12, fees: 0 }), 6)).toBe(0);
    expect(aprIfRepaidAfter(apr({ ratePct: 0, loanAmount: 12000, termMonths: 12, fees: 600 }), 6)!).toBeGreaterThan(0);
  });
});

describe('loans: tiny positive rates (boundary fuzzer regression)', () => {
  // As r -> 0 the annuity payment tends to principal / months; with 1e-300 the naive
  // (1 + r)^n - 1 divisor rounds to 0 and used to give Infinity.
  it('monthlyPayment tends to P / n', () => {
    expect(monthlyPayment(12000, 1e-300, 12)).toBeCloseTo(1000, 9);
    expect(monthlyPayment(240000, 1e-12, 360)).toBeCloseTo(240000 / 360, 6);
    expect(Number.isFinite(monthlyPayment(1e9, 1e-300, 1))).toBe(true);
  });
  it('presentValue tends to payment x months', () => {
    expect(presentValue(100, 1e-300, 12)).toBeCloseTo(1200, 9);
  });
  it('mortgage, auto, student, APR outputs stay finite at a tiny rate', () => {
    expect(calculateMortgage(mortgage({ ratePct: 1e-300 }))!.principalAndInterest).toBeCloseTo(240000 / 360, 6);
    expect(calculateAutoLoan(auto({ ratePct: 1e-300 }))!.payment).toBeCloseTo(25000 / 60, 6);
    expect(calculateStudentLoan(student({ ratePct: 1e-300 }))!.payment).toBeCloseTo(30000 / 120, 6);
    const a = calculateApr(apr({ ratePct: 1e-300, fees: 1000 }))!;
    expect(a.payment).toBeCloseTo(200000 / 360, 6);
    expect(Number.isFinite(a.aprPct)).toBe(true);
    expect(Number.isFinite(aprIfRepaidAfter(apr({ ratePct: 1e-300, fees: 1000 }), 60)!)).toBe(true);
  });
});
