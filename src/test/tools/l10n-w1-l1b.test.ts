/**
 * Market conventions added for the localized car-finance and credit tools
 * (wave 1, batch l1b): balloon / optional final payments on car finance
 * (Australian balloons, UK PCP), rates quoted as a UK annual effective APR
 * (FCA CONC App 1.1), and Canada's GDS/TDS limits (CMHC). The US behaviour
 * must stay exactly as before when none of these is set.
 */
import { describe, expect, it } from 'vitest';
import {
  calculateAutoLoan, balloonPayment, monthlyPayment, monthlyEquivalentRatePct, effectiveAnnualRate, calculateApr,
  dtiBandFor, dtiBand, dtiGuidelines, DTI_GUIDELINES, calculateDti, canadaApr, amortize, type AutoLoanInput,
} from '@/lib/tools/calculators/loans';
import { calculateConsolidation } from '@/lib/tools/calculators/debt-consolidation-calculator';
import { autoLoanSteps, aprSteps, debtToIncomeSteps } from '@/lib/tools/steps/s1';
import { debtConsolidationSteps } from '@/lib/tools/steps/s8';

const car = (o: Partial<AutoLoanInput>): AutoLoanInput => ({
  price: 0, downPayment: 0, tradeInValue: 0, tradeInOwed: 0, salesTaxPct: 0, taxAfterTradeIn: true, fees: 0, financeTaxAndFees: true, ratePct: 0, termMonths: 1, ...o,
});

describe('balloon payments on car finance', () => {
  it('leaves exactly the balloon owing after the last monthly payment', () => {
    const r = calculateAutoLoan(car({ price: 45000, downPayment: 5000, ratePct: 8.5, termMonths: 60, balloon: 13500 }))!;
    expect(r.payment).toBeCloseTo(639.31, 2);
    expect(r.schedule.months).toBe(60);
    expect(r.schedule.rows.at(-1)!.balance).toBeCloseTo(13500, 6);
    expect(r.totalOfPayments).toBeCloseTo(r.payment * 60 + 13500, 6);
    expect(r.totalInterest).toBeCloseTo(r.totalOfPayments - r.loanAmount, 6);
  });

  it('matches the closed form and reduces to the normal payment without a balloon', () => {
    const P = 40000, n = 60, rate = 8.5, B = 13500, i = rate / 1200;
    const v = Math.pow(1 + i, -n);
    expect(balloonPayment(P, rate, n, B)).toBeCloseTo(((P - B * v) * i) / (1 - v), 9);
    expect(balloonPayment(P, rate, n, 0)).toBe(monthlyPayment(P, rate, n));
    expect(balloonPayment(12000, 0, 48, 4000)).toBeCloseTo(8000 / 48, 9);
  });

  it('costs more interest than a fully repaying loan at the same rate', () => {
    const plain = calculateAutoLoan(car({ price: 45000, downPayment: 5000, ratePct: 8.5, termMonths: 60 }))!;
    const ball = calculateAutoLoan(car({ price: 45000, downPayment: 5000, ratePct: 8.5, termMonths: 60, balloon: 13500 }))!;
    expect(plain.payment).toBeCloseTo(820.66, 2);
    expect(ball.payment).toBeLessThan(plain.payment);
    expect(ball.totalInterest).toBeGreaterThan(plain.totalInterest);
  });

  it('rejects a balloon that is negative or not below the amount financed', () => {
    expect(calculateAutoLoan(car({ price: 20000, ratePct: 7, termMonths: 36, balloon: -1 }))).toBeNull();
    expect(calculateAutoLoan(car({ price: 20000, ratePct: 7, termMonths: 36, balloon: 20000 }))).toBeNull();
    expect(calculateAutoLoan(car({ price: 20000, ratePct: 7, termMonths: 36, balloon: 19999 }))).not.toBeNull();
  });

  it('keeps the US loan unchanged and shows the balloon in the working', () => {
    const us = calculateAutoLoan(car({ price: 35000, downPayment: 5000, tradeInValue: 8000, tradeInOwed: 3000, salesTaxPct: 7, fees: 600, ratePct: 6.5, termMonths: 60 }))!;
    expect(us.balloon).toBe(0);
    expect(us.payment).toBeCloseTo(monthlyPayment(us.loanAmount, 6.5, 60), 9);
    const steps = autoLoanSteps(car({ price: 45000, downPayment: 5000, ratePct: 8.5, termMonths: 60, balloon: 13500 }), 'AUD');
    expect(steps.at(-1)!.label).toBe('Monthly payment with a balloon');
    expect(steps.at(-1)!.result).toContain('639.31');
  });
});

