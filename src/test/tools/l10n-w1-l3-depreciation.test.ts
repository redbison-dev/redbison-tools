/**
 * Tax-pool depreciation for the market versions of the depreciation
 * calculator (/en-gb, /en-in, /en-au, /en-ca). Reference values come from the
 * official rules each page cites:
 * - ATO diminishing value: base value x days held / 365 x 200% / effective
 *   life; the ATO's own $80,000, 5-year example gives $32,000 then $19,200.
 * - ATO small business pool: 15% in the year an asset is added, 30% after.
 * - CRA half-year rule: CCA on half the net addition in the first year;
 *   AII property available for use 2024 to 2027 gets the full rate.
 * - India: half the WDV rate for an asset put to use for less than 180 days.
 * - UK: writing-down allowance 14% main / 6% special rate; the 40% FYA
 *   leaves 60% in the pool from the next period; AIA up to 100%.
 */
import { describe, expect, it } from 'vitest';
import { depreciationSchedule, taxPoolFirstYearPct, type DepreciationInputs } from '@/lib/tools/calculators/biz';
import { depreciationSteps } from '@/lib/tools/steps/s1';

const pool = (p: Partial<DepreciationInputs>): DepreciationInputs => ({ method: 'tax-pool', cost: 10000, salvage: 0, life: 3, poolRatePct: 20, poolFirstYear: 'full', ...p });
const rows = (p: Partial<DepreciationInputs>) => {
  const r = depreciationSchedule(pool(p));
  if (!r.ok) throw new Error(r.error);
  return r.value.rows;
};
const deps = (p: Partial<DepreciationInputs>) => rows(p).map((r) => Math.round(r.depreciation * 100) / 100);

