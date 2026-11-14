import { describe, it, expect } from 'vitest';
import {
  monthlyPayment,
  amortize,
  yearlySummary,
  effectiveAnnualRate,
  formatPaymentDate,
  formatDuration,
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
  calculateApr,
  solveRate,
  aprIfRepaidAfter,
} from '@/lib/tools/calculators/loans';

const cents = (x: number) => Math.round(x * 100) / 100;

describe('monthlyPayment (annuity formula)', () => {
  it('matches published mortgage payment tables', () => {
    expect(cents(monthlyPayment(200000, 6, 360))).toBe(1199.1);
    expect(cents(monthlyPayment(100000, 5, 360))).toBe(536.82);
    expect(cents(monthlyPayment(30000, 5, 60))).toBe(566.14);
    expect(cents(monthlyPayment(30000, 6, 120))).toBe(333.06);
  });
  it('splits evenly at 0% and rejects bad input', () => {
    expect(monthlyPayment(12000, 0, 12)).toBe(1000);
    expect(monthlyPayment(0, 5, 12)).toBe(0);
    expect(monthlyPayment(1000, 5, 0)).toBe(0);
    expect(monthlyPayment(NaN, 5, 12)).toBe(0);
  });
});

describe('amortize', () => {
  it('pays a 30-year 6% loan to exactly zero with the textbook total interest', () => {
    const a = amortize(200000, 6, 360);
    expect(a.months).toBe(360);
    expect(a.rows[0].interest).toBeCloseTo(1000, 6);
    expect(cents(a.rows[0].principal)).toBe(199.1);
    expect(a.rows[359].balance).toBe(0);
    expect(cents(a.totalInterest)).toBe(231676.38);
  });
  it('extra principal shortens the loan (independently simulated: 295 months, 182,537.97 interest)', () => {
    const a = amortize(200000, 6, 360, { monthly: 100 });
    expect(a.months).toBe(295);
    expect(cents(a.totalInterest)).toBeCloseTo(182537.97, 1);
  });
  it('applies yearly extras on every 12th payment and one-time lump sums once', () => {
    const a = amortize(10000, 0, 100, { yearly: 500, oneTime: [{ month: 3, amount: 1000 }] });
    expect(a.rows[2].extra).toBe(1000);
    expect(a.rows[11].extra).toBe(500);
    expect(a.rows[10].extra).toBe(0);
  });
  it('never overpays on the last month', () => {
    const a = amortize(1000, 12, 12, { oneTime: [{ month: 1, amount: 5000 }] });
    expect(a.months).toBe(1);
    expect(a.rows[0].balance).toBe(0);
    expect(cents(a.totalPaid)).toBe(1010);
  });
  it('stops instead of looping when the payment does not cover interest', () => {
    const a = amortize(10000, 24, 12, {}, { payment: 100 });
    expect(a.months).toBeLessThan(5);
  });
  it('groups monthly rows into loan years', () => {
    const y = yearlySummary(amortize(200000, 6, 360).rows);
    expect(y).toHaveLength(30);
    expect(cents(y[0].interest)).toBeCloseTo(11933.18, 0);
    expect(y[29].balance).toBe(0);
  });
});

describe('dates and rates', () => {
  it('labels payment dates across year boundaries', () => {
    expect(formatPaymentDate(2026, 12, 1)).toBe('Dec 2026');
    expect(formatPaymentDate(2026, 12, 2)).toBe('Jan 2027');
    expect(formatPaymentDate(2026, 1, 360)).toBe('Dec 2055');
  });
  it('formats durations', () => {
    expect(formatDuration(295)).toBe('24 years 7 months');
    expect(formatDuration(12)).toBe('1 year');
    expect(formatDuration(0)).toBe('0 months');
  });
  it('12% compounded monthly is 12.6825% effective', () => {
    expect(effectiveAnnualRate(12)).toBeCloseTo(12.6825, 4);
  });
});

