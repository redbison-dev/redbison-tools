/**
 * Localization wave 2, batch m14: the tool features the market versions need
 * (paid leave in the salary converter, UK annual-equivalent APRs in the debt
 * planner, monthly rates and day counts in simple interest) and every worked
 * example quoted in src/config/toolContent/l10n/<locale>/w2-m14.ts, computed
 * with the same functions the pages use.
 */
import { describe, expect, it } from 'vitest';
import { calculateTip, convertSalary, raiseBetween, raiseByPercent, percentOff, stackedDiscount, originalFromSale, buyXGetY, amountOff, formatMoney } from '@/lib/tools/calculators/pay';
import { simulatePayoff, monthlyRate, type Debt, type RateBasis } from '@/lib/tools/calculators/loans';
import { averageCost, breakEvenPrice, sharesForTargetAverage, averageAfterBuy, type Trade } from '@/lib/tools/w500/finance2';
import { computeSimpleInterest, annualRatePercent, termInYears, simpleInterestInputSteps } from '@/lib/tools/simple-interest-calculator';
import { debtPayoffSteps } from '@/lib/tools/steps/s1';

const near = (a: number, b: number, d = 0.005) => expect(Math.abs(a - b)).toBeLessThan(d);
const tip = (bill: number, pct: number, people: number, tax: number, rounding: 'none' | 'person' | 'total' = 'none') =>
  calculateTip({ bill, tipPercent: pct, people, taxAmount: tax, tipOnPreTax: tax > 0, rounding }).value!;
const pay = (amount: number, period: 'hourly' | 'annual' | 'biweekly', hours: number, days: number, hol: number, vac: number, paidLeave?: boolean) =>
  convertSalary({ amount, period, hoursPerWeek: hours, daysPerWeek: days, holidaysPerYear: hol, vacationDaysPerYear: vac, paidLeave }).value!;
const plan = (debts: Debt[], budget: number, basis: RateBasis = 'nominal') => ({
  avalanche: simulatePayoff(debts, budget, 'avalanche', basis),
  snowball: simulatePayoff(debts, budget, 'snowball', basis),
  minimum: simulatePayoff(debts, budget, 'minimum', basis),
});
const buy = (shares: number, price: number, fee = 0): Trade => ({ side: 'buy', shares, price, fee });
const sell = (shares: number, price: number, fee = 0): Trade => ({ side: 'sell', shares, price, fee });

describe('salary converter: paid leave', () => {
  it('keeps the US behaviour by default (hourly time off unpaid)', () => {
    const r = pay(50, 'hourly', 40, 5, 10, 15);
    expect(r.adjusted.annual).toBeCloseTo(50 * 8 * 235, 6);
    expect(r.adjusted.hourly).toBe(50);
  });
  it('with paid leave, hourly pay keeps 52 paid weeks and the rate per hour worked rises', () => {
    const r = pay(12.71, 'hourly', 37.5, 5, 8, 20, true);
    expect(r.unadjusted.annual).toBeCloseTo(24784.5, 6);
    expect(r.adjusted.annual).toBeCloseTo(24784.5, 6);
    near(r.adjusted.hourly, 14.24);
    expect(r.workedDays).toBe(232);
  });
  it('paid leave changes nothing for salaried periods', () => {
    expect(pay(32000, 'annual', 37.5, 5, 8, 20, true)).toEqual(pay(32000, 'annual', 37.5, 5, 8, 20, false));
  });
});

describe('debt payoff: annual equivalent (UK) APR', () => {
  it('monthly rate from an effective APR', () => {
    near(monthlyRate(19, 'effective') * 100, 1.4602, 0.0001);
    expect(monthlyRate(19)).toBeCloseTo(19 / 1200, 12);
  });
  it('reproduces the FCA example: £3,000 at 19% APR', () => {
    const a = simulatePayoff([{ name: 'Card', balance: 3000, aprPct: 19, minPayment: 74 }], 74, 'avalanche', 'effective');
    expect(a.months).toBe(62);
    near(a.totalInterest, 1575.99);
    const b = simulatePayoff([{ name: 'Card', balance: 3000, aprPct: 19, minPayment: 108 }], 108, 'avalanche', 'effective');
    expect(b.months).toBe(36);
    near(b.totalInterest, 875.76);
  });
  it('nominal stays the default', () => {
    const d = [{ name: 'Card', balance: 3000, aprPct: 19, minPayment: 74 }];
    expect(simulatePayoff(d, 74, 'avalanche')).toEqual(simulatePayoff(d, 74, 'avalanche', 'nominal'));
    expect(simulatePayoff(d, 74, 'avalanche').months).toBe(66);
  });
  it('the working shows the effective monthly rate', () => {
    const steps = debtPayoffSteps([{ name: 'Card', balance: 3000, aprPct: 19, minPayment: 74 }], 74, 'avalanche', { year: 2026, month: 12 }, 'GBP', 'effective');
    expect(steps[1].formula).toContain('(1 + APR)^(1/12)');
    expect(steps[1].result).toBe('£43.81');
  });
});