describe('UK APR: an annual effective rate (FCA CONC App 1.1)', () => {
  it('turns a 9.9% UK APR into the monthly rate (1.099)^(1/12) - 1', () => {
    expect(monthlyEquivalentRatePct(9.9, 1)).toBeCloseTo(9.477296, 5);
    expect(Math.pow(1 + monthlyEquivalentRatePct(9.9, 1) / 1200, 12)).toBeCloseTo(1.099, 12);
  });

  it('prices UK hire purchase and PCP from the APR', () => {
    const hp = calculateAutoLoan(car({ price: 24000, downPayment: 2400, fees: 10, ratePct: 9.9, termMonths: 48, compoundingPerYear: 1 }))!;
    expect(hp.loanAmount).toBe(21610);
    expect(hp.payment).toBeCloseTo(542.68, 2);
    const pcp = calculateAutoLoan(car({ price: 24000, downPayment: 2400, fees: 10, ratePct: 9.9, termMonths: 48, compoundingPerYear: 1, balloon: 10500 }))!;
    expect(pcp.payment).toBeCloseTo(361.92, 2);
    // A nominal reading of the same 9.9% overstates the payment.
    expect(calculateAutoLoan(car({ price: 24000, downPayment: 2400, fees: 10, ratePct: 9.9, termMonths: 48 }))!.payment).toBeCloseTo(547.05, 2);
  });

  it('states the APR calculator result as annual effective in UK mode', () => {
    const i = { loanAmount: 10000, ratePct: 9.5, termMonths: 60, fees: 0, pointsPct: 0, financeFees: false };
    const r = calculateApr(i)!;
    expect(effectiveAnnualRate(r.aprPct)).toBeCloseTo(9.92, 2);
    const steps = aprSteps(i, 'GBP', 'uk');
    expect(steps.at(-1)!.label).toMatch(/annual effective/);
    expect(aprSteps(i, 'USD').at(-1)!.label).toBe('APR');
  });

  it('runs a UK consolidation loan on effective rates and reports a UK APR', () => {
    const debts = [{ name: 'Card', balance: 6000, aprPct: 24.9, payment: 220 }, { name: 'Loan', balance: 4000, aprPct: 18.9, payment: 180 }];
    const uk = calculateConsolidation({ debts, loanRatePct: 7.9, termMonths: 36, feePct: 0, feeMode: 'cash', compoundingPerYear: 1 })!;
    expect(uk.loan.aprPct).toBeCloseTo(7.9, 6);
    expect(uk.loan.payment).toBeCloseTo(monthlyPayment(10000, monthlyEquivalentRatePct(7.9, 1), 36), 9);
    const us = calculateConsolidation({ debts, loanRatePct: 7.9, termMonths: 36, feePct: 0, feeMode: 'cash' })!;
    expect(us.loan.aprPct).toBeCloseTo(7.9, 6);
    expect(us.loan.payment).toBeGreaterThan(uk.loan.payment);
    expect(debtConsolidationSteps({ debts, loanRatePct: 7.9, termMonths: 36, feePct: 0, feeMode: 'cash', compoundingPerYear: 1 }, 'GBP')[5].label).toMatch(/CONC/);
  });
});