describe('calculateMortgage', () => {
  const base = { homePrice: 400000, downPayment: 40000, ratePct: 6.5, termYears: 30, propertyTaxYearly: 4800, insuranceYearly: 1500, pmiRatePct: 0.5, hoaMonthly: 50 };
  it('builds PITI + PMI + HOA', () => {
    const r = calculateMortgage(base)!;
    expect(r.loanAmount).toBe(360000);
    expect(r.ltvPct).toBe(90);
    expect(cents(r.principalAndInterest)).toBe(2275.44);
    expect(r.monthlyTax).toBe(400);
    expect(r.monthlyInsurance).toBe(125);
    expect(r.monthlyPmi).toBe(150);
    expect(cents(r.monthlyTotal)).toBe(cents(2275.44 + 400 + 125 + 150 + 50));
  });
  it('drops PMI at 78% of value (payment 109) and allows a request at 80% (payment 95)', () => {
    const r = calculateMortgage(base)!;
    expect(r.pmiLastMonth).toBe(109);
    expect(r.pmiRequestMonth).toBe(95);
    expect(r.pmiScheduledAutoMonth).toBe(109);
    expect(r.totalPmi).toBe(150 * 109);
  });
  it('extra payments move PMI removal earlier and save interest', () => {
    const r = calculateMortgage({ ...base, extraMonthly: 300 })!;
    expect(r.pmiLastMonth).toBeLessThan(109);
    expect(r.pmiScheduledAutoMonth).toBe(109);
    expect(r.monthsSaved).toBeGreaterThan(60);
    expect(r.interestSaved).toBeCloseTo(r.baseline.totalInterest - r.schedule.totalInterest, 6);
  });
  it('charges no PMI with 20% down', () => {
    const r = calculateMortgage({ ...base, downPayment: 80000 })!;
    expect(r.monthlyPmi).toBe(0);
    expect(r.pmiLastMonth).toBe(0);
    expect(r.totalPmi).toBe(0);
  });
  it('rejects impossible inputs', () => {
    expect(calculateMortgage({ ...base, downPayment: 400000 })).toBeNull();
    expect(calculateMortgage({ ...base, ratePct: -1 })).toBeNull();
    expect(calculateMortgage({ ...base, termYears: 0 })).toBeNull();
  });
  it('handles a 0% rate', () => {
    const r = calculateMortgage({ ...base, ratePct: 0, pmiRatePct: 0 })!;
    expect(r.principalAndInterest).toBe(1000);
    expect(r.totalInterest).toBe(0);
  });
});

describe('calculateAffordability', () => {
  const input = { annualIncome: 120000, monthlyDebts: 500, downPayment: 60000, ratePct: 6.5, termYears: 30, propertyTaxRatePct: 1.2, insuranceYearly: 1500, hoaMonthly: 0, pmiRatePct: 0.5, frontEndPct: 28, backEndPct: 36 };
  it('front-end 28% binds when debts are light', () => {
    const r = calculateAffordability(input)!;
    expect(r.frontEndBudget).toBe(2800);
    expect(r.backEndBudget).toBe(3100);
    expect(r.binding).toBe('front-end');
    expect(r.housingPayment).toBeCloseTo(2800, 2);
    expect(r.maxPrice).toBeCloseTo(397971.15, 0);
    expect(housingCostForPrice(r.maxPrice * 1.001, input).total).toBeGreaterThan(2800);
    expect(r.frontEndRatio).toBeCloseTo(28, 4);
  });
  it('back-end 36% binds when debts are heavy', () => {
    const r = calculateAffordability({ ...input, monthlyDebts: 1500 })!;
    expect(r.binding).toBe('back-end');
    expect(r.housingPayment).toBeCloseTo(2100, 2);
    expect(r.backEndRatio).toBeCloseTo(36, 4);
  });
  it('a back-end-only limit (VA style) ignores the front-end ratio', () => {
    const r = calculateAffordability({ ...input, frontEndPct: 0, backEndPct: 41 })!;
    expect(r.binding).toBe('back-end');
    expect(r.housingPayment).toBeCloseTo(4100 - 500, 2);
  });
  it('returns the down payment only when debts use up the budget', () => {
    const r = calculateAffordability({ ...input, monthlyDebts: 4000 })!;
    expect(r.binding).toBe('down-payment-only');
    expect(r.maxPrice).toBe(60000);
  });
  it('rejects zero income', () => {
    expect(calculateAffordability({ ...input, annualIncome: 0 })).toBeNull();
  });
});