describe('simple interest: monthly rates and day counts', () => {
  it('converts rate and time', () => {
    expect(annualRatePercent(2, 'month')).toBe(24);
    expect(annualRatePercent(5)).toBe(5);
    expect(termInYears(18, 'months')).toBe(1.5);
    expect(termInYears(73, 'days')).toBeCloseTo(0.2, 12);
    expect(termInYears(2)).toBe(2);
  });
  it('shows the conversions as working steps', () => {
    expect(simpleInterestInputSteps(5, 'year', 1, 'years')).toEqual([]);
    const s = simpleInterestInputSteps(2, 'month', 8, 'months');
    expect(s.map((x) => x.result)).toEqual(['24% a year', '0.666667 years']);
    expect(simpleInterestInputSteps(12, 'year', 45, 'days')[0].working).toBe('45 / 365');
  });
});

describe('en-GB examples', () => {
  it('tip', () => {
    const a = tip(148, 12.5, 4, 0);
    expect([a.tip, a.total]).toEqual([18.5, 166.5]);
    expect(formatMoney(a.perPerson, 'GBP')).toBe('£41.63');
    const b = tip(63.4, 10, 3, 0, 'person');
    expect([b.perPerson, b.total, b.tip]).toEqual([24, 72, 8.6]);
    near(b.effectiveTipPercent, 13.56, 0.01);
  });
  it('salary', () => {
    const unpaid = pay(12.71, 'hourly', 37.5, 5, 8, 20, false);
    near(unpaid.adjusted.annual, 22115.4);
    const a = pay(12.71, 'hourly', 37.5, 5, 8, 20, true);
    expect(formatMoney(a.unadjusted.monthly, 'GBP')).toBe('£2,065.38');
    expect(formatMoney(a.unadjusted.weekly, 'GBP')).toBe('£476.63');
    const b = pay(32000, 'annual', 37.5, 5, 8, 20);
    near(b.unadjusted.hourly, 16.41);
    near(b.adjusted.hourly, 18.39);
    const c = pay(14, 'hourly', 22.5, 3, 0, 16.8, true);
    near(c.unadjusted.annual, 16380);
    near(c.adjusted.hourly, 15.69);
    near(pay(12.71, 'hourly', 40, 5, 0, 0).unadjusted.annual, 26436.8);
    near(pay(30000, 'annual', 37.5, 5, 0, 0).unadjusted.hourly, 15.38);
    near(pay(30000, 'annual', 40, 5, 0, 0).unadjusted.hourly, 14.42);
  });
  it('pay rise', () => {
    const a = raiseByPercent(35000, 3, 3.5).value!;
    expect(a.newPay).toBe(36050);
    near(a.realRaisePercent!, -0.48);
    near(a.newPayInTodaysMoney!, 34830.92);
    near(raiseByPercent(35000, 5, 3.5).value!.realRaisePercent!, 1.45);
    const b = raiseBetween(12.21, 12.71, 3.5).value!;
    near(b.raisePercent, 4.1, 0.01);
    near(b.realRaisePercent!, 0.57);
    near(b.raiseAmount * 37.5 * 52, 975);
    const c = raiseByPercent(30000, 3, 3.5).value!;
    expect(c.newPay).toBe(30900);
    near(c.realRaisePercent!, -0.48);
  });
  it('debt payoff', () => {
    const debts = [
      { name: 'Credit card', balance: 3800, aprPct: 24.9, minPayment: 95 },
      { name: 'Store card', balance: 650, aprPct: 29.9, minPayment: 25 },
      { name: 'Overdraft', balance: 1500, aprPct: 39.9, minPayment: 50 },
      { name: 'Personal loan', balance: 6000, aprPct: 8.9, minPayment: 190 },
    ];
    const p = plan(debts, 500, 'effective');
    expect([p.avalanche.months, p.snowball.months, p.minimum.months]).toEqual([29, 29, 75]);
    near(p.avalanche.totalInterest, 2400.34);
    near(p.snowball.totalInterest, 2445.91);
    near(p.minimum.totalInterest, 6321.44);
    expect(p.avalanche.order[0]).toMatchObject({ name: 'Overdraft', month: 10 });
    expect(p.snowball.order[0]).toMatchObject({ name: 'Store card', month: 5 });
    const bt = plan([{ ...debts[0], aprPct: 0, minPayment: 38 }, ...debts.slice(1)], 500, 'effective');
    expect([bt.avalanche.months, bt.snowball.months]).toEqual([26, 26]);
    near(bt.avalanche.totalInterest, 819.25);
    near(bt.snowball.totalInterest, 1028.07);
  });
  it('discount', () => {
    expect(stackedDiscount(120, [50, 20]).value!.salePrice).toBeCloseTo(48, 9);
    expect(buyXGetY(4.5, 3, 2, 1).value!.salePrice).toBe(9);
    expect(originalFromSale(45, 25).value!).toBeCloseTo(60, 9);
    expect(percentOff(80, 25).value!.salePrice).toBe(60);
  });
  it('stock average (Section 104 pool)', () => {
    const trades = [buy(200, 4.5, 5.99 + 4.5), buy(300, 3.8, 5.99 + 5.7)];
    const r = averageCost(trades).value!;
    near(r.averageCost, 4.1244, 0.0001);
    near(r.costBasis, 2062.18);
    near(breakEvenPrice(r.shares, r.costBasis, 5.99), 4.1363, 0.0001);
    expect(averageCost([buy(200, 4.5), buy(300, 3.8)]).value!.averageCost).toBeCloseTo(4.08, 9);
    const s = averageCost([...trades, sell(150, 4.6, 5.99)]).value!;
    expect(s.shares).toBe(350);
    near(s.realizedPnl, 65.36);
  });
  it('simple interest', () => {
    near(computeSimpleInterest(4800, 11.75, termInYears(45, 'days'))!.interest, 69.53);
    near(computeSimpleInterest(1000, 8.5, termInYears(50, 'days'))!.interest, 11.64);
    expect(computeSimpleInterest(2500, 3.5, 4)!.interest).toBeCloseTo(350, 9);
    near(2500 * (1.035 ** 4 - 1), 368.81);
    expect(computeSimpleInterest(6000, 4.2, termInYears(9, 'months'))!.interest).toBeCloseTo(189, 9);
  });
});