describe('Canadian GDS and TDS limits (CMHC 39% / 44%)', () => {
  it('passes only when both ratios are within the limits', () => {
    expect(dtiBandFor('ca', 39, 44)).toBe('good');
    expect(dtiBandFor('ca', 39.01, 44)).toBe('stretched');
    expect(dtiBandFor('ca', 39, 44.01)).toBe('stretched');
    expect(dtiBandFor('ca', 40, 45)).toBe('high');
  });

  it('keeps the US bands and table', () => {
    for (const b of [30, 36, 40, 43, 47, 50, 60]) expect(dtiBandFor('us', 0, b)).toBe(dtiBand(b));
    expect(dtiGuidelines('us')).toBe(DTI_GUIDELINES);
    expect(dtiGuidelines('ca').map((g) => [g.frontEnd, g.backEnd])).toEqual([[39, 44]]);
  });

  it('names the ratios GDS and TDS in the Canadian working', () => {
    const r = calculateDti(8000, 2900, 600)!;
    expect(r.frontEnd).toBeCloseTo(36.25, 9);
    expect(r.backEnd).toBeCloseTo(43.75, 9);
    const steps = debtToIncomeSteps({ incomeUnit: 'month', income: 8000, otherIncome: 0, housing: 2900, debts: [600] }, 'CAD', { front: 'GDS ratio', back: 'TDS ratio' });
    expect(steps.at(-1)!.label).toBe('TDS ratio');
    expect(debtToIncomeSteps({ incomeUnit: 'month', income: 8000, otherIncome: 0, housing: 2900, debts: [600] }).at(-1)!.label).toBe('Back-end DTI');
  });
});

describe('APR disclosure rules in other markets', () => {
  // RBI KFS illustration (Master Direction on Microfinance Loans, Annex II para 6A.4, same figures as KFS Annex B,
  // https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12256, checked 6 Nov 2026): Rs 20,000 at 15% over
  // 24 months, Rs 400 charges, net disbursed Rs 19,600, interest Rs 3,274, APR 17.07% (IRR x 12, reducing balance).
  it('reproduces the RBI Key Facts Statement APR illustration', () => {
    const r = calculateApr({ loanAmount: 20000, ratePct: 15, termMonths: 24, fees: 400, pointsPct: 0, financeFees: false })!;
    expect(r.payment).toBeCloseTo(969.73, 2);
    expect(Math.round(r.totalInterest)).toBe(3274);
    expect(r.amountFinanced).toBe(19600);
    expect(r.aprPct).toBeCloseTo(17.07, 2);
  });

  // Australia: comparison rate = n x r x 100%, a nominal rate (National Consumer Credit Protection Regulations 2010, reg 100),
  // so it is the nominal actuarial APR the calculator already solves.
  it('treats the Australian comparison rate as 12 x the monthly IRR', () => {
    const r = calculateApr({ loanAmount: 30000, ratePct: 9.5, termMonths: 60, fees: 495, pointsPct: 0, financeFees: false })!;
    expect(r.aprPct).toBeCloseTo(10.217, 3);
  });

  // Canada: APR = C / (T x P) x 100 (Financial Consumer Protection Framework Regulations, SOR/2021-181, s. 47).
  it('applies the Canadian cost of borrowing formula', () => {
    const i = { loanAmount: 20000, ratePct: 8.99, termMonths: 60, fees: 300, pointsPct: 0, financeFees: false };
    const base = calculateApr(i)!;
    const sched = amortize(20000, 8.99, 60);
    const opening = [20000, ...sched.rows.slice(0, -1).map((r) => r.balance)];
    const P = opening.reduce((a, b) => a + b, 0) / 60;
    const expected = ((sched.totalInterest + 300) / (5 * P)) * 100;
    expect(canadaApr(i)).toBeCloseTo(expected, 9);
    expect(canadaApr(i)).toBeCloseTo(9.5399, 4);
    expect(canadaApr(i)!).toBeLessThan(base.aprPct);
    // No fees: the APR equals the annual interest rate, as in FCAC's sample information box.
    expect(canadaApr({ loanAmount: 10000, ratePct: 10.75, termMonths: 60, fees: 0, pointsPct: 0, financeFees: false })).toBeCloseTo(10.75, 9);
    expect(aprSteps(i, 'CAD', 'ca').at(-1)!.result).toContain('9.540');
  });
});