describe('calculateRefinance', () => {
  const input = { currentBalance: 300000, currentRatePct: 7, remainingMonths: 300, newRatePct: 6, newTermMonths: 360, closingCosts: 6000, pointsPct: 0, rollCostsIntoLoan: false, cashOut: 0 };
  it('matches an independent simulation', () => {
    const r = calculateRefinance(input)!;
    expect(cents(r.currentPayment)).toBe(2120.34);
    expect(cents(r.newPayment)).toBe(1798.65);
    expect(cents(r.monthlySavings)).toBe(321.69);
    expect(r.simpleBreakEvenMonth).toBe(19);
    expect(r.breakEvenMonth).toBe(25);
    expect(cents(r.currentRemainingInterest)).toBeCloseTo(336101.28, 0);
    expect(cents(r.newTotalInterest)).toBeCloseTo(347514.57, 0);
    expect(r.interestDifference).toBeLessThan(0); // the longer term costs more interest overall
  });
  it('rolled-in costs and points enlarge the new loan', () => {
    const r = calculateRefinance({ ...input, rollCostsIntoLoan: true, pointsPct: 1 })!;
    expect(r.totalCosts).toBe(9000);
    expect(r.newLoanAmount).toBe(309000);
    expect(r.upfrontCash).toBe(0);
  });
  it('cash out adds to the loan but counts as money received', () => {
    const r = calculateRefinance({ ...input, cashOut: 50000, closingCosts: 0 })!;
    expect(r.newLoanAmount).toBe(350000);
    expect(r.netByMonth[0].net).toBeGreaterThan(-1);
  });
  it('no savings gives no simple break-even', () => {
    const r = calculateRefinance({ ...input, newRatePct: 8, newTermMonths: 300 })!;
    expect(r.monthlySavings).toBeLessThan(0);
    expect(r.simpleBreakEvenMonth).toBe(0);
    expect(r.breakEvenMonth).toBe(0);
  });
});

describe('calculateAutoLoan', () => {
  const input = { price: 35000, downPayment: 5000, tradeInValue: 8000, tradeInOwed: 3000, salesTaxPct: 7, taxAfterTradeIn: true, fees: 500, financeTaxAndFees: true, ratePct: 5, termMonths: 60 };
  it('taxes price minus trade-in and finances tax and fees', () => {
    const r = calculateAutoLoan(input)!;
    expect(r.salesTax).toBeCloseTo(1890, 6); // 7% of 27,000
    expect(r.tradeEquity).toBe(5000);
    expect(r.loanAmount).toBeCloseTo(35000 - 5000 - 5000 + 1890 + 500, 6);
    expect(cents(r.payment)).toBe(cents(monthlyPayment(27390, 5, 60)));
    expect(r.schedule.rows).toHaveLength(60);
  });
  it('taxes the full price where trade-ins get no credit, and pays tax up front when asked', () => {
    const r = calculateAutoLoan({ ...input, taxAfterTradeIn: false, financeTaxAndFees: false })!;
    expect(r.salesTax).toBeCloseTo(2450, 6);
    expect(r.loanAmount).toBe(25000);
    expect(r.upfront).toBeCloseTo(5000 + 2450 + 500, 6);
  });
  it('rolls negative equity into the loan', () => {
    const r = calculateAutoLoan({ ...input, tradeInValue: 3000, tradeInOwed: 6000, salesTaxPct: 0, fees: 0 })!;
    expect(r.loanAmount).toBe(35000 - 5000 + 3000);
  });
  it('a 30,000 loan at 5% for 60 months is 566.14 a month', () => {
    const r = calculateAutoLoan({ ...input, downPayment: 0, tradeInValue: 0, tradeInOwed: 0, price: 30000, salesTaxPct: 0, fees: 0 })!;
    expect(cents(r.payment)).toBe(566.14);
    expect(cents(r.totalInterest)).toBeCloseTo(3968.22, 0);
  });
});

