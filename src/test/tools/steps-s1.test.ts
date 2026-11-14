/**
 * Working steps for rollout batch s1 (docs/calculation-standard.md): each
 * steps function's last result equals the calculator's own answer, formatted
 * the way the page shows it, for the page defaults and another case; plus a
 * hand-checked figure and an edge case per tool.
 */
import { describe, expect, it } from 'vitest';
import {
  aprSteps, autoLeaseSteps, autoLoanSteps, mortgageSteps, houseAffordabilitySteps, refinanceSteps, studentLoanSteps,
  debtToIncomeSteps, debtPayoffSteps, breakEvenSteps, marginMarkupSteps, depreciationSteps, commissionSteps, cagrSteps,
  inflationSteps, npvIrrSteps, presentFutureValueSteps, roiSteps, savingsGoalSteps, bondYieldSteps, currencySteps,
  loanMoney, loanPct, bizMoney, bizPct, bizNum, fmtMoney, fmtPct, fmtYears, describeDuration, investMoney, investPct, fmtRate,
} from '@/lib/tools/steps/s1';
import {
  calculateApr, calculateLease, calculateAutoLoan, calculateMortgage, calculateAffordability, calculateRefinance,
  calculateStudentLoan, calculateDti, simulatePayoff, formatPaymentDate, type AprInput, type LeaseInput, type AutoLoanInput,
  type MortgageInput, type AffordabilityInput, type RefinanceInput, type StudentLoanInput, type Debt,
} from '@/lib/tools/calculators/loans';
import { breakEven, solveMarginMarkup, depreciationSchedule, decodeTiers, tieredMarginal, drawSchedule, type DepreciationInputs } from '@/lib/tools/calculators/biz';
import { cagr, cagrEndValue, cagrYears, cpiAdjust, inflateForward, npv, irrAll, futureValue, presentValue, computeRoi, requiredDeposit, periodsToGoal, savingsBalance, type SavingsInput, type TvmInput } from '@/lib/tools/calculators/invest-a';
import { bondPriceFromYield, bondYieldFromPrice } from '@/lib/tools/calculators/invest-b';
import type { ReportStep } from '@/lib/report/model';

const last = (s: ReportStep[]) => s[s.length - 1].result;
const noNaN = (s: ReportStep[]) => expect(s.map((x) => [x.working ?? '', x.result].join(' ')).join(' ')).not.toMatch(/NaN|undefined/);

describe('aprSteps', () => {
  const def: AprInput = { loanAmount: 250000, ratePct: 6.5, termMonths: 360, fees: 3500, pointsPct: 1, financeFees: false };
  it.each([[def], [{ ...def, financeFees: true, fees: 1200, pointsPct: 0 }], [{ ...def, termMonths: 180, ratePct: 5 }]])('ends with the APR the page shows', (i) => {
    const s = aprSteps(i);
    expect(last(s)).toBe(loanPct(calculateApr(i)!.aprPct, 3));
    noNaN(s);
  });
  it('hand check: 250,000 at 6.5% for 30 years pays 1,580.17; 6,000 of charges', () => {
    const s = aprSteps(def);
    expect(s[0].result).toBe('$6,000.00');
    expect(s[2].result).toBe('$1,580.17');
    expect(s[2].working).toContain('6.5%');
  });
  it('no fees: APR equals the note rate; fees as large as the loan give no steps', () => {
    expect(last(aprSteps({ ...def, fees: 0, pointsPct: 0 }))).toBe('6.500%');
    expect(aprSteps({ ...def, fees: 250000, pointsPct: 0 })).toEqual([]);
  });
});

