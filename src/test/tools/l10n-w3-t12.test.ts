/**
 * Localization wave 3, batch t12: the tool changes for the market versions
 * (Philippine and Singapore overtime rules, MOM's hourly basic rate, the
 * Irish 90% loan-to-value cap in the affordability calculator, market
 * currencies in the pay tools) and every worked example quoted in
 * src/config/toolContent/l10n/<locale>/w3-t12.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  dailyOvertime, weeklyOvertime, sgHourlyBasicRate, formatMoney, CURRENCIES, PAY_MARKET_CURRENCIES, convertSalary, calculateTip, addVat, removeVat,
} from '@/lib/tools/calculators/pay';
import { calculateMortgage, calculateAffordability, calculateRefinance, calculateStudentLoan, paymentFrequencyPlan, simulatePayoff } from '@/lib/tools/calculators/loans';
import { calculateConsolidation } from '@/lib/tools/calculators/debt-consolidation-calculator';
import { calculateEmergencyFund } from '@/lib/tools/w500/finance2';

const nb = (s: string) => s.replace(/[  ]/g, ' ');
const noX = { propertyTaxYearly: 0, insuranceYearly: 0, pmiRatePct: 0, hoaMonthly: 0, insurance: 'none' as const };
const affBase = { monthlyDebts: 0, propertyTaxRatePct: 0, insuranceYearly: 0, hoaMonthly: 0, pmiRatePct: 0, frontEndPct: 0, backEndPct: 0, insurance: 'none' as const };
const refBase = { pointsPct: 0, rollCostsIntoLoan: false, cashOut: 0 };

describe('overtime: Philippine Labor Code rule', () => {
  it('counts every hour past 8 in a day, with no weekly threshold (NCR ₱755 a day)', () => {
    const r = dailyOvertime({ hourlyRate: 755 / 8, days: [10, 10, 8, 10, 6, 8, 0], rule: 'philippines', multiplier: 1.25 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.overtimeHours).toBe(6);
    expect(r.value.regularHours).toBe(46);
    expect(r.value.overtimeRate).toBeCloseTo(117.96875, 6);
    expect(r.value.overtimePay).toBeCloseTo(707.8125, 6);
    expect(r.value.totalPay).toBeCloseTo(5049.0625, 6);
  });

  it('a single 12-hour day gives 4 overtime hours; a 7-day 56-hour week of 8-hour days gives none', () => {
    const r = dailyOvertime({ hourlyRate: 94.375, days: [8, 8, 12, 8, 8, 0, 0], rule: 'philippines', multiplier: 1.25 });
    expect(r.ok && r.value.overtimeHours).toBe(4);
    expect(r.ok && r.value.overtimePay).toBeCloseTo(471.875, 6);
    expect(r.ok && r.value.totalPay).toBeCloseTo(4246.875, 6);
    const flat = dailyOvertime({ hourlyRate: 94.375, days: [8, 8, 8, 8, 8, 8, 8], rule: 'philippines', multiplier: 1.25 });
    expect(flat.ok && flat.value.overtimeHours).toBe(0);
  });

  it('a lower daily rate scales the same way (₱610 a day)', () => {
    const r = dailyOvertime({ hourlyRate: 610 / 8, days: [10, 10, 8, 10, 6, 8, 0], rule: 'philippines', multiplier: 1.25 });
    expect(r.ok && r.value.overtimeRate).toBeCloseTo(95.3125, 6);
    expect(r.ok && r.value.overtimePay).toBeCloseTo(571.875, 6);
  });
});

describe('overtime: Singapore Employment Act rule', () => {
  it('uses MOM\'s hourly basic rate, 12 x monthly / (52 x 44)', () => {
    expect(sgHourlyBasicRate(2400)).toBeCloseTo(12.587413, 5);
    expect(sgHourlyBasicRate(3800)).toBeCloseTo(19.930070, 5);
    expect(sgHourlyBasicRate(2600)).toBeCloseTo(13.636364, 5);
    expect(sgHourlyBasicRate(-1)).toBeNaN();
  });

  it('takes the greater of daily (over 9 h) or weekly (over 44 h) overtime', () => {
    const r = dailyOvertime({ hourlyRate: sgHourlyBasicRate(2400), days: [10.5, 10.5, 10.5, 10.5, 10.5, 0, 0], rule: 'singapore', multiplier: 1.5, ordinaryDayHours: 9 });
    expect(r.ok && r.value.overtimeHours).toBe(8.5);
    expect(r.ok && r.value.overtimeRate).toBeCloseTo(18.881119, 5);
    expect(r.ok && r.value.overtimePay).toBeCloseTo(160.4895, 3);
    const short = dailyOvertime({ hourlyRate: 10, days: [11, 11, 11, 11, 0, 0, 0], rule: 'singapore', multiplier: 1.5, ordinaryDayHours: 9 });
    expect(short.ok && short.value.overtimeHours).toBe(8);
  });

  it('a workman on a six-day week with an 8-hour normal day', () => {
    const r = dailyOvertime({ hourlyRate: sgHourlyBasicRate(3800), days: [8, 8, 10, 8, 8, 8, 0], rule: 'singapore', multiplier: 1.5, ordinaryDayHours: 8 });
    expect(r.ok && r.value.overtimeHours).toBe(6);
    expect(r.ok && r.value.overtimeRate).toBeCloseTo(29.895105, 5);
    expect(r.ok && r.value.overtimePay).toBeCloseTo(179.3706, 3);
  });

  it('leaves the US rules unchanged', () => {
    const w = weeklyOvertime({ hourlyRate: 20, hoursWorked: 48, threshold: 40, multiplier: 1.5 });
    expect(w.ok && w.value.totalPay).toBe(1040);
    const f = dailyOvertime({ hourlyRate: 20, days: [10, 10, 10, 10, 8, 0, 0], rule: 'flsa', multiplier: 1.5 });
    expect(f.ok && f.value.overtimeHours).toBe(8);
  });
});

describe('pay tools: market currencies', () => {
  it('keeps the existing currency list and its output', () => {
    expect(CURRENCIES.map((c) => c.code)).toEqual(['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY', 'CHF']);
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50');
    expect(formatMoney(1234.5, 'EUR')).toBe('€1,234.50');
    expect(formatMoney(123456.5, 'INR')).toBe('₹1,23,456.50');
  });

  it('prints the market currencies in their own CLDR format', () => {
    expect(PAY_MARKET_CURRENCIES.map((c) => c.code)).toEqual(['NZD', 'SGD', 'ZAR', 'PHP', 'AED']);
    expect(nb(formatMoney(1150, 'ZAR'))).toBe('R 1 150,00');
    expect(formatMoney(18.881, 'SGD')).toBe('$18.88');
    expect(formatMoney(958, 'NZD')).toBe('$958.00');
    expect(formatMoney(707.8125, 'PHP')).toBe('₱707.81');
    expect(nb(formatMoney(12600, 'AED'))).toBe('AED 12,600.00');
  });
});

describe('Irish 10% minimum deposit in the affordability calculator', () => {
  it('caps the price at deposit / 10% when that binds before the income multiple', () => {
    const r = calculateAffordability({ ...affBase, annualIncome: 90000, downPayment: 30000, ratePct: 3.75, termYears: 30, maxLoanToIncome: 3.5, maxLtvPct: 90 })!;
    expect(r.maxPrice).toBeCloseTo(300000, 6);
    expect(r.loanAmount).toBeCloseTo(270000, 6);
    expect(r.binding).toBe('minimum-down-payment');
    expect(r.contractPayment).toBeCloseTo(1250.41, 2);
  });

  it('first-time buyer couple on €100,000: 4 times income binds', () => {
    const r = calculateAffordability({ ...affBase, annualIncome: 100000, downPayment: 45000, ratePct: 3.75, termYears: 30, maxLoanToIncome: 4, maxLtvPct: 90 })!;
    expect(r.maxPrice).toBeCloseTo(445000, 6);
    expect(r.binding).toBe('income-multiple');
    expect(r.contractPayment).toBeCloseTo(1852.46, 2);
    const more = calculateAffordability({ ...affBase, annualIncome: 90000, downPayment: 60000, ratePct: 3.75, termYears: 30, maxLoanToIncome: 3.5, maxLtvPct: 90 })!;
    expect(more.maxPrice).toBeCloseTo(375000, 6);
    const single = calculateAffordability({ ...affBase, annualIncome: 55000, downPayment: 20000, ratePct: 3.75, termYears: 35, maxLoanToIncome: 4, maxLtvPct: 90 })!;
    expect(single.maxPrice).toBeCloseTo(200000, 6);
    expect(single.contractPayment).toBeCloseTo(770.23, 2);
  });

  it('changes nothing when no cap is set, and rejects a cap outside 0 to 100', () => {
    const i = { ...affBase, annualIncome: 90000, downPayment: 30000, ratePct: 3.75, termYears: 30, maxLoanToIncome: 3.5 };
    expect(calculateAffordability(i)!.maxPrice).toBeCloseTo(345000, 6);
    expect(calculateAffordability({ ...i, maxLtvPct: 0 })!.maxPrice).toBeCloseTo(345000, 6);
    expect(calculateAffordability({ ...i, maxLtvPct: 120 })).toBeNull();
  });
});

describe('en-IE examples', () => {
  it('mortgage', () => {
    const a = calculateMortgage({ ...noX, homePrice: 400000, downPayment: 40000, ratePct: 3.75, termYears: 30 })!;
    expect(a.principalAndInterest).toBeCloseTo(1667.22, 2);
    expect(a.totalInterest).toBeCloseTo(240197.81, 2);
    const b = calculateMortgage({ ...noX, homePrice: 400000, downPayment: 40000, ratePct: 3.75, termYears: 35 })!;
    expect(b.principalAndInterest).toBeCloseTo(1540.46, 2);
    expect(b.totalInterest).toBeCloseTo(286992.37, 2);
    const c = calculateMortgage({ ...noX, homePrice: 400000, downPayment: 40000, ratePct: 3.75, termYears: 30, extraMonthly: 100 })!;
    expect(c.monthsSaved).toBe(35);
    expect(c.interestSaved).toBeCloseTo(26874.52, 2);
    const d = calculateMortgage({ ...noX, homePrice: 400000, downPayment: 40000, ratePct: 3.75, termYears: 30, oneTimeAmount: 10000, oneTimeMonth: 60 })!;
    expect(d.monthsSaved).toBe(14);
    expect(d.interestSaved).toBeCloseTo(14946.8, 1);
  });

  it('switching (the CCPC example and ours)', () => {
    const ccpc = calculateRefinance({ ...refBase, currentBalance: 200000, currentRatePct: 4.5, remainingMonths: 240, newRatePct: 3.5, newTermMonths: 240, closingCosts: 0 })!;
    expect(ccpc.currentPayment).toBeCloseTo(1265.3, 2);
    expect(ccpc.newPayment).toBeCloseTo(1159.92, 2);
    expect(ccpc.interestDifference).toBeCloseTo(25291.04, 2);
    const a = calculateRefinance({ ...refBase, currentBalance: 250000, currentRatePct: 4.4, remainingMonths: 264, newRatePct: 3.6, newTermMonths: 264, closingCosts: 1700 })!;
    expect(a.monthlySavings).toBeCloseTo(107.42, 2);
    expect(a.breakEvenMonth).toBe(11);
    expect(a.simpleBreakEvenMonth).toBe(16);
    expect(a.interestDifference).toBeCloseTo(28357.84, 2);
    const b = calculateRefinance({ ...refBase, currentBalance: 250000, currentRatePct: 4.2, remainingMonths: 264, newRatePct: 3.6, newTermMonths: 264, closingCosts: 4200 })!;
    expect(b.monthlySavings).toBeCloseTo(80.14, 2);
    expect(b.breakEvenMonth).toBe(35);
    const c = calculateRefinance({ ...refBase, currentBalance: 250000, currentRatePct: 4.1, remainingMonths: 264, newRatePct: 3.6, newTermMonths: 264, closingCosts: 1700 })!;
    expect(c.monthlySavings).toBeCloseTo(66.61, 2);
    expect(c.breakEvenMonth).toBe(17);
  });

  it('debt consolidation', () => {
    const debts = [{ name: 'Credit card', balance: 4800, aprPct: 22.4, payment: 150 }, { name: 'Overdraft', balance: 1500, aprPct: 11.85, payment: 60 }, { name: 'Car loan', balance: 6200, aprPct: 9.9, payment: 260 }];
    const three = calculateConsolidation({ debts, loanRatePct: 7, termMonths: 36, feePct: 0, feeMode: 'cash' })!;
    expect(three.current.months).toBe(50);
    expect(three.current.totalInterest).toBeCloseTo(3541.64, 2);
    expect(three.loan.payment).toBeCloseTo(385.96, 2);
    expect(three.loan.totalInterest).toBeCloseTo(1394.69, 2);
    expect(three.savings!).toBeCloseTo(2146.95, 2);
    expect(three.sameBudget!.months).toBe(29);
    expect(three.sameBudget!.totalInterest).toBeCloseTo(1122.86, 2);
    const five = calculateConsolidation({ debts, loanRatePct: 7, termMonths: 60, feePct: 0, feeMode: 'cash' })!;
    expect(five.loan.payment).toBeCloseTo(247.51, 2);
    expect(five.loan.totalInterest).toBeCloseTo(2350.9, 2);
    expect(five.savings!).toBeCloseTo(1190.74, 2);
    const cu = calculateConsolidation({ debts, loanRatePct: 12.74, termMonths: 36, feePct: 0, feeMode: 'cash' })!;
    expect(cu.loan.payment).toBeCloseTo(419.61, 2);
    expect(cu.loan.totalInterest).toBeCloseTo(2605.99, 2);
    expect(cu.savings!).toBeCloseTo(935.66, 2);
  });

  it('debt payoff', () => {
    const debts = [{ name: 'Credit card', balance: 4800, aprPct: 22.4, minPayment: 144 }, { name: 'Overdraft', balance: 1500, aprPct: 11.85, minPayment: 40 }, { name: 'Credit union loan', balance: 5500, aprPct: 9.5, minPayment: 180 }, { name: 'Buy Now Pay Later', balance: 450, aprPct: 0, minPayment: 75 }];
    const av = simulatePayoff(debts.map((d) => ({ ...d })), 600, 'avalanche');
    expect(av.months).toBe(24);
    expect(av.totalInterest).toBeCloseTo(1754.36, 2);
    expect(av.order.find((o) => o.name === 'Credit card')!.month).toBe(17);
    expect(av.order.find((o) => o.name === 'Buy Now Pay Later')!.month).toBe(6);
    const sn = simulatePayoff(debts.map((d) => ({ ...d })), 600, 'snowball');
    expect(sn.months).toBe(24);
    expect(sn.totalInterest).toBeCloseTo(1938.28, 2);
    expect(sn.order.find((o) => o.name === 'Overdraft')!.month).toBe(8);
    const mn = simulatePayoff(debts.map((d) => ({ ...d })), 439, 'minimum');
    expect(mn.months).toBe(53);
    expect(mn.totalInterest).toBeCloseTo(3984.09, 2);
  });

  it('salary, tips and VAT', () => {
    const min = convertSalary({ amount: 14.15, period: 'hourly', hoursPerWeek: 39, daysPerWeek: 5, holidaysPerYear: 10, vacationDaysPerYear: 20, paidLeave: true });
    expect(min.ok && min.value.unadjusted.weekly).toBeCloseTo(551.85, 2);
    expect(min.ok && min.value.unadjusted.monthly).toBeCloseTo(2391.35, 2);
    expect(min.ok && min.value.unadjusted.annual).toBeCloseTo(28696.2, 2);
    const sal = convertSalary({ amount: 52000, period: 'annual', hoursPerWeek: 39, daysPerWeek: 5, holidaysPerYear: 10, vacationDaysPerYear: 20, paidLeave: true });
    expect(sal.ok && sal.value.workedDays).toBe(230);
    expect(sal.ok && sal.value.adjusted.hourly).toBeCloseTo(28.99, 2);
    expect(sal.ok && sal.value.unadjusted.hourly).toBeCloseTo(25.64, 2);
    const fifteen = convertSalary({ amount: 15, period: 'hourly', hoursPerWeek: 39, daysPerWeek: 5, holidaysPerYear: 10, vacationDaysPerYear: 20, paidLeave: true });
    expect(fifteen.ok && fifteen.value.unadjusted.annual).toBeCloseTo(30420, 6);

    const t1 = calculateTip({ bill: 142.5, tipPercent: 10, people: 4 });
    expect(t1.ok && t1.value.total).toBeCloseTo(156.75, 6);
    expect(t1.ok && t1.value.perPerson).toBeCloseTo(39.1875, 6);
    const t2 = calculateTip({ bill: 142.5, tipPercent: 12.5, people: 4, rounding: 'total' });
    expect(t2.ok && t2.value.total).toBe(161);
    expect(t2.ok && t2.value.tip).toBeCloseTo(18.5, 6);
    const t2p = calculateTip({ bill: 142.5, tipPercent: 12.5, people: 4, rounding: 'person' });
    expect(t2p.ok && t2p.value.tip).toBeCloseTo(21.5, 6);
    const t3 = calculateTip({ bill: 38.6, tipPercent: 10, people: 1, rounding: 'total' });
    expect(t3.ok && t3.value.total).toBe(43);
    expect(t3.ok && t3.value.tip).toBeCloseTo(4.4, 6);

    expect(addVat(1000, 23)).toMatchObject({ ok: true, value: { tax: 230, gross: 1230 } });
    const rem = removeVat(61.5, 23);
    expect(rem.ok && rem.value.net).toBeCloseTo(50, 9);
    expect(addVat(500, 13.5).ok && (addVat(500, 13.5) as { value: { gross: number } }).value.gross).toBeCloseTo(567.5, 9);
    const nine = removeVat(109, 9);
    expect(nine.ok && nine.value.net).toBeCloseTo(100, 9);
  });
});

describe('en-NZ examples', () => {
  it('mortgage and fortnightly repayments', () => {
    const a = calculateMortgage({ ...noX, homePrice: 750000, downPayment: 150000, ratePct: 4.99, termYears: 30 })!;
    expect(a.principalAndInterest).toBeCloseTo(3217.26, 2);
    expect(a.totalInterest).toBeCloseTo(558214.96, 2);
    const f = paymentFrequencyPlan(600000, 4.99, 360, 12, 'biweekly')!;
    expect(f.payment).toBeCloseTo(1484.89, 2);
    expect(f.interestSaved).toBeCloseTo(2986.23, 2);
    expect(calculateMortgage({ ...noX, homePrice: 750000, downPayment: 150000, ratePct: 6, termYears: 30 })!.principalAndInterest).toBeCloseTo(3597.3, 2);
    expect(calculateMortgage({ ...noX, homePrice: 750000, downPayment: 75000, ratePct: 4.99, termYears: 30 })!.principalAndInterest).toBeCloseTo(3619.42, 2);
    expect(calculateMortgage({ ...noX, homePrice: 750000, downPayment: 75000, ratePct: 5.49, termYears: 30 })!.principalAndInterest).toBeCloseTo(3828.34, 2);
  });

  it('refinance', () => {
    const a = calculateRefinance({ ...refBase, currentBalance: 520000, currentRatePct: 6.2, remainingMonths: 288, newRatePct: 4.89, newTermMonths: 288, closingCosts: 1500 })!;
    expect(a.currentPayment).toBeCloseTo(3474.25, 2);
    expect(a.newPayment).toBeCloseTo(3070.97, 2);
    expect(a.breakEvenMonth).toBe(3);
    expect(a.interestDifference).toBeCloseTo(116143.34, 2);
    const b = calculateRefinance({ ...refBase, currentBalance: 520000, currentRatePct: 5.79, remainingMonths: 288, newRatePct: 4.89, newTermMonths: 288, closingCosts: 9000 })!;
    expect(b.monthlySavings).toBeCloseTo(274.4, 2);
    expect(b.breakEvenMonth).toBe(24);
  });

  it('salary', () => {
    const min = convertSalary({ amount: 23.95, period: 'hourly', hoursPerWeek: 40, daysPerWeek: 5, holidaysPerYear: 12, vacationDaysPerYear: 20, paidLeave: true });
    expect(min.ok && min.value.unadjusted.weekly).toBeCloseTo(958, 6);
    expect(min.ok && min.value.unadjusted.biweekly).toBeCloseTo(1916, 6);
    expect(min.ok && min.value.unadjusted.monthly).toBeCloseTo(4151.33, 2);
    expect(min.ok && min.value.unadjusted.annual).toBeCloseTo(49816, 6);
    expect(min.ok && min.value.workedDays).toBe(228);
    expect(min.ok && min.value.adjusted.hourly).toBeCloseTo(27.31, 2);
    const sal = convertSalary({ amount: 75000, period: 'annual', hoursPerWeek: 40, daysPerWeek: 5, holidaysPerYear: 12, vacationDaysPerYear: 20, paidLeave: true });
    expect(sal.ok && sal.value.unadjusted.weekly).toBeCloseTo(1442.31, 2);
    expect(sal.ok && sal.value.adjusted.hourly).toBeCloseTo(41.12, 2);
    expect(sal.ok && sal.value.unadjusted.hourly).toBeCloseTo(36.06, 2);
    const start = convertSalary({ amount: 19.16, period: 'hourly', hoursPerWeek: 40, daysPerWeek: 5, holidaysPerYear: 12, vacationDaysPerYear: 20, paidLeave: true });
    expect(start.ok && start.value.unadjusted.weekly).toBeCloseTo(766.4, 6);
    expect(start.ok && start.value.unadjusted.annual).toBeCloseTo(39852.8, 6);
    const thirty = convertSalary({ amount: 30, period: 'hourly', hoursPerWeek: 40, daysPerWeek: 5, holidaysPerYear: 12, vacationDaysPerYear: 20, paidLeave: true });
    expect(thirty.ok && thirty.value.unadjusted.annual).toBeCloseTo(62400, 6);
  });

  it('emergency fund', () => {
    const essentials = 2427 + 300 + 900 + 250 + 320 + 150 + 100;
    expect(essentials).toBe(4447);
    expect(Math.round((560 * 52) / 12)).toBe(2427);
    const a = calculateEmergencyFund({ monthlyEssentials: essentials, targetMonths: 3, currentSavings: 1000, monthlyContribution: 400, apyPct: 3.5 });
    expect(a.ok && a.value.target).toBe(13341);
    expect(a.ok && a.value.monthsToGoal).toBe(30);
    expect(a.ok && a.value.milestones[0].month).toBe(9);
    expect(a.ok && a.value.interestEarned).toBeCloseTo(603, 0);
    const b = calculateEmergencyFund({ monthlyEssentials: essentials, targetMonths: 4, currentSavings: 1000, monthlyContribution: 400, apyPct: 3.5 });
    expect(b.ok && b.value.target).toBe(17788);
    expect(b.ok && b.value.monthsToGoal).toBe(40);
    const c = calculateEmergencyFund({ monthlyEssentials: essentials, targetMonths: 3, currentSavings: 1000, monthlyContribution: 400, apyPct: 3.5, monthlyIncomeDuringGap: 2200 });
    expect(c.ok && c.value.monthlyShortfall).toBe(2247);
    expect(c.ok && c.value.target).toBe(6741);
    expect(c.ok && c.value.monthsToGoal).toBe(14);
  });
});

describe('en-ZA examples', () => {
  it('debt consolidation', () => {
    const debts = [{ name: 'Credit card', balance: 32000, aprPct: 21.5, payment: 1200 }, { name: 'Store card', balance: 9500, aprPct: 23, payment: 550 }, { name: 'Clothing account', balance: 4200, aprPct: 24, payment: 300 }, { name: 'Personal loan', balance: 28000, aprPct: 26, payment: 1450 }];
    const five = calculateConsolidation({ debts, loanRatePct: 19, termMonths: 60, feePct: 0, feeMode: 'cash' })!;
    expect(five.totalDebt).toBe(73700);
    expect(five.current.months).toBe(37);
    expect(five.current.totalInterest).toBeCloseTo(23493.36, 2);
    expect(five.loan.payment).toBeCloseTo(1911.82, 2);
    expect(five.loan.totalInterest).toBeCloseTo(41009.12, 2);
    expect(five.savings!).toBeCloseTo(-17515.76, 2);
    expect(five.longerTermCostsMore).toBe(true);
    expect(five.sameBudget!.months).toBe(26);
    expect(five.sameBudget!.totalInterest).toBeCloseTo(16664.81, 2);
    expect(five.sameBudget!.savings!).toBeCloseTo(6828.55, 2);
    const three = calculateConsolidation({ debts, loanRatePct: 19, termMonths: 36, feePct: 0, feeMode: 'cash' })!;
    expect(three.loan.payment).toBeCloseTo(2701.55, 2);
    expect(three.loan.totalInterest).toBeCloseTo(23555.75, 2);
    expect(three.savings!).toBeCloseTo(-62.4, 2);
  });

  it('debt payoff', () => {
    const debts = [{ name: 'Credit card', balance: 32000, aprPct: 21.5, minPayment: 1100 }, { name: 'Store card', balance: 9500, aprPct: 23, minPayment: 500 }, { name: 'Clothing account', balance: 4200, aprPct: 24, minPayment: 300 }, { name: 'Personal loan', balance: 28000, aprPct: 26, minPayment: 1450 }];
    const av = simulatePayoff(debts.map((d) => ({ ...d })), 4200, 'avalanche');
    expect(av.months).toBe(22);
    expect(av.totalInterest).toBeCloseTo(16991.45, 2);
    const sn = simulatePayoff(debts.map((d) => ({ ...d })), 4200, 'snowball');
    expect(sn.months).toBe(22);
    expect(sn.totalInterest).toBeCloseTo(17201.12, 2);
    expect(sn.order.find((o) => o.name === 'Clothing account')!.month).toBe(4);
    expect(av.order.find((o) => o.name === 'Clothing account')!.month).toBe(15);
    const mn = simulatePayoff(debts.map((d) => ({ ...d })), 3350, 'minimum');
    expect(mn.months).toBe(42);
    expect(mn.totalInterest).toBeCloseTo(25491.42, 2);
  });

  it('VAT at 15%', () => {
    expect(addVat(1000, 15)).toMatchObject({ ok: true, value: { tax: 150, gross: 1150 } });
    const a = removeVat(1499.99, 15);
    expect(a.ok && a.value.net).toBeCloseTo(1304.34, 2);
    expect(a.ok && a.value.tax).toBeCloseTo(195.65, 2);
    const b = removeVat(11500, 15);
    expect(b.ok && b.value.net).toBeCloseTo(10000, 9);
  });
});

describe('en-AE examples', () => {
  it('VAT at 5%', () => {
    expect(addVat(12000, 5)).toMatchObject({ ok: true, value: { tax: 600, gross: 12600 } });
    const a = removeVat(3150, 5);
    expect(a.ok && a.value.net).toBeCloseTo(3000, 9);
    const b = removeVat(99, 5);
    expect(b.ok && b.value.net).toBeCloseTo(94.29, 2);
    expect(b.ok && b.value.tax).toBeCloseTo(4.71, 2);
  });
});

describe('en-SG examples', () => {
  it('HESL repayment, interest-free during study', () => {
    const base = { balance: 30000, ratePct: 3.5, deferMonths: 48, subsidized: true, payInterestWhileDeferred: false, capitalize: false, extraMonthly: 0 };
    const ten = calculateStudentLoan({ ...base, termYears: 10 })!;
    expect(ten.accruedInterest).toBe(0);
    expect(ten.payment).toBeCloseTo(296.66, 2);
    expect(ten.months).toBe(120);
    expect(ten.totalInterest).toBeCloseTo(5598.91, 2);
    expect(ten.totalPaid).toBeCloseTo(35598.91, 2);
    const five = calculateStudentLoan({ ...base, termYears: 5 })!;
    expect(five.payment).toBeCloseTo(545.75, 2);
    expect(five.totalInterest).toBeCloseTo(2745.14, 2);
    const extra = calculateStudentLoan({ ...base, termYears: 10, extraMonthly: 150 })!;
    expect(extra.months).toBe(75);
    expect(extra.totalInterest).toBeCloseTo(3437.96, 2);
  });
});