describe('en-CA examples', () => {
  it('tip', () => {
    const a = tip(135.6, 18, 4, 15.6);
    expect([a.tip, a.total, a.perPerson]).toEqual([21.6, 157.2, 39.3]);
    const all = calculateTip({ bill: 135.6, tipPercent: 18, people: 4, taxAmount: 0, tipOnPreTax: false, rounding: 'none' }).value!;
    expect([all.tip, all.total]).toEqual([24.41, 160.01]);
    const b = tip(67.2, 15, 2, 3.2, 'person');
    expect([b.perPerson, b.total, b.tip]).toEqual([39, 78, 10.8]);
    near(b.effectiveTipPercent, 16.875, 0.001);
    near(21.6 * 0.015, 0.32);
    const four = tip(135.6, 18, 4, 15.6, 'person');
    expect(four.perPerson).toBe(40);
  });
  it('salary', () => {
    const a = pay(25, 'hourly', 40, 5, 9, 10, true);
    expect(a.unadjusted.annual).toBe(52000);
    expect(formatMoney(a.unadjusted.monthly, 'CAD')).toBe('CA$4,333.33');
    expect(a.unadjusted.biweekly).toBe(2000);
    near(a.adjusted.hourly, 26.97);
    expect(pay(25, 'hourly', 40, 5, 9, 10, false).adjusted.annual).toBeCloseTo(48200, 6);
    const b = pay(2400, 'biweekly', 40, 5, 9, 10);
    expect(b.unadjusted.annual).toBe(62400);
    near(b.unadjusted.hourly, 30);
    near(b.adjusted.hourly, 32.37);
    const c = pay(68000, 'annual', 37.5, 5, 9, 15);
    near(c.unadjusted.hourly, 34.87);
    near(c.adjusted.hourly, 38.42);
    expect(c.workedDays).toBe(236);
    expect(a.workedHours).toBe(1928);
  });
  it('raise', () => {
    const a = raiseByPercent(65000, 3, 3.1).value!;
    expect(a.newPay).toBe(66950);
    near(a.raiseAmount / 26, 75);
    near(a.raiseAmount / 12, 162.5);
    near(a.realRaisePercent!, -0.1);
    const b = raiseByPercent(65000, 2.2, 3.1).value!;
    near(b.newPay, 66430);
    near(b.realRaisePercent!, -0.87);
    near(b.newPayInTodaysMoney!, 64432.59);
    const c = raiseBetween(24, 25, 3.1).value!;
    near(c.raisePercent, 4.17);
    near(c.realRaisePercent!, 1.03);
    near(raiseBetween(62000, 68000).value!.raisePercent, 9.68);
  });
  it('debt payoff', () => {
    const debts = [
      { name: 'Visa', balance: 6800, aprPct: 20.99, minPayment: 204 },
      { name: 'Store card', balance: 900, aprPct: 29.99, minPayment: 27 },
      { name: 'Line of credit', balance: 4500, aprPct: 9.95, minPayment: 90 },
      { name: 'Car loan', balance: 12000, aprPct: 7.49, minPayment: 380 },
    ];
    const p = plan(debts, 950);
    expect([p.avalanche.months, p.snowball.months, p.minimum.months]).toEqual([30, 30, 73]);
    near(p.avalanche.totalInterest, 3507.18);
    near(p.snowball.totalInterest, 3996.18);
    near(p.minimum.totalInterest, 7293.14);
    expect(p.snowball.order.map((o) => o.name).slice(0, 3)).toEqual(['Store card', 'Line of credit', 'Visa']);
    const qc = plan([{ ...debts[0], minPayment: 340 }, { ...debts[1], minPayment: 45 }, debts[2], debts[3]], 950);
    expect([qc.avalanche.months, qc.minimum.months]).toEqual([30, 65]);
    near(qc.avalanche.totalInterest, 3525);
    near(qc.minimum.totalInterest, 4748.02);
    const c150 = simulatePayoff([{ name: 'Card', balance: 5000, aprPct: 20.99, minPayment: 150 }], 150, 'avalanche');
    expect(c150.months).toBe(51);
    near(c150.totalInterest, 2567.62);
    const c250 = simulatePayoff([{ name: 'Card', balance: 5000, aprPct: 20.99, minPayment: 250 }], 250, 'avalanche');
    expect(c250.months).toBe(25);
    near(c250.totalInterest, 1207.28);
  });
  it('discount', () => {
    const a = percentOff(150, 30, 13).value!;
    expect([a.salePrice, a.finalPrice]).toEqual([105, 118.65]);
    near(a.tax, 13.65);
    near(percentOff(150, 30, 5).value!.finalPrice, 110.25);
    near(originalFromSale(84, 30).value!, 120);
    near(percentOff(120, 30, 5).value!.finalPrice, 88.2);
    const s = stackedDiscount(240, [20, 10], 13).value!;
    near(s.salePrice, 172.8);
    near(s.finalPrice, 195.26);
    near(s.effectivePercent, 28);
  });
  it('stock average (CRA identical properties)', () => {
    const cra = averageCost([buy(100, 15), buy(150, 20), sell(200, 18), buy(350, 21)]).value!;
    expect(cra.shares).toBe(400);
    expect(cra.costBasis).toBeCloseTo(8250, 9);
    expect(cra.averageCost).toBeCloseTo(20.625, 9);
    expect(cra.steps[1].averageAfter).toBeCloseTo(18, 9);
    const f = averageCost([buy(60, 132.4, 9.99), buy(40, 118.75, 9.99)]).value!;
    near(f.costBasis, 12713.98);
    near(f.averageCost, 127.1398, 0.0001);
    near(breakEvenPrice(f.shares, f.costBasis, 9.99), 127.2397, 0.0001);
    const t = sharesForTargetAverage(f.shares, f.averageCost, 112, 120).value!;
    near(t.shares, 89.25);
    near(t.cost, 9995.72);
  });
});