describe('autoLeaseSteps', () => {
  const def: LeaseInput = { msrp: 40000, negotiatedPrice: 37500, capCostReduction: 2000, acquisitionFee: 695, otherCapitalizedFees: 0, residualPct: 58, moneyFactor: 0.0025, termMonths: 36, salesTaxPct: 7 };
  it.each([[def], [{ ...def, termMonths: 24, residualPct: 62, salesTaxPct: 0 }]])('ends with the monthly payment', (i) => {
    expect(last(autoLeaseSteps(i))).toBe(loanMoney(calculateLease(i)!.payment));
  });
  it('hand check: residual 40,000 × 58% = 23,200; depreciation (36,195 − 23,200) / 36 = 360.97', () => {
    const s = autoLeaseSteps(def);
    expect(s[2].result).toBe('$23,200.00');
    expect(s[3].result).toBe('$360.97');
  });
  it('a cap cost wiped out by reductions gives no steps', () => {
    expect(autoLeaseSteps({ ...def, capCostReduction: 50000 })).toEqual([]);
  });
});

describe('autoLoanSteps', () => {
  const def: AutoLoanInput = { price: 35000, downPayment: 5000, tradeInValue: 8000, tradeInOwed: 3000, salesTaxPct: 7, taxAfterTradeIn: true, fees: 600, financeTaxAndFees: true, ratePct: 6.5, termMonths: 60 };
  it.each([[def], [{ ...def, taxAfterTradeIn: false, financeTaxAndFees: false, termMonths: 72 }]])('ends with the monthly payment', (i) => {
    expect(last(autoLoanSteps(i))).toBe(loanMoney(calculateAutoLoan(i)!.payment));
  });
  it('hand check: tax on 27,000 at 7% is 1,890; loan 27,490', () => {
    const s = autoLoanSteps(def);
    expect(s[1].result).toBe('$1,890.00');
    expect(s[3].result).toBe('$27,490.00');
  });
  it('nothing to finance ends at $0.00', () => {
    expect(last(autoLoanSteps({ ...def, downPayment: 40000 }))).toBe('$0.00');
  });
});

describe('mortgageSteps', () => {
  const def: MortgageInput = { homePrice: 400000, downPayment: 40000, ratePct: 6.5, termYears: 30, propertyTaxYearly: 4400, insuranceYearly: 1800, pmiRatePct: 0.5, hoaMonthly: 0 };
  it.each([[def], [{ ...def, downPayment: 100000, termYears: 15, hoaMonthly: 120 }]])('ends with the total monthly payment', (i) => {
    expect(last(mortgageSteps(i))).toBe(loanMoney(calculateMortgage(i)!.monthlyTotal));
  });
  it('hand check: 360,000 at 6.5% over 360 months is 2,275.44 P&I', () => {
    expect(mortgageSteps(def)[1].result).toBe('$2,275.44');
  });
  it('20% down shows no PMI; a zero price gives no steps', () => {
    expect(mortgageSteps({ ...def, downPayment: 80000 })[3].result).toBe('$0.00');
    expect(mortgageSteps({ ...def, homePrice: 0 })).toEqual([]);
  });
});

describe('houseAffordabilitySteps', () => {
  const def: AffordabilityInput = { annualIncome: 120000, monthlyDebts: 500, downPayment: 60000, ratePct: 6.5, termYears: 30, propertyTaxRatePct: 1.1, insuranceYearly: 1800, hoaMonthly: 0, pmiRatePct: 0.5, frontEndPct: 28, backEndPct: 36 };
  it.each([[def], [{ ...def, monthlyDebts: 1500 }], [{ ...def, frontEndPct: 0, backEndPct: 41 }]])('ends with the maximum price in whole units', (i) => {
    expect(last(houseAffordabilitySteps(i))).toBe(loanMoney(calculateAffordability(i)!.maxPrice, 'USD', 0));
  });
  it('hand check: 28% of 10,000 a month is 2,800; 36% less 500 debts is 3,100', () => {
    const s = houseAffordabilitySteps(def);
    expect(s[1].result).toBe('$2,800.00');
    expect(s[2].result).toBe('$3,100.00');
  });
  it('debts above the back-end allowance leave the down payment as the price', () => {
    expect(last(houseAffordabilitySteps({ ...def, monthlyDebts: 5000 }))).toBe('$60,000');
  });
});

