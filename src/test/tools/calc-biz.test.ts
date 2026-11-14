import { describe, it, expect } from 'vitest';
import {
  solveMarginMarkup,
  markupToMargin,
  marginToMarkup,
  marginMistake,
  breakEven,
  preTaxTarget,
  breakEvenChart,
  depreciationSchedule,
  MACRS_HALF_YEAR,
  MACRS_CLASSES,
  tieredMarginal,
  tieredWholeAmount,
  validateTiers,
  flatCommission,
  drawSchedule,
  rateForTarget,
  salesForTarget,
  parseNumberList,
  roundMoney,
  salesForCommission,
  encodeTiers,
  decodeTiers,
  type CommissionTier,
} from '@/lib/tools/calculators/biz';

const deps = (r: ReturnType<typeof depreciationSchedule>) => {
  if (!r.ok) throw new Error(r.error);
  return r.value.rows.map((x) => roundMoney(x.depreciation));
};

describe('margin and markup', () => {
  it('cost 60, price 100 gives 40% margin and 66.67% markup', () => {
    const r = solveMarginMarkup({ cost: 60, price: 100 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.profit).toBe(40);
    expect(r.value.margin).toBeCloseTo(40, 10);
    expect(r.value.markup).toBeCloseTo(66.6667, 3);
  });

  it('solves every valid pair back to the same cost and price', () => {
    const pairs = [
      { cost: 60, margin: 40 },
      { cost: 60, markup: 200 / 3 },
      { cost: 60, profit: 40 },
      { price: 100, margin: 40 },
      { price: 100, markup: 200 / 3 },
      { price: 100, profit: 40 },
      { profit: 40, margin: 40 },
      { profit: 40, markup: 200 / 3 },
    ];
    for (const p of pairs) {
      const r = solveMarginMarkup(p);
      expect(r.ok, JSON.stringify(p)).toBe(true);
      if (!r.ok) continue;
      expect(r.value.cost).toBeCloseTo(60, 9);
      expect(r.value.price).toBeCloseTo(100, 9);
    }
  });

  it('standard conversion table values', () => {
    expect(marginToMarkup(50)).toBeCloseTo(100, 10);
    expect(marginToMarkup(25)).toBeCloseTo(33.3333, 3);
    expect(marginToMarkup(20)).toBeCloseTo(25, 10);
    expect(markupToMargin(100)).toBeCloseTo(50, 10);
    expect(markupToMargin(25)).toBeCloseTo(20, 10);
    expect(marginToMarkup(100)).toBeNull();
    expect(markupToMargin(-100)).toBeNull();
  });

  it('rejects margin plus markup and a 100% margin with a cost', () => {
    expect(solveMarginMarkup({ margin: 40, markup: 66 }).ok).toBe(false);
    expect(solveMarginMarkup({ cost: 10, margin: 100 }).ok).toBe(false);
    expect(solveMarginMarkup({ cost: 10 }).ok).toBe(false);
    expect(solveMarginMarkup({ cost: 10, price: 20, margin: 50 }).ok).toBe(false);
    expect(solveMarginMarkup({ profit: 5, margin: 0 }).ok).toBe(false);
  });

  it('handles a loss (negative margin) and zero cost', () => {
    const loss = solveMarginMarkup({ cost: 120, price: 100 });
    expect(loss.ok && loss.value.margin).toBeCloseTo(-20, 10);
    const free = solveMarginMarkup({ cost: 0, price: 10 });
    expect(free.ok && free.value.markup).toBeNull();
    expect(free.ok && free.value.margin).toBe(100);
    expect(solveMarginMarkup({ price: 100, profit: 150 }).ok).toBe(false); // negative cost
  });

  it('the classic mistake: 40% markup gives only 28.57% margin', () => {
    const m = marginMistake(60, 40);
    expect(m.wrongPrice).toBeCloseTo(84, 10);
    expect(m.rightPrice).toBeCloseTo(100, 10);
    expect(m.actualMargin).toBeCloseTo(28.5714, 3);
    expect(m.shortfallPerUnit).toBeCloseTo(16, 10);
  });
});

describe('break-even', () => {
  // Garrison, Managerial Accounting (Acoustic Concepts): price 250,
  // variable 150, fixed 80,000 -> 800 units, 200,000 revenue, CM ratio 40%.
  it('textbook example', () => {
    const r = breakEven({ fixedCosts: 80000, pricePerUnit: 250, variableCostPerUnit: 150 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.contributionPerUnit).toBe(100);
    expect(r.value.contributionRatio).toBeCloseTo(40, 10);
    expect(r.value.breakEvenUnits).toBe(800);
    expect(r.value.breakEvenUnitsWhole).toBe(800);
    expect(r.value.breakEvenRevenue).toBeCloseTo(200000, 6);
  });

  it('target profit, margin of safety and operating leverage', () => {
    const r = breakEven({ fixedCosts: 80000, pricePerUnit: 250, variableCostPerUnit: 150, targetProfit: 20000, expectedUnits: 1000 });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.targetUnits).toBe(1000);
    expect(r.value.targetRevenue).toBe(250000);
    expect(r.value.expected!.profit).toBe(20000);
    expect(r.value.expected!.marginOfSafetyPct).toBeCloseTo(20, 10);
    expect(r.value.expected!.marginOfSafetyUnits).toBe(200);
    expect(r.value.expected!.operatingLeverage).toBeCloseTo(5, 10);
  });

  it('rounds fractional units up and handles zero fixed costs', () => {
    const r = breakEven({ fixedCosts: 1000, pricePerUnit: 10, variableCostPerUnit: 7 });
    expect(r.ok && r.value.breakEvenUnits).toBeCloseTo(333.333, 2);
    expect(r.ok && r.value.breakEvenUnitsWhole).toBe(334);
    const z = breakEven({ fixedCosts: 0, pricePerUnit: 10, variableCostPerUnit: 7 });
    expect(z.ok && z.value.breakEvenUnits).toBe(0);
  });

  it('no break-even when price does not exceed variable cost', () => {
    expect(breakEven({ fixedCosts: 100, pricePerUnit: 5, variableCostPerUnit: 5 }).ok).toBe(false);
    expect(breakEven({ fixedCosts: 100, pricePerUnit: 0, variableCostPerUnit: 1 }).ok).toBe(false);
    expect(breakEven({ fixedCosts: -1, pricePerUnit: 5, variableCostPerUnit: 1 }).ok).toBe(false);
  });

  it('after-tax target and chart crossing', () => {
    expect(preTaxTarget(15000, 25)).toBeCloseTo(20000, 10);
    const pts = breakEvenChart({ fixedCosts: 80000, pricePerUnit: 250, variableCostPerUnit: 150 }, 1600, 16);
    const at800 = pts.find((p) => p.units === 800)!;
    expect(at800.revenue).toBe(at800.totalCost);
  });
});

describe('depreciation', () => {
  const base = { cost: 10000, salvage: 1000, life: 5 };

  it('straight-line', () => {
    expect(deps(depreciationSchedule({ ...base, method: 'straight-line' }))).toEqual([1800, 1800, 1800, 1800, 1800]);
  });

  it('straight-line with a partial first year (4 months) runs into a sixth year', () => {
    const d = deps(depreciationSchedule({ ...base, method: 'straight-line', firstYearMonths: 4 }));
    expect(d).toEqual([600, 1800, 1800, 1800, 1800, 1200]);
  });

  it('double-declining: textbook 10,000 / 1,000 / 5 years', () => {
    // 40% of book value, final year brought down to salvage.
    expect(deps(depreciationSchedule({ ...base, method: 'double-declining' }))).toEqual([4000, 2400, 1440, 864, 296]);
  });

  it('double-declining never goes below salvage', () => {
    const r = depreciationSchedule({ cost: 10000, salvage: 3000, life: 5, method: 'double-declining' });
    expect(deps(r)).toEqual([4000, 2400, 600, 0, 0]);
  });

  it('DDB with switch to straight-line, no salvage', () => {
    const r = depreciationSchedule({ cost: 1000, salvage: 0, life: 5, method: 'declining-balance', factor: 2, switchToStraightLine: true });
    expect(deps(r)).toEqual([400, 240, 144, 108, 108]);
    if (r.ok) expect(r.value.rows[3].note).toMatch(/Switched/);
  });

  it('DDB with switch, half-year first year, reproduces MACRS Table A-1 (IRS Pub 946)', () => {
    const pct = (cls: 3 | 5 | 7 | 10 | 15 | 20, factor: number) => {
      const r = depreciationSchedule({ cost: 100, salvage: 0, life: cls, method: 'declining-balance', factor, switchToStraightLine: true, firstYearMonths: 6 });
      if (!r.ok) throw new Error(r.error);
      return r.value.rows.map((x) => x.depreciation);
    };
    for (const cls of MACRS_CLASSES) {
      const engine = pct(cls, cls >= 15 ? 1.5 : 2);
      const table = MACRS_HALF_YEAR[cls];
      expect(engine.length).toBe(table.length);
      // The IRS rounds each percentage (and alternates .92/.93 to sum to 100).
      engine.forEach((v, k) => expect(Math.abs(v - table[k])).toBeLessThan(0.0101));
    }
  });

  it('MACRS 7-year on 10,000 matches the Pub 946 worked example', () => {
    expect(deps(depreciationSchedule({ cost: 10000, salvage: 0, life: 0, method: 'macrs', macrsClass: 7 }))).toEqual([1429, 2449, 1749, 1249, 893, 892, 893, 446]);
  });

  it('MACRS tables sum to 100%', () => {
    for (const cls of MACRS_CLASSES) {
      const s = MACRS_HALF_YEAR[cls].reduce((a, b) => a + b, 0);
      expect(Math.abs(s - 100)).toBeLessThan(0.02);
    }
  });

  it('150% declining balance', () => {
    const r = depreciationSchedule({ cost: 10000, salvage: 0, life: 10, method: 'declining-balance', factor: 1.5 });
    expect(deps(r).slice(0, 3)).toEqual([1500, 1275, 1083.75]);
  });

  it('sum-of-years-digits: 5/15, 4/15 ...', () => {
    expect(deps(depreciationSchedule({ ...base, method: 'sum-of-years' }))).toEqual([3000, 2400, 1800, 1200, 600]);
  });

  it('sum-of-years with a 6-month first year blends adjacent asset years', () => {
    expect(deps(depreciationSchedule({ ...base, method: 'sum-of-years', firstYearMonths: 6 }))).toEqual([1500, 2700, 2100, 1500, 900, 300]);
  });

  it('units of production with a cap at the depreciable base', () => {
    const r = depreciationSchedule({ cost: 50000, salvage: 5000, life: 1, method: 'units-of-production', totalUnits: 100000, unitsPerYear: [30000, 40000, 20000, 20000] });
    expect(deps(r)).toEqual([13500, 18000, 9000, 4500]);
    if (r.ok) expect(r.value.rows[3].endingBookValue).toBeCloseTo(5000, 9);
  });

  it('every schedule ends at salvage and book value never drops below it', () => {
    for (const method of ['straight-line', 'double-declining', 'sum-of-years'] as const) {
      for (const m of [12, 1, 7]) {
        const r = depreciationSchedule({ cost: 7777, salvage: 777, life: 7, method, firstYearMonths: m });
        if (!r.ok) throw new Error(r.error);
        const last = r.value.rows[r.value.rows.length - 1];
        expect(last.endingBookValue).toBeCloseTo(777, 6);
        r.value.rows.forEach((row) => expect(row.endingBookValue).toBeGreaterThanOrEqual(777 - 1e-6));
      }
    }
  });

  it('validation', () => {
    expect(depreciationSchedule({ cost: 0, salvage: 0, life: 5, method: 'straight-line' }).ok).toBe(false);
    expect(depreciationSchedule({ cost: 100, salvage: 200, life: 5, method: 'straight-line' }).ok).toBe(false);
    expect(depreciationSchedule({ cost: 100, salvage: 0, life: 2.5, method: 'straight-line' }).ok).toBe(false);
    expect(depreciationSchedule({ cost: 100, salvage: 0, life: 5, method: 'straight-line', firstYearMonths: 13 }).ok).toBe(false);
    expect(depreciationSchedule({ cost: 100, salvage: 0, life: 5, method: 'units-of-production', totalUnits: 0, unitsPerYear: [1] }).ok).toBe(false);
  });
});

describe('commission', () => {
  const tiers: CommissionTier[] = [
    { upTo: 10000, rate: 5 },
    { upTo: 20000, rate: 7 },
    { upTo: null, rate: 10 },
  ];

  it('flat', () => {
    expect(flatCommission(50000, 6)).toBe(3000);
    expect(flatCommission(0, 6)).toBe(0);
  });

  it('marginal tiers on 25,000: 500 + 700 + 500', () => {
    const r = tieredMarginal(25000, tiers);
    expect(r.total).toBeCloseTo(1700, 10);
    expect(r.slices.map((s) => s.commission)).toEqual([500, 700, 500]);
  });

  it('whole-amount tiers on 25,000: 10% of everything', () => {
    const r = tieredWholeAmount(25000, tiers);
    expect(r.total).toBe(2500);
    expect(r.tierIndex).toBe(2);
  });

  it('whole-amount threshold cliff at exactly the boundary', () => {
    expect(tieredWholeAmount(10000, tiers).total).toBe(500);
    expect(tieredWholeAmount(10001, tiers).total).toBeCloseTo(700.07, 10);
    expect(tieredMarginal(10000, tiers).total).toBe(500);
  });

  it('capped plan pays nothing beyond the last tier', () => {
    const capped: CommissionTier[] = [{ upTo: 10000, rate: 5 }];
    expect(tieredMarginal(15000, capped).total).toBe(500);
  });

  it('tier validation', () => {
    expect(validateTiers(tiers)).toBeNull();
    expect(validateTiers([{ upTo: null, rate: 5 }, { upTo: 100, rate: 6 }])).not.toBeNull();
    expect(validateTiers([{ upTo: 100, rate: 5 }, { upTo: 50, rate: 6 }])).not.toBeNull();
    expect(validateTiers([{ upTo: 100, rate: -1 }])).not.toBeNull();
  });

  it('recoverable draw carries the shortfall forward', () => {
    const rows = drawSchedule([1000, 4000, 2500], 2000, true);
    expect(rows.map((r) => r.payout)).toEqual([2000, 3000, 2500]);
    expect(rows.map((r) => r.carriedOut)).toEqual([1000, 0, 0]);
  });

  it('non-recoverable draw forgives the shortfall', () => {
    const rows = drawSchedule([1000, 4000, 2500], 2000, false);
    expect(rows.map((r) => r.payout)).toEqual([2000, 4000, 2500]);
    expect(rows.every((r) => r.carriedOut === 0)).toBe(true);
  });

  it('a long shortfall keeps accumulating on a recoverable draw', () => {
    const rows = drawSchedule([500, 500, 6000], 2000, true);
    expect(rows.map((r) => r.carriedOut)).toEqual([1500, 3000, 0]);
    expect(rows[2].payout).toBe(3000);
  });

  it('target income: rate and sales needed', () => {
    expect(rateForTarget(80000, 40000, 800000)).toBe(5);
    expect(salesForTarget(80000, 40000, 5)).toBe(800000);
    expect(rateForTarget(80000, 40000, 0)).toBeNull();
    expect(salesForTarget(80000, 40000, 0)).toBeNull();
  });

  it('parses number lists', () => {
    expect(parseNumberList('1000, 2000;3000 $4000')).toEqual([1000, 2000, 3000, 4000]);
    expect(parseNumberList('1000, abc')).toBeNull();
  });
});

describe('commission: sales needed for a target', () => {
  const tiers: CommissionTier[] = [
    { upTo: 10000, rate: 5 },
    { upTo: 20000, rate: 7 },
    { upTo: null, rate: 10 },
  ];
  it('inverts marginal tiers', () => {
    // 1,700 commission needs 25,000 in sales (500 + 700 + 500).
    expect(salesForCommission(1700, (s) => tieredMarginal(s, tiers).total)).toBeCloseTo(25000, 2);
    expect(salesForCommission(0, (s) => s)).toBe(0);
  });
  it('whole-amount tiers jump at the threshold', () => {
    // 600 is reached just above 10,000 because the whole amount jumps to 7%.
    const s = salesForCommission(600, (x) => tieredWholeAmount(x, tiers).total)!;
    expect(s).toBeGreaterThan(10000);
    expect(s).toBeLessThan(10000.02);
  });
  it('returns null for a capped plan that cannot reach the target', () => {
    expect(salesForCommission(1000, (s) => tieredMarginal(s, [{ upTo: 10000, rate: 5 }]).total)).toBeNull();
  });
  it('round-trips tier encoding', () => {
    expect(decodeTiers(encodeTiers(tiers))).toEqual(tiers);
  });
});