describe('en-AU examples', () => {
  it('pay rise', () => {
    const a = raiseByPercent(90000, 3.2, 4.3).value!;
    expect(a.newPay).toBeCloseTo(92880, 6);
    near(a.raiseAmount / 26, 110.77);
    near(a.raiseAmount / 12, 240);
    near(a.realRaisePercent!, -1.05);
    near(a.newPayInTodaysMoney!, 89050.81);
    near(raiseByPercent(90000, 4.5, 4.3).value!.realRaisePercent!, 0.19);
    const w = raiseBetween(1850, 1920, 4.3).value!;
    near(w.raisePercent, 3.78);
    near(w.realRaisePercent!, -0.49);
  });
  it('debt payoff', () => {
    const p = plan([
      { name: 'Credit card', balance: 7200, aprPct: 20.99, minPayment: 180 },
      { name: 'Store card', balance: 2400, aprPct: 25.99, minPayment: 72 },
      { name: 'Personal loan', balance: 1900, aprPct: 13.5, minPayment: 95 },
      { name: 'Car loan', balance: 16000, aprPct: 8.5, minPayment: 450 },
    ], 1100);
    expect([p.avalanche.months, p.snowball.months, p.minimum.months]).toEqual([29, 30, 70]);
    near(p.avalanche.totalInterest, 4380.66);
    near(p.snowball.totalInterest, 4577.06);
    near(p.minimum.totalInterest, 9950.81);
    expect(p.avalanche.order[0]).toMatchObject({ name: 'Store card', month: 7 });
    expect(p.snowball.order[0]).toMatchObject({ name: 'Personal loan', month: 5 });
    const a = simulatePayoff([{ name: 'Card', balance: 5000, aprPct: 18, minPayment: 100 }], 100, 'avalanche');
    expect(a.months).toBe(94);
    near(a.totalInterest, 4311.18);
    const b = simulatePayoff([{ name: 'Card', balance: 5000, aprPct: 18, minPayment: 250 }], 250, 'avalanche');
    expect(b.months).toBe(24);
    near(b.totalInterest, 989.13);
  });
  it('discount', () => {
    const a = percentOff(199, 25).value!;
    expect([a.salePrice, a.savings]).toEqual([149.25, 49.75]);
    const b = buyXGetY(39.95, 2, 1, 1, 50).value!;
    expect(formatMoney(b.salePrice, 'AUD')).toBe('A$59.93');
    near(b.effectivePercent, 25);
    const c = amountOff(1299, 300).value!;
    expect(c.salePrice).toBe(999);
    near(c.effectivePercent, 23.09);
    expect(originalFromSale(75, 25).value!).toBeCloseTo(100, 9);
    // Page defaults (price 199, amount 50) must work in the dollars-off mode.
    expect(amountOff(199, 50).ok).toBe(true);
  });
});