describe('refinanceSteps', () => {
  const def: RefinanceInput = { currentBalance: 300000, currentRatePct: 7.25, remainingMonths: 324, newRatePct: 6.25, newTermMonths: 360, closingCosts: 5000, pointsPct: 0, rollCostsIntoLoan: false, cashOut: 0 };
  it.each([[def], [{ ...def, rollCostsIntoLoan: true, pointsPct: 1 }], [{ ...def, newRatePct: 7.5 }]])('ends with the break-even the page shows', (i) => {
    const r = calculateRefinance(i)!;
    expect(last(refinanceSteps(i))).toBe(r.breakEvenMonth ? `${r.breakEvenMonth} months` : 'Never');
  });
  it('hand check: 5,000 / 265.43 rounds up to 19 months', () => {
    const s = refinanceSteps(def);
    expect(s[4].result).toBe('$265.43');
    expect(s[5].result).toBe('19 months');
  });
  it('invalid balance gives no steps', () => {
    expect(refinanceSteps({ ...def, currentBalance: 0 })).toEqual([]);
  });
});

describe('studentLoanSteps', () => {
  const def: StudentLoanInput = { balance: 35000, ratePct: 6.5, termYears: 10, deferMonths: 6, subsidized: false, payInterestWhileDeferred: false, capitalize: false, extraMonthly: 0 };
  it.each([[def], [{ ...def, capitalize: true }], [{ ...def, subsidized: true }], [{ ...def, payInterestWhileDeferred: true }]])('ends with the monthly payment', (i) => {
    expect(last(studentLoanSteps(i))).toBe(loanMoney(calculateStudentLoan(i)!.payment));
  });
  it('hand check: 35,000 × 6.5% × 6 / 12 = 1,137.50 of deferment interest', () => {
    expect(studentLoanSteps(def)[0].result).toBe('$1,137.50');
  });
  it('a zero rate still gives a finite payment', () => {
    const s = studentLoanSteps({ ...def, ratePct: 0 });
    expect(last(s)).toBe('$291.67');
    noNaN(s);
  });
});

describe('debtToIncomeSteps', () => {
  const def = { incomeUnit: 'year' as const, income: 90000, otherIncome: 0, housing: 1900, debts: [420, 250, 120, 0, 0, 0] };
  it.each([[def], [{ ...def, incomeUnit: 'month' as const, income: 6000, otherIncome: 500 }]])('ends with the back-end DTI', (i) => {
    const monthly = i.incomeUnit === 'year' ? (i.income + i.otherIncome) / 12 : i.income + i.otherIncome;
    expect(last(debtToIncomeSteps(i))).toBe(loanPct(calculateDti(monthly, i.housing, 790)!.backEnd, 1));
  });
  it('hand check: 2,690 / 7,500 = 35.9%, front-end 1,900 / 7,500 = 25.3%', () => {
    const s = debtToIncomeSteps(def);
    expect(s[3].result).toBe('25.3%');
    expect(last(s)).toBe('35.9%');
  });
  it('zero income gives no steps', () => {
    expect(debtToIncomeSteps({ ...def, income: 0 })).toEqual([]);
  });
});

describe('debtPayoffSteps', () => {
  const debts: Debt[] = [
    { name: 'Store card', balance: 1200, aprPct: 27.99, minPayment: 40 },
    { name: 'Visa', balance: 6500, aprPct: 22.9, minPayment: 160 },
    { name: 'Personal loan', balance: 4000, aprPct: 11.5, minPayment: 130 },
    { name: 'Car loan', balance: 9000, aprPct: 6.9, minPayment: 275 },
  ];
  const start = { year: 2026, month: 12 };
  it.each([['avalanche'], ['snowball'], ['minimum']] as const)('%s ends with the debt-free date', (strategy) => {
    const r = simulatePayoff(debts, 900, strategy);
    expect(last(debtPayoffSteps(debts, 900, strategy, start))).toBe(formatPaymentDate(start.year, start.month, r.months!));
  });
  it('hand check: first month of interest is 242.12', () => {
    // 1200×27.99/1200 + 6500×22.9/1200 + 4000×11.5/1200 + 9000×6.9/1200 = 27.99 + 124.04 + 38.33 + 51.75
    expect(debtPayoffSteps(debts, 900, 'avalanche', start)[1].result).toBe('$242.12');
  });
  it('a minimum below the interest never pays off; no debts gives no steps', () => {
    expect(last(debtPayoffSteps([{ name: 'Card', balance: 10000, aprPct: 30, minPayment: 100 }], 100, 'minimum', start))).toBe('Not within 50 years');
    expect(debtPayoffSteps([{ name: '', balance: 0, aprPct: 10, minPayment: 0 }], 100, 'avalanche', start)).toEqual([]);
  });
});

