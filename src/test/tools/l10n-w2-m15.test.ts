/**
 * Localization wave 2, batch m15: tool changes that market versions rely on.
 * - Emergency fund: income that keeps arriving during a gap (UK Statutory Sick
 *   Pay, Canadian EI) reduces what the fund has to cover each month.
 * - Margin and markup: sales tax, VAT or GST on the selling price, with
 *   tax-inclusive shelf prices (UK VAT, Australian GST, Indian MRP) turned
 *   back into the net price that margin is worked on.
 */
import { describe, expect, it } from 'vitest';
import { calculateEmergencyFund, suggestedMonths } from '@/lib/tools/w500/finance2';
import { priceBeforeTax, priceWithTax, solveMarginMarkup } from '@/lib/tools/calculators/biz';
import { bizMoney } from '@/lib/tools/steps/s1';

const ok = <T,>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (r.ok === false) throw new Error(r.error);
  return r.value;
};

describe('emergency fund: income that continues during a gap', () => {
  const base = { monthlyEssentials: 2000, targetMonths: 6, currentSavings: 3000, monthlyContribution: 250, apyPct: 0 };

  it('leaves the US rule unchanged when nothing is coming in', () => {
    const plain = ok(calculateEmergencyFund(base));
    const zero = ok(calculateEmergencyFund({ ...base, monthlyIncomeDuringGap: 0 }));
    expect(zero).toEqual(plain);
    expect(plain.monthlyShortfall).toBe(2000);
    expect(plain.target).toBe(12000);
    expect(plain.monthsCovered).toBe(1.5);
  });

  it('sizes the fund on essentials minus the income that continues', () => {
    const r = ok(calculateEmergencyFund({ ...base, monthlyIncomeDuringGap: 500 }));
    expect(r.monthlyShortfall).toBe(1500);
    expect(r.target).toBe(9000);
    expect(r.gap).toBe(6000);
    expect(r.monthsCovered).toBe(2);
    expect(r.monthsToGoal).toBe(24);
    expect(r.milestones.map((m) => m.amount)).toEqual([1500, 4500, 9000]);
  });

  it('rejects negative income and income that covers every essential', () => {
    expect(calculateEmergencyFund({ ...base, monthlyIncomeDuringGap: -1 }).ok).toBe(false);
    expect(calculateEmergencyFund({ ...base, monthlyIncomeDuringGap: 2000 }).ok).toBe(false);
    expect(calculateEmergencyFund({ ...base, monthlyIncomeDuringGap: Number.NaN }).ok).toBe(false);
  });

  it('labels the sixth risk factor the way the checkbox reads, so market versions can relabel both', () => {
    expect(suggestedMonths({ highDeductible: true }).reasons).toContain('+1 High-deductible health plan');
  });
});

describe('margin and markup with VAT or GST', () => {
  it('strips UK VAT from a shelf price before working the margin', () => {
    const net = priceBeforeTax(30, 20);
    expect(net).toBeCloseTo(25, 10);
    const r = ok(solveMarginMarkup({ cost: 15, price: net }));
    expect(r.margin).toBeCloseTo(40, 10);
    expect(r.markup).toBeCloseTo(66.6667, 3);
  });

  it('adds Australian GST to a net price', () => {
    const t = priceWithTax(50, 10);
    expect(t.tax).toBeCloseTo(5, 10);
    expect(t.gross).toBeCloseTo(55, 10);
  });

  it('round-trips any rate', () => {
    for (const rate of [0, 5, 13, 18, 20]) expect(priceWithTax(priceBeforeTax(118, rate), rate).gross).toBeCloseTo(118, 10);
  });

  it('formats rupees with Indian digit grouping', () => {
    expect(bizMoney('INR')(1234567.5)).toBe('₹12,34,567.50');
    expect(bizMoney('USD')(1234567.5)).toBe('$1,234,567.50');
  });
});
