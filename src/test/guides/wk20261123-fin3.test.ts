/**
 * Worked examples in the batch wk20261123-fin3 posts (how-an-hsa-works,
 * how-an-fsa-works), computed by the functions behind the Paycheck Calculator
 * (calculatePaycheck: payroll HSA and Section 125 deductions), including the
 * exact per-paycheck amounts the posts tell readers to type.
 * If a number here changes, update the post and its SVG to match.
 *
 * The FSA election comparison has no catalog tool: the expected-value formula
 * (gain = r x dollars reimbursed - (1 - r) x dollars forfeited) is written out
 * here and in the post, with r taken from the Paycheck Calculator.
 */
import { describe, it, expect } from 'vitest';
import { calculatePaycheck, FED_2026 } from '@/lib/tools/w500/finance2';

const cents = (n: number) => Math.round(n * 100) / 100;
const pay = (o: Partial<Parameters<typeof calculatePaycheck>[0]> & { annualGross: number }) => {
  const r = calculatePaycheck({ frequency: 'biweekly', status: 'single', age: 40, statePct: 5, ...o });
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe('how-an-hsa-works', () => {
  it('2026 limits quoted in the post match the Paycheck Calculator constants', () => {
    expect(FED_2026.hsaSelfOnly).toBe(4400);
    expect(FED_2026.hsaFamily).toBe(8750);
    expect(FED_2026.hsaCatchUp55).toBe(1000);
  });

  // Single, $85,000, biweekly, 5% flat state tax, age 40, $4,400 through payroll.
  const base = pay({ annualGross: 85000 });
  const hsa = pay({ annualGross: 85000, hsaPerPeriod: 4400 / 26 });
  const k401 = pay({ annualGross: 85000, k401Pct: (4400 / 85000) * 100 });

  it('payroll HSA: $4,400 costs $2,875.40 of take-home, saving $1,524.60 (22% + 5% + 7.65%)', () => {
    expect(base.taxableIncome).toBe(68900);
    expect(base.marginalRate).toBe(0.22);
    expect(cents(base.netAnnual)).toBe(64377.5);
    expect(cents(hsa.netAnnual)).toBe(61502.1);
    expect(cents(base.netAnnual - hsa.netAnnual)).toBe(2875.4);
    expect(cents(4400 - (base.netAnnual - hsa.netAnnual))).toBe(1524.6);
    expect(cents(base.federalTax - hsa.federalTax)).toBe(968);
    expect(cents(base.stateTax - hsa.stateTax)).toBe(220);
    expect(cents(base.socialSecurity + base.medicare - hsa.socialSecurity - hsa.medicare)).toBe(336.6);
    expect(cents(base.netPerPeriod - hsa.netPerPeriod)).toBe(110.59);
  });

  it('the same $4,400 as a 401(k) deferral costs $3,212: FICA is still due', () => {
    expect(cents(k401.traditional401k)).toBe(4400);
    expect(cents(base.netAnnual - k401.netAnnual)).toBe(3212);
    // A direct (non-payroll) HSA contribution gets the same income tax deduction, so it also leaves the $336.60 on the table.
    expect(cents((base.netAnnual - k401.netAnnual) - (base.netAnnual - hsa.netAnnual))).toBe(336.6);
  });

  it('typed input: $169.23 a paycheck ($4,399.98) drops take-home $110.59 a paycheck, $2,875.39 a year', () => {
    const typed = pay({ annualGross: 85000, hsaPerPeriod: 169.23 });
    expect(cents(typed.hsa)).toBe(4399.98);
    expect(cents(base.netPerPeriod - typed.netPerPeriod)).toBe(110.59);
    expect(cents(base.netAnnual - typed.netAnnual)).toBe(2875.39);
    expect(cents(4399.98 - (base.netAnnual - typed.netAnnual))).toBe(1524.59);
    expect(Math.round(base.federalTax - typed.federalTax)).toBe(968);
    expect(Math.round(base.stateTax - typed.stateTax)).toBe(220);
    expect(cents(base.socialSecurity + base.medicare - typed.socialSecurity - typed.medicare)).toBe(336.6);
  });

  it('partial year: five eligible months on self-only coverage = 5/12 of $4,400 = $1,833.33', () => {
    expect(cents(FED_2026.hsaSelfOnly * 5 / 12)).toBe(1833.33);
  });

  it('a $1,850 receipt reimbursed 25 years later left $1,850 compounding at 6%: $7,940', () => {
    expect(Math.round(1850 * 1.06 ** 25)).toBe(7940);
  });

  it('Medicare in July: the self-only limit for the year is 6/12 of $4,400 (and $1,000 catch-up) = $2,700', () => {
    expect((FED_2026.hsaSelfOnly + FED_2026.hsaCatchUp55) * 6 / 12).toBe(2700);
  });
});

describe('how-an-fsa-works', () => {
  // Single, $70,000, biweekly, 5% state, age 35.
  const base = pay({ annualGross: 70000, age: 35 });
  // Take-home given up to put E into the FSA; E minus this is the tax saved.
  const cost = (E: number) => base.netAnnual - pay({ annualGross: 70000, age: 35, section125PerPeriod: E / 26 }).netAnnual;
  const r = (1200 - cost(1200)) / 1200;

  it('each FSA dollar saves 34.65% (22% federal + 5% state + 7.65% FICA) for this earner', () => {
    expect(base.taxableIncome).toBe(53900);
    expect(cents(1200 - cost(1200))).toBe(415.8);
    expect(cents(1880 - cost(1880))).toBe(651.42);
    expect(cents(2600 - cost(2600))).toBe(900.9);
    expect(cents(3400 - cost(3400))).toBe(1178.1);
    expect(r).toBeCloseTo(0.3465, 10);
    expect(cents(cost(1200))).toBe(784.2);
    // What the reader types: $46.15 a paycheck.
    const typed = pay({ annualGross: 70000, age: 35, section125PerPeriod: 46.15 });
    expect(cents(typed.section125)).toBe(1199.9);
    expect(cents(base.netPerPeriod - typed.netPerPeriod)).toBe(30.16);
    expect(cents(base.netAnnual - typed.netAnnual)).toBe(784.13);
    expect(cents(1199.9 - (base.netAnnual - typed.netAnnual))).toBe(415.77);
    expect(cents(1200 / 26)).toBe(46.15);
    // Break-even: elect a dollar only if the chance of spending it is at least 1 - r.
    expect(cents((1 - r) * 100)).toBe(65.35);
  });

  it('in the 24% bracket (single, $130,000) r is 36.65%, so the break-even chance is 63.35%', () => {
    const hi = pay({ annualGross: 130000, age: 35 });
    const withFsa = pay({ annualGross: 130000, age: 35, section125PerPeriod: 2000 / 26 });
    expect(hi.marginalRate).toBe(0.24);
    const rHi = (2000 - (hi.netAnnual - withFsa.netAnnual)) / 2000;
    expect(rHi).toBeCloseTo(0.3665, 10);
    expect(cents((1 - rHi) * 100)).toBe(63.35);
  });

  // Expected-value formula from the post.
  const gain = (reimbursed: number, forfeited: number) => r * reimbursed - (1 - r) * forfeited;
  const outcome = (E: number, spend: number, carryover: number) => {
    const unspent = Math.max(0, E - spend);
    const carried = Math.min(unspent, carryover);
    return gain(Math.min(E, spend) + carried, unspent - carried);
  };
  const ev = (E: number, carryover: number) => 0.5 * outcome(E, 1200, carryover) + 0.5 * outcome(E, 2600, carryover);

  it('no carryover: electing $1,200 ($415.80) beats $1,880 ($311.42) and $2,600 ($200.90)', () => {
    expect(cents(outcome(2600, 1200, 0))).toBe(-499.1);
    expect(cents(outcome(1880, 1200, 0))).toBe(-28.58);
    expect(cents(ev(1200, 0))).toBe(415.8);
    expect(cents(ev(1880, 0))).toBe(311.42);
    expect(cents(ev(2600, 0))).toBe(200.9);
  });

  it('with the 2026 $680 carryover: electing $1,880 ($651.42) beats $2,600 ($540.90) and $1,200', () => {
    expect(cents(outcome(1880, 1200, 680))).toBe(651.42);
    expect(cents(outcome(2600, 1200, 680))).toBe(180.9);
    expect(cents(ev(1200, 680))).toBe(415.8);
    expect(cents(ev(1880, 680))).toBe(651.42);
    expect(cents(ev(2600, 680))).toBe(540.9);
  });

  it('dependent care: a $7,500 exclusion leaves no credit, since the $6,000 cap less $7,500 is below zero', () => {
    expect(Math.max(0, 6000 - 7500)).toBe(0);
    expect(Math.max(0, 3000 - 7500)).toBe(0);
  });
});