describe('breakEvenSteps', () => {
  const money = bizMoney('USD');
  it('defaults end with units for the target profit', () => {
    const s = breakEvenSteps({ fixedCosts: 80000, pricePerUnit: 250, variableCostPerUnit: 150, targetProfit: 20000 });
    const r = breakEven({ fixedCosts: 80000, pricePerUnit: 250, variableCostPerUnit: 150, targetProfit: 20000 });
    expect(last(s)).toBe(`${bizNum(r.value!.targetUnitsWhole, 0)} units`);
  });
  it('without a target ends with break-even revenue', () => {
    const r = breakEven({ fixedCosts: 50000, pricePerUnit: 40, variableCostPerUnit: 25 }).value!;
    expect(last(breakEvenSteps({ fixedCosts: 50000, pricePerUnit: 40, variableCostPerUnit: 25 }))).toBe(money(r.breakEvenRevenue));
  });
  it('hand check: 80,000 / (250 − 150) = 800 units, 200,000 revenue; after-tax 15,000 at 25% needs 20,000 pre-tax', () => {
    const s = breakEvenSteps({ fixedCosts: 80000, pricePerUnit: 250, variableCostPerUnit: 150, targetProfit: 15000, taxRatePct: 25 });
    expect(s[2].result).toBe('800 units');
    expect(s[3].result).toBe('$200,000.00');
    expect(s[4].result).toBe('$20,000.00');
    expect(last(s)).toBe('1,000 units');
  });
  it('price not above variable cost gives no steps', () => {
    expect(breakEvenSteps({ fixedCosts: 1000, pricePerUnit: 10, variableCostPerUnit: 10 })).toEqual([]);
  });
});

describe('marginMarkupSteps', () => {
  it.each([[{ cost: 60, price: 100 }], [{ cost: 60, margin: 40 }], [{ price: 100, markup: 50 }], [{ profit: 25, margin: 20 }], [{ profit: 25, markup: 50 }]])('ends with the gross margin', (k) => {
    expect(last(marginMarkupSteps(k))).toBe(bizPct(solveMarginMarkup(k).value!.margin));
  });
  it('hand check: cost 60 at a 40% margin sells for 100; markup 66.67%', () => {
    const s = marginMarkupSteps({ cost: 60, margin: 40 });
    expect(s[0].result).toBe('$100.00');
    expect(s.find((x) => x.label === 'Markup')!.result).toBe('66.67%');
  });
  it('margin and markup alone give no steps', () => {
    expect(marginMarkupSteps({ margin: 40, markup: 50 })).toEqual([]);
  });
});