describe('calculateLease', () => {
  it('follows the depreciation + rent charge formula', () => {
    const r = calculateLease({ msrp: 40000, negotiatedPrice: 37000, capCostReduction: 3000, acquisitionFee: 695, otherCapitalizedFees: 0, residualPct: 58, moneyFactor: 0.0025, termMonths: 36, salesTaxPct: 7 })!;
    expect(r.adjustedCapCost).toBe(34695);
    expect(r.residualValue).toBe(23200);
    expect(r.depreciation).toBeCloseTo(11495 / 36, 9);
    expect(r.rentCharge).toBeCloseTo(57895 * 0.0025, 9);
    expect(cents(r.basePayment)).toBe(464.04);
    expect(cents(r.payment)).toBe(496.53);
    expect(r.aprEquivalent).toBeCloseTo(6, 9);
  });
  it('converts money factor and APR with the 2400 rule', () => {
    expect(moneyFactorToApr(0.00125)).toBeCloseTo(3, 9);
    expect(aprToMoneyFactor(4.8)).toBeCloseTo(0.002, 9);
  });
  it('rejects a residual over 100%', () => {
    expect(calculateLease({ msrp: 1, negotiatedPrice: 1, capCostReduction: 0, acquisitionFee: 0, otherCapitalizedFees: 0, residualPct: 120, moneyFactor: 0, termMonths: 36, salesTaxPct: 0 })).toBeNull();
  });
});

describe('simulatePayoff', () => {
  it('one 1,000 debt at 12% with 100 a month clears in 11 months with 58.98 interest', () => {
    const r = simulatePayoff([{ name: 'Card', balance: 1000, aprPct: 12, minPayment: 100 }], 100, 'avalanche');
    expect(r.months).toBe(11);
    expect(cents(r.totalInterest)).toBe(58.98);
    expect(r.balances[0]).toBe(1000);
    expect(r.balances.at(-1)).toBe(0);
  });
  const debts = [
    { name: 'Store card', balance: 800, aprPct: 26, minPayment: 30 },
    { name: 'Visa', balance: 6000, aprPct: 22, minPayment: 150 },
    { name: 'Car', balance: 9000, aprPct: 6, minPayment: 250 },
  ];
  it('snowball clears the smallest balance first, avalanche the highest rate', () => {
    const snow = simulatePayoff(debts, 700, 'snowball');
    const aval = simulatePayoff(debts, 700, 'avalanche');
    expect(snow.order[0].name).toBe('Store card');
    expect(aval.order[0].name).toBe('Store card');
    const debts2 = [{ name: 'Small low', balance: 500, aprPct: 5, minPayment: 25 }, { name: 'Big high', balance: 5000, aprPct: 25, minPayment: 100 }];
    expect(simulatePayoff(debts2, 400, 'snowball').order[0].name).toBe('Small low');
    expect(simulatePayoff(debts2, 400, 'avalanche').order[0].name).toBe('Big high');
  });
  it('avalanche never pays more interest than snowball, and both beat minimums', () => {
    const snow = simulatePayoff(debts, 700, 'snowball');
    const aval = simulatePayoff(debts, 700, 'avalanche');
    const min = simulatePayoff(debts, 700, 'minimum');
    expect(aval.totalInterest).toBeLessThanOrEqual(snow.totalInterest + 1e-6);
    expect(min.totalInterest).toBeGreaterThan(snow.totalInterest);
    expect(min.months!).toBeGreaterThan(aval.months!);
    expect(cents(aval.totalPaid)).toBe(cents(15800 + aval.totalInterest));
  });
  it('flags a debt whose minimum never covers its interest', () => {
    const r = simulatePayoff([{ name: 'Trap', balance: 10000, aprPct: 24, minPayment: 150 }], 150, 'minimum');
    expect(r.months).toBeNull();
    expect(r.stuck).toEqual(['Trap']);
  });
});

describe('calculateDti', () => {
  it('computes front-end and back-end ratios', () => {
    const r = calculateDti(6000, 1500, 600)!;
    expect(r.frontEnd).toBe(25);
    expect(r.backEnd).toBe(35);
    expect(dtiBand(35)).toBe('good');
    expect(dtiBand(43)).toBe('ok');
    expect(dtiBand(49)).toBe('stretched');
    expect(dtiBand(51)).toBe('high');
  });
  it('rejects zero income', () => {
    expect(calculateDti(0, 100, 0)).toBeNull();
  });
});