describe('tax-pool depreciation', () => {
  it('ATO diminishing value example: $80,000, 5-year effective life, 40% a year', () => {
    expect(deps({ cost: 80000, poolRatePct: 200 / 5, life: 2 })).toEqual([32000, 19200]);
  });

  it('ATO days-held pro-rating is approximated by months held', () => {
    expect(deps({ cost: 80000, poolRatePct: 40, poolFirstYear: 'months', firstYearMonths: 6, life: 2 })).toEqual([16000, 25600]);
  });

  it('ATO small business pool: 15% then 30% (the tool does not apply the s 328-210 low pool value write-off)', () => {
    // Year 3 opens at $17,850, under $20,000, so ITAA 1997 s 328-210 deducts it in
    // full; the en-AU page therefore stops the schedule at year 2.
    const r = rows({ cost: 30000, poolRatePct: 30, poolFirstYear: 'half', life: 2 });
    expect(r.map((x) => x.depreciation)).toEqual([4500, 7650]);
    expect(r[1].endingBookValue).toBe(17850);
  });

  it('CRA half-year rule, Class 8 at 20%', () => {
    expect(deps({ cost: 10000, poolRatePct: 20, poolFirstYear: 'half' })).toEqual([1000, 1800, 1440]);
  });

  it('CRA AII phase-out (2024 to 2027): full rate in year 1, twice the half-year amount', () => {
    const half = deps({ cost: 35000, poolRatePct: 30, poolFirstYear: 'half' })[0];
    const aii = deps({ cost: 35000, poolRatePct: 30, poolFirstYear: 'full' })[0];
    expect(half).toBe(5250);
    expect(aii).toBe(2 * half);
    // 2018 to 2023 AII: three times the half-year amount.
    expect(deps({ cost: 35000, poolRatePct: 30, poolFirstYear: 'enhanced' })[0]).toBe(3 * half);
  });

  // Bill C-15 (Budget 2025 Implementation Act, No. 1, Royal Assent 26 March 2026) restores the AII:
  // property acquired after 2024 and available for use before 2030 gets 1.5 x the class rate in year 1.
  it('CRA restored AII (acquired after 2024): 1.5 x rate in year 1', () => {
    expect(deps({ cost: 35000, poolRatePct: 30, poolFirstYear: 'enhanced', life: 2 })).toEqual([15750, 5775]);
    const r = rows({ cost: 10000, poolRatePct: 20, poolFirstYear: 'enhanced' });
    expect(r.map((x) => x.depreciation)).toEqual([3000, 1400, 1120]);
    expect(r.at(-1)!.endingBookValue).toBeCloseTo(4480, 6);
  });

  // Bill C-15, Reg. 1100(2) A.1(e): Class 50 reaccelerated property available for use before 2027 gets
  // 9/11 extra, so 55% x 20/11 = 100%; available 2027 to 2033 it gets the full 55% with no half-year rule.
  it('CRA Class 50 under Bill C-15: full write-off before 2027, full 55% from 2027', () => {
    const fya = rows({ cost: 3000, poolRatePct: 55, poolFirstYear: 'allowance', firstYearAllowancePct: 100 });
    expect(fya.map((x) => x.depreciation)).toEqual([3000, 0, 0]);
    expect(fya.at(-1)!.endingBookValue).toBe(0);
    expect(55 * (1 + 9 / 11)).toBeCloseTo(100, 10);
    const full = rows({ cost: 3000, poolRatePct: 55, poolFirstYear: 'full' });
    expect(full.map((x) => Math.round(x.depreciation * 100) / 100)).toEqual([1650, 742.5, 334.13]);
    expect(Math.round(full.at(-1)!.endingBookValue * 100) / 100).toBe(273.38);
  });

  it('India: half rate for an asset put to use under 180 days, full rate after', () => {
    expect(deps({ cost: 120000, poolRatePct: 40, poolFirstYear: 'half' })).toEqual([24000, 38400, 23040]);
    expect(deps({ cost: 1000000, poolRatePct: 15 })).toEqual([150000, 127500, 108375]);
  });

  it('UK: main rate 14%, special rate 6%, 40% FYA then 14% on the rest, AIA 100%', () => {
    expect(deps({ cost: 30000, poolRatePct: 14 })).toEqual([4200, 3612, 3106.32]);
    expect(deps({ cost: 25000, poolRatePct: 6 })).toEqual([1500, 1410, 1325.4]);
    expect(deps({ cost: 500000, poolRatePct: 14, poolFirstYear: 'allowance', firstYearAllowancePct: 40 })).toEqual([200000, 42000, 36120]);
    const aia = rows({ cost: 60000, poolRatePct: 14, poolFirstYear: 'allowance', firstYearAllowancePct: 100, life: 2 });
    expect(aia[0].depreciation).toBe(60000);
    expect(aia[1].depreciation).toBe(0);
    expect(aia[1].endingBookValue).toBe(0);
  });

  it('ignores salvage and never forces the pool to zero', () => {
    const r = depreciationSchedule(pool({ salvage: 5000, life: 5 }));
    expect(r.ok && r.value.depreciableBase).toBe(10000);
    expect(r.ok && r.value.rows[4].endingBookValue).toBeCloseTo(10000 * 0.8 ** 5, 6);
  });

  it('first-year percentage for each rule', () => {
    expect(taxPoolFirstYearPct({ poolRatePct: 30, poolFirstYear: 'half' })).toBe(15);
    expect(taxPoolFirstYearPct({ poolRatePct: 80, poolFirstYear: 'enhanced' })).toBe(100);
    expect(taxPoolFirstYearPct({ poolRatePct: 40, poolFirstYear: 'months', firstYearMonths: 3 })).toBe(10);
    expect(taxPoolFirstYearPct({ poolRatePct: 14, poolFirstYear: 'allowance', firstYearAllowancePct: 40 })).toBe(40);
  });

  it('rejects bad pool inputs', () => {
    expect(depreciationSchedule(pool({ poolRatePct: 0 })).ok).toBe(false);
    expect(depreciationSchedule(pool({ poolRatePct: 120 })).ok).toBe(false);
    expect(depreciationSchedule(pool({ life: 0 })).ok).toBe(false);
    expect(depreciationSchedule(pool({ poolFirstYear: 'allowance', firstYearAllowancePct: 150 })).ok).toBe(false);
    expect(depreciationSchedule(pool({ poolFirstYear: 'months', firstYearMonths: 13 })).ok).toBe(false);
  });

  it('working steps end on the closing written-down value', () => {
    const i = pool({ cost: 30000, poolRatePct: 30, poolFirstYear: 'half', life: 2 });
    const s = depreciationSteps(i, 'AUD');
    const last = s[s.length - 1];
    expect(last.label).toBe('Closing written-down value');
    expect(last.result).toContain('17,850.00');
    expect(s.find((x) => x.label.startsWith('Year 1'))!.working).toContain('× 1/2');
  });
});