describe('depreciationSteps', () => {
  const money = bizMoney('USD');
  const base: DepreciationInputs = { method: 'double-declining', cost: 10000, salvage: 1000, life: 5, factor: 1.5, switchToStraightLine: false, firstYearMonths: 12, totalUnits: 100000, unitsPerYear: [30000, 25000, 20000, 15000, 10000], macrsClass: 5 };
  it.each([['straight-line'], ['double-declining'], ['declining-balance'], ['sum-of-years'], ['units-of-production'], ['macrs']] as const)('%s ends with the final book value', (method) => {
    const i = { ...base, method };
    const rows = depreciationSchedule(i).value!.rows;
    const s = depreciationSteps(i);
    expect(last(s)).toBe(money(rows[rows.length - 1].endingBookValue));
    expect(s.find((x) => x.label.startsWith('Year 1'))!.result).toBe(money(rows[0].depreciation));
    noNaN(s);
  });
  it('hand check: DDB year 1 = 10,000 × 40% = 4,000; SYD year 1 = 9,000 × 5/15 = 3,000; MACRS 5-year year 1 = 20%', () => {
    expect(depreciationSteps(base).find((x) => x.label.startsWith('Year 1'))!.result).toBe('$4,000.00');
    expect(depreciationSteps({ ...base, method: 'sum-of-years' }).find((x) => x.label.startsWith('Year 1'))!.result).toBe('$3,000.00');
    expect(depreciationSteps({ ...base, method: 'macrs' }).find((x) => x.label.startsWith('Year 1'))!.result).toBe('$2,000.00');
  });
  it('part first year and an invalid life', () => {
    const i = { ...base, method: 'straight-line' as const, firstYearMonths: 6 };
    expect(depreciationSteps(i).find((x) => x.label.startsWith('Year 1'))!.result).toBe('$900.00');
    expect(depreciationSteps({ ...base, life: 0 })).toEqual([]);
  });
});

describe('commissionSteps', () => {
  const money = bizMoney('USD');
  const tiers = decodeTiers('10000:5,20000:7,:10');
  const def = { plan: 'flat' as const, sales: 25000, ratePct: 6, base: 0, tiers, tierType: 'marginal' as const, draw: 2000, periods: [15000, 40000, 30000, 55000], recoverable: true };
  it('flat ends with total pay', () => {
    expect(last(commissionSteps(def))).toBe(money(1500));
    expect(last(commissionSteps({ ...def, base: 3000 }))).toBe(money(4500));
  });
  it('hand check: marginal tiers on 25,000 pay 500 + 700 + 500 = 1,700; whole-amount pays 2,500', () => {
    expect(last(commissionSteps({ ...def, plan: 'tiered' }))).toBe(money(tieredMarginal(25000, tiers).total));
    expect(last(commissionSteps({ ...def, plan: 'tiered' }))).toBe('$1,700.00');
    expect(last(commissionSteps({ ...def, plan: 'tiered', tierType: 'whole' }))).toBe('$2,500.00');
  });
  it('draw ends with the total paid', () => {
    const rows = drawSchedule(def.periods.map((p) => (p * 6) / 100), 2000, true);
    expect(last(commissionSteps({ ...def, plan: 'draw' }))).toBe(money(rows.reduce((a, r) => a + r.payout, 0)));
    expect(last(commissionSteps({ ...def, plan: 'draw', recoverable: false }))).toBe('$9,700.00'); // 2,000 + 2,400 + 2,000 + 3,300
  });
  it('zero sales: total pay is the base; empty draw periods give no steps', () => {
    expect(last(commissionSteps({ ...def, sales: 0, base: 2000 }))).toBe('$2,000.00');
    expect(commissionSteps({ ...def, plan: 'draw', periods: [] })).toEqual([]);
  });
});

describe('cagrSteps', () => {
  it('rate mode ends with CAGR to 2 dp (hand check: 1.9^(1/5) − 1 = 13.70%)', () => {
    expect(last(cagrSteps({ mode: 'rate', start: 10000, end: 19000, years: 5, ratePct: 8 }))).toBe('13.70%');
    expect(last(cagrSteps({ mode: 'rate', start: 500, end: 800, years: 3.5, ratePct: 8 }))).toBe(fmtPct(cagr(500, 800, 3.5)));
  });
  it('end and years modes end with the headline', () => {
    expect(last(cagrSteps({ mode: 'end', start: 10000, end: 0, years: 5, ratePct: 8 }))).toBe(fmtMoney(cagrEndValue(10000, 8, 5), 'USD'));
    expect(last(cagrSteps({ mode: 'years', start: 10000, end: 19000, years: 0, ratePct: 8 }))).toBe(fmtYears(cagrYears(10000, 19000, 8)));
  });
  it('a zero start gives no steps', () => {
    expect(cagrSteps({ mode: 'rate', start: 0, end: 100, years: 5, ratePct: 8 })).toEqual([]);
  });
});