describe('en-IN examples', () => {
  it('stock average with delivery charges', () => {
    // Charges from the published schedule cited in the write-up.
    const buyCharges = (v: number) => { const tx = v * 0.0000307, se = v * 1e-6; return v * 0.001 + v * 0.00015 + tx + se + 0.18 * (tx + se); };
    const sellCharges = (v: number) => { const tx = v * 0.0000307, se = v * 1e-6; return v * 0.001 + tx + se + 0.18 * (tx + se) + 15.34; };
    near(buyCharges(74000), 87.87);
    near(buyCharges(39600), 47.02);
    near(sellCharges(80 * 1420), 133.19);
    const r = averageCost([buy(50, 1480, 87.87), buy(30, 1320, 47.02)]).value!;
    near(r.averageCost, 1421.69);
    expect(formatMoney(r.costBasis, 'INR')).toBe('₹1,13,734.89');
    near(breakEvenPrice(r.shares, r.costBasis, 133.19), 1423.35);
    const t = sharesForTargetAverage(r.shares, r.averageCost, 1280, 1400).value!;
    near(t.shares, 14.46, 0.01);
    near(t.cost, 18505.49);
    near(averageAfterBuy(r.shares, r.averageCost, 20, 1280), 1393.35);
  });
  it('simple interest', () => {
    expect(computeSimpleInterest(50000, annualRatePercent(2, 'month'), termInYears(8, 'months'))!.interest).toBeCloseTo(8000, 6);
    const mis = computeSimpleInterest(500000, 7.4, termInYears(12, 'months'))!;
    expect(mis.interest).toBeCloseTo(37000, 6);
    near(mis.interest / 12, 3083.33);
    expect(formatMoney(500000, 'INR', 0)).toBe('₹5,00,000');
    expect(computeSimpleInterest(12500, 8, 3)!.interest).toBeCloseTo(3000, 9);
    expect(computeSimpleInterest(200000, annualRatePercent(1.5, 'month'), termInYears(18, 'months'))!.interest).toBeCloseTo(54000, 6);
    expect(computeSimpleInterest(200000, 1.5, 1.5)!.interest).toBeCloseTo(4500, 6);
    near((1.02 ** 12 - 1) * 100, 26.82, 0.01);
  });
});