describe('calculateStudentLoan', () => {
  const base = { balance: 30000, ratePct: 6, termYears: 10, deferMonths: 0, subsidized: false, payInterestWhileDeferred: false, capitalize: true, extraMonthly: 0 };
  it('a 30,000 loan at 6% over 10 years is 333.06 a month', () => {
    const r = calculateStudentLoan(base)!;
    expect(cents(r.payment)).toBe(333.06);
    expect(r.months).toBe(120);
  });
  it('48 months of unsubsidized deferment accrues 7,200 simple interest; capitalized the payment is 413.00', () => {
    const r = calculateStudentLoan({ ...base, deferMonths: 48 })!;
    expect(r.accruedInterest).toBeCloseTo(7200, 6);
    expect(r.repaymentPrincipal).toBeCloseTo(37200, 6);
    expect(cents(r.payment)).toBe(413);
  });
  it('without capitalization the accrued interest is paid first and the payment is 407.49', () => {
    const r = calculateStudentLoan({ ...base, deferMonths: 48, capitalize: false })!;
    expect(r.capitalizedInterest).toBe(0);
    expect(cents(r.payment)).toBe(407.49);
    expect(r.months).toBe(120);
  });
  it('subsidized loans and paying interest in school avoid the accrual', () => {
    expect(calculateStudentLoan({ ...base, deferMonths: 48, subsidized: true })!.repaymentPrincipal).toBe(30000);
    const paid = calculateStudentLoan({ ...base, deferMonths: 48, payInterestWhileDeferred: true })!;
    expect(paid.interestPaidWhileDeferred).toBeCloseTo(7200, 6);
    expect(cents(paid.payment)).toBe(333.06);
  });
  it('extra payments shorten the term', () => {
    const r = calculateStudentLoan({ ...base, extraMonthly: 100 })!;
    expect(r.months).toBeLessThan(120);
    expect(r.totalInterest).toBeLessThan(r.baselineInterest);
  });
});

describe('calculateApr', () => {
  it('200,000 at 6% for 30 years with 4,000 in fees is an APR of about 6.1895%', () => {
    const r = calculateApr({ loanAmount: 200000, ratePct: 6, termMonths: 360, fees: 4000, pointsPct: 0, financeFees: false })!;
    expect(r.amountFinanced).toBe(196000);
    expect(cents(r.payment)).toBe(1199.1);
    expect(r.aprPct).toBeCloseTo(6.189476, 5);
  });
  it('points count as finance charges and financing the fees gives the same APR', () => {
    const paid = calculateApr({ loanAmount: 200000, ratePct: 6, termMonths: 360, fees: 2000, pointsPct: 1, financeFees: false })!;
    expect(paid.financeCharges).toBe(4000);
    expect(paid.aprPct).toBeCloseTo(6.189476, 5);
    const financed = calculateApr({ loanAmount: 196000, ratePct: 6, termMonths: 360, fees: 4000, pointsPct: 0, financeFees: true })!;
    expect(financed.noteAmount).toBe(200000);
    expect(financed.aprPct).toBeCloseTo(6.189476, 5);
  });
  it('APR equals the note rate when there are no fees', () => {
    const r = calculateApr({ loanAmount: 10000, ratePct: 9, termMonths: 36, fees: 0, pointsPct: 0, financeFees: false })!;
    expect(r.aprPct).toBe(9);
    expect(r.effectiveAnnualPct).toBeCloseTo(9.380690, 5);
  });
  it('a fee on a 0% loan produces a positive APR', () => {
    expect(solveRate(9000, 1000, 10)).toBeGreaterThan(0);
    expect(solveRate(10000, 1000, 10)).toBe(0);
  });
  it('rejects fees that swallow the loan', () => {
    expect(calculateApr({ loanAmount: 1000, ratePct: 5, termMonths: 12, fees: 1000, pointsPct: 0, financeFees: false })).toBeNull();
  });
  it('fees cost more per year when the loan is repaid early (5 years: about 6.4842%)', () => {
    const input = { loanAmount: 200000, ratePct: 6, termMonths: 360, fees: 4000, pointsPct: 0, financeFees: false };
    expect(aprIfRepaidAfter(input, 60)!).toBeCloseTo(6.484209, 4);
    expect(aprIfRepaidAfter(input, 360)!).toBeCloseTo(calculateApr(input)!.aprPct, 6);
    expect(aprIfRepaidAfter({ ...input, fees: 0 }, 60)!).toBeCloseTo(6, 6);
  });
});