describe('inflationSteps', () => {
  it('CPI mode ends with the headline value (hand check: CPI 172.2 in 2000)', () => {
    const s = inflationSteps({ mode: 'cpi', amount: 100, fromYear: 2000, toYear: 2020, ratePct: 3, years: 10, forward: true });
    expect(last(s)).toBe(`${fmtMoney(cpiAdjust(100, 2000, 2020)!.value, 'USD')} in 2020`);
    expect(s[0].working).toContain('CPI(2000) = 172.2');
  });
  it('rate mode ends with the future cost (hand check: 100 × 1.03^10 = 134.39)', () => {
    const s = inflationSteps({ mode: 'rate', amount: 100, fromYear: 2000, toYear: 2020, ratePct: 3, years: 10, forward: true });
    expect(last(s)).toBe(fmtMoney(inflateForward(100, 3, 10), 'USD'));
    expect(last(s)).toBe('$134.39');
    expect(last(inflationSteps({ mode: 'rate', amount: 100, fromYear: 0, toYear: 0, ratePct: 3, years: 10, forward: false }))).toBe('$74.41');
  });
  it('a year outside the CPI table gives no steps', () => {
    expect(inflationSteps({ mode: 'cpi', amount: 100, fromYear: 1800, toYear: 2020, ratePct: 3, years: 10, forward: true })).toEqual([]);
  });
});

describe('npvIrrSteps', () => {
  const flows = [-50000, 12000, 15000, 18000, 20000, 9000];
  it('ends with the IRR tile value; NPV step matches npv()', () => {
    const s = npvIrrSteps({ flows, rateAnnual: 0.08, periodsPerYear: 1 });
    expect(last(s)).toBe(irrAll(flows).rates.map((x) => fmtPct(x)).join(' / '));
    expect(s[2].result).toBe(fmtMoney(npv(0.08, flows), 'USD'));
  });
  it('hand check: −1,000 then 1,100 has NPV 0 at 10% and IRR 10.00%', () => {
    const s = npvIrrSteps({ flows: [-1000, 1100], rateAnnual: 0.1, periodsPerYear: 1 });
    expect(s[2].result).toBe('$0.00');
    expect(last(s)).toBe('10.00%');
  });
  it('quarterly periods and no sign change', () => {
    const s = npvIrrSteps({ flows, rateAnnual: 0.08, periodsPerYear: 4, noun: 'quarter' });
    expect(s[0].label).toBe('Discount rate per quarter');
    expect(last(npvIrrSteps({ flows: [100, 200], rateAnnual: 0.08, periodsPerYear: 1 }))).toBe('None');
    expect(npvIrrSteps({ flows: [100], rateAnnual: 0.08, periodsPerYear: 1 })).toEqual([]);
  });
});

describe('presentFutureValueSteps', () => {
  const tvm: TvmInput = { annualRatePct: 6, compounding: 12, years: 10, paymentsPerYear: 12, payment: 200, timing: 'end' };
  it.each([[{ solve: 'fv' as const, lump: 10000, tvm }], [{ solve: 'pv' as const, lump: 50000, tvm: { ...tvm, timing: 'start' as const, compounding: 'continuous' as const } }]])('ends with the total', (i) => {
    const r = i.solve === 'fv' ? futureValue(i.lump, i.tvm) : presentValue(i.lump, i.tvm);
    expect(last(presentFutureValueSteps(i))).toBe(fmtMoney(r.total, 'USD'));
  });
  it('hand check: 10,000 at 0.5% a month for 120 months grows to 18,193.97', () => {
    expect(presentFutureValueSteps({ solve: 'fv', lump: 10000, tvm })[3].result).toBe('$18,193.97');
  });
  it('zero term gives no steps', () => {
    expect(presentFutureValueSteps({ solve: 'fv', lump: 10000, tvm: { ...tvm, years: 0 } })).toEqual([]);
  });
});

