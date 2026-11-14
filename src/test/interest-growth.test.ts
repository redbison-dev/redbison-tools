import { describe, it, expect } from 'vitest';
import { computeCompoundGrowth } from '@/lib/finance/compoundGrowth';

describe('computeCompoundGrowth', () => {
  it('compounds annually with no contributions: 10,000 at 10% for 2 years = 12,100', () => {
    const result = computeCompoundGrowth({
      principal: 10000,
      ratePerPeriod: 0.10,
      periodsPerYear: 1,
      years: 2,
    });
    expect(result.finalAmount).toBeCloseTo(12100, 2);
    expect(result.interestEarned).toBeCloseTo(2100, 2);
    expect(result.rows).toHaveLength(2);
  });

  it('compounds monthly at a 10% annual rate: 2 years = 12,203.91', () => {
    const result = computeCompoundGrowth({
      principal: 10000,
      ratePerPeriod: 0.10 / 12,
      periodsPerYear: 12,
      years: 2,
    });
    expect(result.finalAmount).toBeCloseTo(12203.91, 2);
  });

  it('matches the annuity formula for monthly contributions: 10,000 + 100/month for 2 years = 14,848.60', () => {
    const result = computeCompoundGrowth({
      principal: 10000,
      ratePerPeriod: 0.10 / 12,
      periodsPerYear: 12,
      years: 2,
      contributionsPerYear: 1200,
    });
    expect(result.finalAmount).toBeCloseTo(14848.60, 2);
    expect(result.totalContributions).toBeCloseTo(2400, 2);
  });

  it('respects the chosen compounding frequency when contributions are present', () => {
    // Annual compounding must compound once per year even with monthly contributions,
    // i.e. contributions only start earning interest at the next annual compounding.
    const result = computeCompoundGrowth({
      principal: 10000,
      ratePerPeriod: 0.10,
      periodsPerYear: 1,
      years: 1,
      contributionsPerYear: 1200,
    });
    // One annual period: (10,000 * 1.10) + 1,200 = 12,200
    expect(result.finalAmount).toBeCloseTo(12200, 2);
  });

  it('compounds fractional years instead of truncating them: 1.5 years at 10% annually', () => {
    const result = computeCompoundGrowth({
      principal: 10000,
      ratePerPeriod: 0.10,
      periodsPerYear: 1,
      years: 1.5,
    });
    const expected = 10000 * Math.pow(1.1, 1.5);
    expect(result.finalAmount).toBeCloseTo(expected, 2);
    // Must not silently return the 1-year result
    expect(result.finalAmount).not.toBeCloseTo(11000, 2);
    expect(result.rows[1].period).toBe('Year 2 (partial)');
  });

  it('pro-rates contributions over a fractional final year', () => {
    const result = computeCompoundGrowth({
      principal: 10000,
      ratePerPeriod: 0.10 / 12,
      periodsPerYear: 12,
      years: 1.5,
      contributionsPerYear: 1200,
    });
    expect(result.totalContributions).toBeCloseTo(1800, 2);
  });
});