describe('roiSteps', () => {
  const a = { invested: 10000, returned: 14500, costs: 150, income: 600, years: 4.5 };
  it.each([[a], [{ invested: 10000, returned: 12400, costs: 50, income: 0, years: 2 }]])('ends with annualized ROI', (i) => {
    expect(last(roiSteps(i))).toBe(fmtPct(computeRoi(i)!.annualized));
  });
  it('hand check: 4,950 / 10,150 = 48.77% total ROI', () => {
    expect(roiSteps(a)[3].result).toBe('48.77%');
  });
  it('nothing invested gives no steps', () => {
    expect(roiSteps({ ...a, invested: 0, costs: 0 })).toEqual([]);
  });
});

describe('savingsGoalSteps', () => {
  const input: SavingsInput = { goal: 50000, startingBalance: 5000, annualRatePct: 4.5, compounding: 12, depositsPerYear: 12, timing: 'end' };
  it('deposit mode ends with the deposit needed', () => {
    expect(last(savingsGoalSteps({ mode: 'deposit', input, years: 5, deposit: 500 }))).toBe(fmtMoney(requiredDeposit(input, 5), 'USD'));
  });
  it('time and balance modes end with the headline', () => {
    const t = periodsToGoal(input, 500);
    expect(last(savingsGoalSteps({ mode: 'time', input, years: 5, deposit: 500 }))).toBe(describeDuration(t.periods, 12));
    expect(last(savingsGoalSteps({ mode: 'balance', input: { ...input, timing: 'start' }, years: 5, deposit: 500 }))).toBe(fmtMoney(savingsBalance({ ...input, timing: 'start' }, 500, 60), 'USD'));
  });
  it('hand check: at 0% saving 45,000 over 60 months is 750 a month; an unreachable goal gives no steps', () => {
    expect(last(savingsGoalSteps({ mode: 'deposit', input: { ...input, annualRatePct: 0 }, years: 5, deposit: 0 }))).toBe('$750.00');
    expect(savingsGoalSteps({ mode: 'time', input: { ...input, annualRatePct: 0 }, years: 5, deposit: 0 })).toEqual([]);
  });
});

describe('bondYieldSteps', () => {
  const bond = { face: 1000, couponRate: 5, years: 10, frequency: 2 };
  it('price mode ends with the clean price (hand check: 5% 10-year at 6% = 925.61)', () => {
    expect(last(bondYieldSteps({ mode: 'price', bond, ytmPct: 6, price: 0, priceType: 'clean' }))).toBe('$925.61');
    const odd = { ...bond, years: 9.75 };
    expect(last(bondYieldSteps({ mode: 'price', bond: odd, ytmPct: 4.2, price: 0, priceType: 'clean' }))).toBe(investMoney(bondPriceFromYield(odd, 4.2).clean));
  });
  it('yield mode ends with YTM to 4 dp', () => {
    expect(last(bondYieldSteps({ mode: 'yield', bond, ytmPct: 0, price: 925.61, priceType: 'clean' }))).toBe(investPct(bondYieldFromPrice(bond, 925.61), 4));
    expect(last(bondYieldSteps({ mode: 'yield', bond, ytmPct: 0, price: 1000, priceType: 'clean' }))).toBe('5.0000%');
  });
  it('a price no yield can match gives no steps', () => {
    expect(bondYieldSteps({ mode: 'yield', bond, ytmPct: 0, price: 0, priceType: 'clean' })).toEqual([]);
  });
});

describe('currencySteps', () => {
  it('ends with the last converted amount, with the currency’s decimals', () => {
    const s = currencySteps({ amount: 100, from: 'USD', date: '2026-11-05', rows: [{ code: 'EUR', rate: 0.92 }, { code: 'JPY', rate: 150.2 }] });
    expect(last(s)).toBe('¥15,020');
    expect(s[1].result).toBe('€92.00');
    expect(s[1].working).toBe(`100 USD × ${fmtRate(0.92)}`);
  });
  it('no rates or a negative amount gives no steps', () => {
    expect(currencySteps({ amount: 100, from: 'USD', date: 'x', rows: [] })).toEqual([]);
    expect(currencySteps({ amount: -1, from: 'USD', date: 'x', rows: [{ code: 'EUR', rate: 0.9 }] })).toEqual([]);
  });
});
