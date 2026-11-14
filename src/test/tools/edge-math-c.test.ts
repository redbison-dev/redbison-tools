/**
 * Edge, corner, positive and negative cases for the statistics modules
 * (calculators/stats and w500/stats2). Reference values come from closed forms
 * (t with 1, 2 and 3 df, chi-square with 2 df, F(2, 2)), Python's math.erfc,
 * math.lgamma and statistics.NormalDist, NIST StRD NumAcc1, or hand calculation
 * shown in comments.
 */
import { describe, it, expect } from 'vitest';
import {
  parseNumbers, fmt, round, describe as describeData, median, quantile, quartiles, modes, summarize, normalCdf, normalInv,
  zCritical, zProbabilities, zFromX, xFromZ, normalBetween, lnGamma, incompleteBeta, tPdf, tCdf, tInv, meanCi, proportionCi,
  sampleSizeProportion, sampleSizeMean, marginOfError, countArrangements, describeBig, listArrangements, binomialBig,
  factorialBig, twoEvents, atLeastOne, binomialPmf, binomial, parseProbability, deviationTable, COMBINATORICS_MAX_N,
} from '@/lib/tools/calculators/stats';
import {
  tSf, gammaP, gammaQ, chiSquareCdf, chiSquareSf, fCdf, fSf, chiSquareInv, fInv, chiSquarePdf, fPdf, pValue, sampleSummary,
  parsePairs, linearRegression, predict, oneSampleT, pairedT, twoSampleT, chiSquareGoodnessOfFit, chiSquareIndependence,
  parseTable, normalProbabilities, normalInverse, holmAdjust, oneWayAnova, anovaGroupsFromData, leveneTest, cdfOf, sfOf,
  quantileOf,
} from '@/lib/tools/w500/stats2';

type R<T> = { ok: true; value: T; error?: undefined } | { ok: false; error: string; value?: undefined };
const val = <T,>(r: R<T>): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const bad = <T,>(r: R<T>, re?: RegExp): string => {
  expect(r.ok).toBe(false);
  if (re) expect(r.error).toMatch(re);
  return r.error as string;
};
const Z975 = 1.959963984540054; // Φ⁻¹(0.975)

/* ------------------------------------------------------------------ */
/* calculators/stats                                                    */
/* ------------------------------------------------------------------ */

describe('parsing and formatting', () => {
  it('parseNumbers strips brackets and reports words', () => {
    expect(parseNumbers('(1, 2], abc 1e3 -.5 +4.')).toEqual({ values: [1, 2, 1000, -0.5, 4], invalid: ['abc'] });
    expect(parseNumbers('')).toEqual({ values: [], invalid: [] });
    expect(parseNumbers('Infinity NaN 0x10')).toEqual({ values: [], invalid: ['Infinity', 'NaN', '0x10'] });
  });
  it('fmt and round never print NaN as a number', () => {
    expect(fmt(NaN)).toBe('-');
    expect(fmt(Infinity)).toBe('∞');
    expect(fmt(-Infinity)).toBe('-∞');
    expect(fmt(0)).toBe('0');
    expect(fmt(1e-7)).toBe('1 × 10^-7');
    expect(fmt(2.5e15)).toBe('2.5 × 10^15');
    expect(fmt(1234.56789)).toBe('1,234.57');
    expect(round(-2.5, 0)).toBe(-3); // half away from zero
    expect(round(1.005, 2)).toBe(1.01); // no binary drift (1.005 is 1.00499999…)
    expect(round(NaN)).toBeNaN();
  });
});

describe('describe (Welford)', () => {
  it('rejects empty and non-finite data', () => {
    bad(describeData([]), /at least one/);
    bad(describeData([1, NaN]), /finite/);
    bad(describeData([1, Infinity]), /finite/);
  });
  it('n = 1 leaves the sample statistics undefined, a zero mean leaves the CV undefined', () => {
    const one = val(describeData([5]));
    expect(one).toMatchObject({ n: 1, mean: 5, populationVariance: 0, range: 0 });
    expect(one.sampleVariance).toBeNaN();
    expect(one.standardError).toBeNaN();
    const two = val(describeData([-1, 1]));
    expect(two.sampleVariance).toBe(2); // ((−1)² + 1²) / (2 − 1)
    expect(two.cvSample).toBeNaN();
  });
  it('NIST StRD NumAcc1 (certified mean 10000002, SD 1) and a large offset with no cancellation', () => {
    const d = val(describeData([10000001, 10000003, 10000002]));
    expect(d.mean).toBe(10000002);
    expect(d.sampleSd).toBe(1);
    const o = val(describeData([1e12 + 1, 1e12 + 2, 1e12 + 3]));
    expect(o.sampleVariance).toBe(1);
    expect(deviationTable([1, 3], 2)).toEqual([{ x: 1, deviation: -1, squared: 1 }, { x: 3, deviation: 1, squared: 1 }]);
  });
});

describe('median, quantiles, quartiles and modes', () => {
  it('quantile types 7 and 6, empty data and clamping', () => {
    const s = [1, 2, 3, 4];
    expect(quantile(s, 0.25)).toBe(1.75); // R quantile(type = 7)
    expect(quantile(s, 0.25, 'exclusive')).toBe(1.25); // R quantile(type = 6)
    expect(quantile(s, 0.1, 'exclusive')).toBe(1); // h = 0.5 clamps to the minimum
    expect(quantile(s, 0)).toBe(1);
    expect(quantile(s, 1)).toBe(4);
    expect(quantile([], 0.5)).toBeNaN();
    expect(median([])).toBeNaN();
  });
  it('quartile methods at n = 1, 2 and 5', () => {
    expect(quartiles([7], 'tukey')).toEqual({ q1: 7, q2: 7, q3: 7 });
    expect(quartiles([1, 9], 'exclusive-halves')).toEqual({ q1: 1, q2: 5, q3: 9 });
    expect(quartiles([1, 2, 3, 4, 5], 'tukey')).toEqual({ q1: 2, q2: 3, q3: 4 }); // R fivenum
    expect(quartiles([1, 2, 3, 4, 5], 'exclusive-halves')).toEqual({ q1: 1.5, q2: 3, q3: 4.5 }); // TI-84
  });
  it('modes: none, uni, bi and multimodal', () => {
    expect(modes([])).toMatchObject({ modes: [], kind: 'none' });
    expect(modes([1, 2, 3])).toMatchObject({ modes: [], kind: 'none' });
    expect(modes([5])).toMatchObject({ modes: [5], kind: 'unimodal' });
    expect(modes([2, 2, 2])).toMatchObject({ modes: [2], frequency: 3 });
    expect(modes([3, 1, 1, 3, 2])).toMatchObject({ modes: [1, 3], kind: 'bimodal' });
    expect(modes([1, 1, 2, 2, 3, 3, 4])).toMatchObject({ modes: [1, 2, 3], kind: 'multimodal' });
  });
  it('summarize: errors, outliers, and geometric/harmonic means only for positive data', () => {
    bad(summarize([], 'tukey'), /at least one/);
    bad(summarize([1, NaN], 'tukey'), /finite/);
    const s = val(summarize([1, 2, 3, 4, 100], 'tukey')); // Q1 2, Q3 4, upper fence 7
    expect(s.outliers).toEqual([100]);
    expect(s.whiskerHigh).toBe(4);
    expect(s.geometricMean).toBeCloseTo(Math.pow(2400, 1 / 5), 12);
    expect(s.harmonicMean).toBeCloseTo(5 / (1 + 1 / 2 + 1 / 3 + 1 / 4 + 1 / 100), 12);
    const neg = val(summarize([-1, 2, 3], 'inclusive'));
    expect(neg.geometricMean).toBeNaN();
    expect(neg.harmonicMean).toBeNaN();
  });
});

describe('normal distribution', () => {
  it('cdf in the tails keeps relative precision and handles NaN and ±∞', () => {
    expect(normalCdf(NaN)).toBeNaN();
    expect(normalCdf(Infinity)).toBe(1);
    expect(normalCdf(-Infinity)).toBe(0);
    // Φ(−8) = erfc(8/√2)/2 = 6.22096057427178e-16 (Python math.erfc)
    expect(normalCdf(-8) / 6.22096057427182e-16).toBeCloseTo(1, 10);
    expect(normalCdf(0)).toBe(0.5);
    expect(normalCdf(1.96)).toBeCloseTo(0.9750021048517796, 14);
  });
  it('inverse: out of range, endpoints, both tails', () => {
    for (const p of [NaN, -0.1, 1.1]) expect(normalInv(p)).toBeNaN();
    expect(normalInv(0)).toBe(-Infinity);
    expect(normalInv(1)).toBe(Infinity);
    expect(normalInv(0.001)).toBeCloseTo(-3.090232306167813, 12); // Python NormalDist().inv_cdf
    expect(normalInv(0.999)).toBeCloseTo(3.090232306167813, 12);
    expect(normalInv(1e-300)).toBeCloseTo(-37.0471, 3);
    expect(zCritical(0.95)).toBeCloseTo(Z975, 14);
  });
  it('z helpers', () => {
    const z = zProbabilities(-Z975);
    expect(z.twoTailed).toBeCloseTo(0.05, 6);
    expect(z.between).toBeCloseTo(0.95, 6);
    expect(z.percentile).toBeCloseTo(2.5, 10);
    expect(val(zFromX(130, 100, 15))).toBe(2);
    expect(val(xFromZ(-1, 100, 15))).toBe(85);
    bad(zFromX(NaN, 100, 15), /raw score/);
    bad(zFromX(1, 0, 0), /greater than 0/);
    bad(xFromZ(1, 0, -1), /greater than 0/);
    bad(xFromZ(1, Infinity, 1), /z-score/);
    expect(normalBetween(1, 2)).toBeCloseTo(0.13590512198327787, 14);
    expect(normalBetween(2, 1)).toBeCloseTo(0.13590512198327787, 14);
    expect(normalBetween(-1, 1)).toBeCloseTo(0.6826894921370859, 14);
  });
});

describe('gamma, beta and Student t', () => {
  it('lnGamma against Python math.lgamma, including the reflection formula', () => {
    expect(lnGamma(1)).toBeCloseTo(0, 14);
    expect(lnGamma(0.5)).toBeCloseTo(0.5723649429247004, 13); // ln √π
    expect(lnGamma(0.25)).toBeCloseTo(1.2880225246980772, 13);
    expect(lnGamma(-0.5)).toBeCloseTo(1.265512123484645, 13); // ln|Γ(−½)| = ln 2√π
    expect(lnGamma(171)).toBeCloseTo(706.5730622457874, 9); // ln 170!
  });
  it('incomplete beta closed forms and endpoints', () => {
    expect(incompleteBeta(0, 2, 3)).toBe(0);
    expect(incompleteBeta(1, 2, 3)).toBe(1);
    expect(incompleteBeta(0.3, 2, 1)).toBeCloseTo(0.09, 14); // x^a
    expect(incompleteBeta(0.3, 1, 3)).toBeCloseTo(1 - 0.7 ** 3, 14); // 1 − (1 − x)^b
    expect(incompleteBeta(0.9, 1, 1)).toBeCloseTo(0.9, 14);
  });
  it('t CDF, pdf and inverse against the 1- and 2-df closed forms', () => {
    expect(tCdf(NaN, 3)).toBeNaN();
    expect(tCdf(1, 0)).toBeNaN();
    expect(tCdf(Infinity, 3)).toBe(1);
    expect(tCdf(-Infinity, 3)).toBe(0);
    expect(tCdf(1, 1)).toBeCloseTo(0.75, 14); // ½ + atan(t)/π
    expect(tCdf(1, 2)).toBeCloseTo(0.5 + 1 / (2 * Math.sqrt(3)), 14); // ½ + t / (2√(2 + t²))
    expect(tPdf(0, 1)).toBeCloseTo(1 / Math.PI, 14);
    for (const p of [NaN, -0.1, 1.1]) expect(tInv(p, 5)).toBeNaN();
    expect(tInv(0.5, 0)).toBeNaN();
    expect(tInv(0, 5)).toBe(-Infinity);
    expect(tInv(1, 5)).toBe(Infinity);
    expect(tInv(0.5, 5)).toBe(0);
    expect(tInv(0.975, 1)).toBeCloseTo(Math.tan(0.475 * Math.PI), 9); // 12.7062047361747
    expect(tInv(0.025, 2)).toBeCloseTo(-4.302652729749464, 9); // (2p − 1)/√(2p(1 − p))
    expect(tInv(0.5 + 1e-12, 30)).toBeGreaterThan(0);
  });
});

describe('confidence intervals and sample size', () => {
  it('meanCi errors and the z interval at n = 1', () => {
    bad(meanCi({ mean: NaN, sd: 1, n: 5, confidence: 0.95, method: 'z' }), /Enter the mean/);
    bad(meanCi({ mean: 0, sd: 1, n: 5, confidence: 1, method: 'z' }), /between 0% and 100%/);
    bad(meanCi({ mean: 0, sd: -1, n: 5, confidence: 0.95, method: 'z' }), /negative/);
    bad(meanCi({ mean: 0, sd: 1, n: 2.5, confidence: 0.95, method: 'z' }), /whole number/);
    bad(meanCi({ mean: 0, sd: 1, n: 1, confidence: 0.95, method: 't' }), /at least 2/);
    expect(val(meanCi({ mean: 10, sd: 2, n: 1, confidence: 0.95, method: 'z' })).margin).toBeCloseTo(2 * Z975, 12);
    // t with df = 1: margin = 12.7062 × 2/√2
    expect(val(meanCi({ mean: 0, sd: 2, n: 2, confidence: 0.95, method: 't' })).margin).toBeCloseTo(Math.tan(0.475 * Math.PI) * Math.SQRT2, 8);
  });
  it('proportionCi at the boundaries x = 0 and x = n', () => {
    bad(proportionCi(NaN, 10, 0.95), /successes/);
    bad(proportionCi(1, 10, 0), /between 0% and 100%/);
    bad(proportionCi(1, 0, 0.95), /at least 1/);
    bad(proportionCi(11, 10, 0.95), /between 0 and the sample size/);
    bad(proportionCi(1.5, 10, 0.95), /whole number/);
    // Wilson upper bound for x = 0 is z²/(n + z²)
    const zero = val(proportionCi(0, 10, 0.95));
    expect(zero.wilson.lower).toBe(0);
    expect(zero.wilson.upper).toBeCloseTo(0.27753279986288915, 12);
    expect(zero.wald).toMatchObject({ lower: 0, upper: 0, margin: 0 });
    expect(zero.smallCounts).toBe(true);
    const all = val(proportionCi(10, 10, 0.95));
    expect(all.wilson.upper).toBe(1);
    expect(all.wilson.lower).toBeCloseTo(1 - 0.27753279986288915, 12);
  });
  it('sample size and margin of error, including a census', () => {
    // n0 = z²·0.25/0.05² = 384.146 → 385; with N = 1000: 384.146/(1 + 383.146/1000) = 277.74 → 278
    expect(val(sampleSizeProportion({ confidence: 0.95, margin: 0.05 })).n).toBe(385);
    expect(val(sampleSizeProportion({ confidence: 0.95, margin: 0.05, population: 1000 })).n).toBe(278);
    expect(val(sampleSizeProportion({ confidence: 0.95, margin: 0.05, population: 1 })).n).toBe(1);
    bad(sampleSizeProportion({ confidence: NaN, margin: 0.05 }), /Enter/);
    bad(sampleSizeProportion({ confidence: 1, margin: 0.05 }), /confidence/);
    bad(sampleSizeProportion({ confidence: 0.95, margin: 0 }), /margin/);
    bad(sampleSizeProportion({ confidence: 0.95, margin: 0.05, p: 0 }), /expected proportion/);
    bad(sampleSizeProportion({ confidence: 0.95, margin: 0.05, population: 0 }), /at least 1/);
    bad(sampleSizeProportion({ confidence: 0.95, margin: 0.05, population: NaN }), /at least 1/);
    // (1.96 × 15 / 5)² = 34.57 → 35
    expect(val(sampleSizeMean({ confidence: 0.95, margin: 5, sd: 15 })).n).toBe(35);
    bad(sampleSizeMean({ confidence: 0.95, margin: 5, sd: NaN }), /Enter/);
    bad(sampleSizeMean({ confidence: 2, margin: 5, sd: 1 }), /confidence/);
    bad(sampleSizeMean({ confidence: 0.95, margin: 0, sd: 1 }), /margin/);
    bad(sampleSizeMean({ confidence: 0.95, margin: 1, sd: 0 }), /standard deviation/);
    bad(sampleSizeMean({ confidence: 0.95, margin: 1, sd: 1, population: -5 }), /at least 1/);
    expect(val(marginOfError({ confidence: 0.95, n: 1000 })).margin).toBeCloseTo(0.030989751615228076, 12);
    // Sampling the whole population leaves no sampling error.
    expect(val(marginOfError({ confidence: 0.95, n: 500, population: 500 })).margin).toBe(0);
    expect(val(marginOfError({ confidence: 0.95, n: 1, population: 1 })).margin).toBe(0);
    expect(val(marginOfError({ confidence: 0.95, n: 1, p: 0 })).margin).toBe(0);
    bad(marginOfError({ confidence: 0.95, n: NaN }), /Enter/);
    bad(marginOfError({ confidence: 0, n: 10 }), /confidence/);
    bad(marginOfError({ confidence: 0.95, n: 0 }), /at least 1/);
    bad(marginOfError({ confidence: 0.95, n: 10, p: 1.5 }), /proportion/);
    bad(marginOfError({ confidence: 0.95, n: 10, population: 5 }), /at least as large/);
  });
});

describe('combinatorics', () => {
  it('counts for every kind, including n = 0 and r = 0', () => {
    expect(val(countArrangements('permutation', 5, 2))).toBe(20n);
    expect(val(countArrangements('combination', 5, 2))).toBe(10n);
    expect(val(countArrangements('permutation-repetition', 5, 2))).toBe(25n);
    expect(val(countArrangements('combination-repetition', 5, 2))).toBe(15n); // C(6, 2)
    expect(val(countArrangements('permutation', 0, 0))).toBe(1n);
    expect(val(countArrangements('permutation-repetition', 0, 3))).toBe(0n);
    expect(val(countArrangements('permutation-repetition', 0, 0))).toBe(1n); // 0⁰ = 1 empty arrangement
    expect(val(countArrangements('combination-repetition', 0, 0))).toBe(1n);
    expect(val(countArrangements('combination-repetition', 0, 2))).toBe(0n);
    bad(countArrangements('permutation', 2, 3), /cannot choose more/);
    bad(countArrangements('combination', 2, 3), /cannot choose more/);
    bad(countArrangements('combination', 2.5, 1), /whole numbers/);
    bad(countArrangements('combination', -1, 1), /negative/);
    bad(countArrangements('combination', COMBINATORICS_MAX_N + 1, 1), /limited/);
    expect(binomialBig(5, -1)).toBe(0n);
    expect(binomialBig(5, 6)).toBe(0n);
    expect(binomialBig(60, 30)).toBe(118264581564861424n);
    expect(factorialBig(0)).toBe(1n);
  });
  it('describeBig rounds the mantissa, carries, and keeps the sign', () => {
    // 100! = 9.33262154439441… × 10^157 (158 digits)
    const f = describeBig(factorialBig(100));
    expect(f.digits).toBe(158);
    expect(f.scientific).toBe('9.33262 × 10^157');
    expect(describeBig(10n ** 16n - 1n).scientific).toBe('1 × 10^16'); // 9.999… carries
    expect(describeBig(-1234n)).toEqual({ digits: 4, exact: '-1,234', scientific: '-1,234' });
  });
  it('listArrangements orders, truncates and refuses impossible requests', () => {
    expect(listArrangements('combination', ['a', 'b', 'c'], 2).rows).toEqual([['a', 'b'], ['a', 'c'], ['b', 'c']]);
    expect(listArrangements('combination-repetition', ['a', 'b'], 2).rows).toEqual([['a', 'a'], ['a', 'b'], ['b', 'b']]);
    const t = listArrangements('permutation', ['a', 'b', 'c'], 2, 2);
    expect(t).toEqual({ rows: [['a', 'b'], ['a', 'c']], truncated: true });
    expect(listArrangements('permutation', ['a'], 2)).toEqual({ rows: [], truncated: false });
    expect(listArrangements('permutation-repetition', [], 1)).toEqual({ rows: [], truncated: false });
    expect(listArrangements('combination', ['a'], -1).rows).toEqual([]);
    expect(listArrangements('combination', ['a', 'b'], 0).rows).toEqual([[]]);
  });
});

describe('probability rules and the binomial distribution', () => {
  it('twoEvents validates each relationship', () => {
    bad(twoEvents(NaN, 0.5, 'independent'), /Enter P\(A\)/);
    bad(twoEvents(1.2, 0.5, 'independent'), /between 0 and 1/);
    bad(twoEvents(0.7, 0.6, 'exclusive'), /above 1/);
    bad(twoEvents(0.5, 0.4, 'joint'), /P\(A and B\) between/);
    bad(twoEvents(0.5, 0.4, 'joint', 0.45), /cannot exceed/);
    bad(twoEvents(0.7, 0.6, 'joint', 0.2), /at least P\(A\) \+ P\(B\) - 1/); // needs ≥ 0.3
    bad(twoEvents(0.5, 0.4, 'conditional', 1.5), /P\(B \| A\)/);
    const ind = val(twoEvents(0.5, 0.4, 'independent'));
    expect(ind).toMatchObject({ and: 0.2, independent: true, exclusive: false });
    expect(ind.or).toBeCloseTo(0.7, 15);
    expect(ind.neither).toBeCloseTo(0.3, 15);
    const ex = val(twoEvents(0.3, 0.7, 'exclusive'));
    expect(ex).toMatchObject({ and: 0, or: 1, exclusive: true });
    expect(val(twoEvents(0.5, 0.4, 'conditional', 0.5)).and).toBe(0.25);
    expect(val(twoEvents(0, 0.4, 'independent')).bGivenA).toBeNaN();
  });
  it('atLeastOne at p = 0, p = 1 and n = 0', () => {
    const r = val(atLeastOne(0.5, 3));
    expect(r.atLeastOne).toBeCloseTo(0.875, 15);
    expect(r.trialsFor50).toBe(1);
    expect(r.trialsFor95).toBe(5); // ⌈ln 0.05 / ln 0.5⌉ = ⌈4.32⌉
    expect(val(atLeastOne(1, 0))).toMatchObject({ atLeastOne: 0, none: 1, all: 1, trialsFor50: 1 });
    expect(val(atLeastOne(1, 5))).toMatchObject({ atLeastOne: 1, none: 0 });
    const z = val(atLeastOne(0, 10));
    expect(z.atLeastOne).toBe(0);
    expect(z.trialsFor95).toBe(Infinity);
    // 1 − (1 − 1e-12)^1000 ≈ 1e-9 without cancellation
    expect(val(atLeastOne(1e-12, 1000)).atLeastOne / 1e-9).toBeCloseTo(1, 6);
    bad(atLeastOne(NaN, 1), /Enter/);
    bad(atLeastOne(-0.1, 1), /between 0 and 1/);
    bad(atLeastOne(0.5, 1.5), /whole number/);
  });
  it('binomial pmf boundaries and tail sums', () => {
    expect(binomialPmf(0, 10, 0)).toBe(1);
    expect(binomialPmf(1, 10, 0)).toBe(0);
    expect(binomialPmf(10, 10, 1)).toBe(1);
    expect(binomialPmf(9, 10, 1)).toBe(0);
    expect(binomialPmf(-1, 10, 0.5)).toBe(0);
    expect(binomialPmf(2.5, 10, 0.5)).toBe(0);
    expect(binomialPmf(5, 10, 0.5)).toBeCloseTo(252 / 1024, 14);
    const b = val(binomial(10, 0.5, 3)); // P(X ≤ 3) = (1 + 10 + 45 + 120)/1024
    expect(b.atMost).toBeCloseTo(176 / 1024, 14);
    expect(b.moreThan).toBeCloseTo(1 - 176 / 1024, 14);
    expect(b.sd).toBeCloseTo(Math.sqrt(2.5), 14);
    expect(val(binomial(1, 1, 1))).toMatchObject({ exactly: 1, lessThan: 0, atLeast: 1 });
    bad(binomial(NaN, 0.5, 1), /Enter/);
    bad(binomial(0, 0.5, 0), /at least 1/);
    bad(binomial(100001, 0.5, 1), /limited/);
    bad(binomial(10, 1.5, 1), /between 0 and 1/);
    bad(binomial(10, 0.5, 11), /between 0 and the number of trials/);
  });
  it('parseProbability reads decimals, percents and fractions', () => {
    expect(parseProbability('25%')).toBe(0.25);
    expect(parseProbability(' 1 / 4 ')).toBe(0.25);
    expect(parseProbability('1e-3')).toBe(0.001);
    expect(parseProbability('.5')).toBe(0.5);
    for (const s of ['', '1/0', 'abc', '50 %%', '1/2/3']) expect(parseProbability(s)).toBeNaN();
  });
});

/* ------------------------------------------------------------------ */
/* w500/stats2                                                          */
/* ------------------------------------------------------------------ */

describe('stats2 distributions', () => {
  it('tSf: invalid input, infinities and the normal limit', () => {
    expect(tSf(NaN, 3)).toBeNaN();
    expect(tSf(1, 0)).toBeNaN();
    expect(tSf(Infinity, 3)).toBe(0);
    expect(tSf(-Infinity, 3)).toBe(1);
    expect(tSf(Z975, 1e9)).toBeCloseTo(0.025, 12);
    expect(tSf(-1, 1)).toBeCloseTo(0.75, 14);
  });
  it('incomplete gamma: both branches against e^−x, and invalid input', () => {
    expect(gammaP(NaN, 1)).toBeNaN();
    expect(gammaP(0, 1)).toBeNaN();
    expect(gammaQ(-1, 1)).toBeNaN();
    expect(gammaQ(1, NaN)).toBeNaN();
    expect(gammaP(1, 0)).toBe(0);
    expect(gammaQ(1, -1)).toBe(1);
    expect(gammaP(1, Infinity)).toBe(1);
    expect(gammaQ(1, Infinity)).toBe(0);
    expect(gammaP(1, 1)).toBeCloseTo(1 - Math.exp(-1), 14); // CF branch (x ≥ a + 1)
    expect(gammaP(1, 0.5)).toBeCloseTo(1 - Math.exp(-0.5), 14); // series branch
    expect(gammaQ(1, 0.5)).toBeCloseTo(0.6065306597126334, 14);
    expect(gammaQ(1, 10) / 4.5399929762484854e-5).toBeCloseTo(1, 12);
    expect(chiSquareCdf(3, 2)).toBeCloseTo(1 - Math.exp(-1.5), 14);
    expect(chiSquareSf(40, 2) / Math.exp(-20)).toBeCloseTo(1, 10);
  });
  it('F distribution: F(2, 2) has cdf x/(1 + x)', () => {
    expect(fCdf(NaN, 2, 2)).toBeNaN();
    expect(fCdf(1, 0, 2)).toBeNaN();
    expect(fSf(1, 2, -1)).toBeNaN();
    expect(fCdf(-1, 2, 2)).toBe(0);
    expect(fSf(0, 2, 2)).toBe(1);
    expect(fCdf(Infinity, 2, 2)).toBe(1);
    expect(fSf(Infinity, 2, 2)).toBe(0);
    expect(fCdf(3, 2, 2)).toBeCloseTo(0.75, 14);
    expect(fSf(3, 2, 2)).toBeCloseTo(0.25, 14);
  });
  it('quantiles of chi-square and F', () => {
    expect(chiSquareInv(0.95, 2)).toBeCloseTo(-2 * Math.log(0.05), 10); // 5.99146
    expect(chiSquareInv(0.95, 1)).toBeCloseTo(Z975 ** 2, 10); // 3.84146
    expect(chiSquareInv(0.05, 2)).toBeCloseTo(-2 * Math.log(0.95), 12);
    expect(chiSquareInv(0, 3)).toBe(0);
    expect(chiSquareInv(1, 3)).toBe(Infinity);
    expect(chiSquareInv(NaN, 3)).toBeNaN();
    expect(chiSquareInv(1.5, 3)).toBeNaN();
    expect(chiSquareInv(0.5, 0)).toBeNaN();
    expect(fInv(0.95, 2, 2)).toBeCloseTo(19, 9); // p/(1 − p)
    expect(fInv(0.05, 2, 2)).toBeCloseTo(1 / 19, 12);
    expect(fInv(0.5, 0, 2)).toBeNaN();
  });
  it('pdfs at and below zero', () => {
    expect(chiSquarePdf(-1, 2)).toBe(0);
    expect(chiSquarePdf(0, 2)).toBe(0.5);
    expect(chiSquarePdf(0, 1)).toBe(Infinity);
    expect(chiSquarePdf(0, 3)).toBe(0);
    expect(chiSquarePdf(2, 2)).toBeCloseTo(0.5 * Math.exp(-1), 14);
    expect(fPdf(-1, 2, 2)).toBe(0);
    expect(fPdf(0, 2, 5)).toBe(1);
    expect(fPdf(0, 1, 5)).toBe(Infinity);
    expect(fPdf(0, 3, 5)).toBe(0);
    expect(fPdf(1, 2, 2)).toBeCloseTo(0.25, 14); // 1/(1 + x)²
  });
});

describe('pValue', () => {
  it('validates the statistic, alpha and degrees of freedom', () => {
    bad(pValue({ dist: 'z', stat: NaN, tail: 'two' }), /test statistic/);
    bad(pValue({ dist: 'z', stat: 1, tail: 'two', alpha: 0 }), /significance level/);
    bad(pValue({ dist: 't', stat: 1, tail: 'two', df1: 0 }), /Degrees of freedom/);
    bad(pValue({ dist: 'chi2', stat: 1, tail: 'right', df1: NaN }), /Degrees of freedom/);
    bad(pValue({ dist: 'f', stat: 1, tail: 'right', df1: 2, df2: 0 }), /Denominator/);
    bad(pValue({ dist: 'chi2', stat: -1, tail: 'right', df1: 1 }), /chi-square statistic cannot be negative/);
    bad(pValue({ dist: 'f', stat: -1, tail: 'right', df1: 1, df2: 1 }), /F statistic cannot be negative/);
  });
  it('tails, critical values and df reporting', () => {
    const z = val(pValue({ dist: 'z', stat: Z975, tail: 'two' }));
    expect(z.p).toBeCloseTo(0.05, 12);
    expect(z.significant).toBe(true); // p ≤ α
    expect(z.critical[1]).toBeCloseTo(Z975, 12);
    expect(z).not.toHaveProperty('df1');
    const c = val(pValue({ dist: 'chi2', stat: Z975 ** 2, tail: 'right', df1: 1 }));
    expect(c.p).toBeCloseTo(0.05, 12);
    expect(c.twoTailed).toBeCloseTo(0.1, 12); // 2 × min(left, right)
    const f = val(pValue({ dist: 'f', stat: 19, tail: 'right', df1: 2, df2: 2 }));
    expect(f.p).toBeCloseTo(0.05, 12);
    expect(f.df2).toBe(2);
    const left = val(pValue({ dist: 't', stat: -1, tail: 'left', df1: 1 }));
    expect(left.p).toBeCloseTo(0.25, 12);
    expect(left.critical[0]).toBeCloseTo(-Math.tan(0.45 * Math.PI), 8); // t₀.₀₅ with 1 df
    expect(cdfOf('t', 1, 1)).toBeCloseTo(0.75, 14);
    expect(sfOf('f', 3, 2, 2)).toBeCloseTo(0.25, 14);
    expect(quantileOf('z', 0.975)).toBeCloseTo(Z975, 12);
  });
});

describe('regression', () => {
  it('summary, parsing and input errors', () => {
    expect(sampleSummary([]).mean).toBeNaN();
    expect(sampleSummary([5]).variance).toBeNaN();
    expect(sampleSummary([10000001, 10000003, 10000002]).sd).toBe(1); // NIST NumAcc1
    expect(parsePairs('x,y\n1,2\n3 4\nbad\n5;6;7\n\n')).toEqual({ xs: [1, 3], ys: [2, 4], invalid: ['bad', '5;6;7'] });
    bad(linearRegression([1, 2], [1, 2, 3]), /same number/);
    bad(linearRegression([1, 2], [1, 2]), /at least 3/);
    bad(linearRegression([1, 2, NaN], [1, 2, 3]), /finite/);
    bad(linearRegression([1, 2, 3], [1, 2, 3], 1), /Confidence/);
    bad(linearRegression([2, 2, 2], [1, 2, 3]), /vertical/);
  });
  it('hand-worked fit: x = 1..5, y = 2, 4, 5, 4, 5', () => {
    // Sxx = 10, Sxy = 6 → b = 0.6, a = 4 − 0.6·3 = 2.2; SSE = 2.4, SST = 6 → R² = 0.6
    const r = val(linearRegression([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]));
    expect(r.slope).toBeCloseTo(0.6, 14);
    expect(r.intercept).toBeCloseTo(2.2, 14);
    expect(r.sse).toBeCloseTo(2.4, 13);
    expect(r.r2).toBeCloseTo(0.6, 13);
    expect(r.se).toBeCloseTo(Math.sqrt(0.8), 13);
    expect(r.seSlope).toBeCloseTo(Math.sqrt(0.08), 13);
    // t = 0.6/√0.08 with 3 df: p = 2(1 − F₃(t)), F₃ closed form ½ + (x/(1+x²) + atan x)/π with x = t/√3
    expect(r.pSlope).toBeCloseTo(0.12402706265755459, 10);
    expect(r.pF).toBeCloseTo(0.12402706265755459, 10); // F = t² for one predictor
    const p = predict(r, 6);
    expect(p.y).toBeCloseTo(5.8, 13);
    expect(p.extrapolation).toBe(true);
    expect(predict(r, 3).extrapolation).toBe(false);
    expect(p.predictionInterval[1] - p.y).toBeGreaterThan(p.meanCi[1] - p.y);
  });
  it('a perfect fit is significant; a perfectly flat y has an undefined slope test (as in R)', () => {
    const fit = val(linearRegression([1, 2, 3, 4], [3, 5, 7, 9]));
    expect(fit.r).toBeCloseTo(1, 14);
    expect(fit.pSlope).toBe(0);
    expect(fit.pF).toBe(0);
    // y constant: slope 0 with SE 0, t = 0/0. Before the fix p was reported as 0 ("< 1e-300").
    const flat = val(linearRegression([1, 2, 3], [5, 5, 5]));
    expect(flat.slope).toBe(0);
    expect(flat.r2).toBeNaN();
    expect(flat.pSlope).toBeNaN();
    expect(flat.pF).toBeNaN();
  });
});

describe('t-tests', () => {
  it('one-sample errors and one-sided intervals', () => {
    bad(oneSampleT({ mean: 1, sd: 1, n: 5, alternative: 'both' as 'less' }), /Unknown alternative/);
    bad(oneSampleT({ mean: 1, sd: 1, n: 5, confidence: 1 }), /Confidence/);
    bad(oneSampleT({ mean: 1, sd: 1, n: 5, mu0: NaN }), /hypothesised/);
    bad(oneSampleT({ mean: NaN, sd: 1, n: 5 }), /sample mean/);
    bad(oneSampleT({ mean: 1, sd: 0, n: 5 }), /greater than 0/);
    bad(oneSampleT({ mean: 1, sd: 1, n: 1 }), /at least 2/);
    // n = 2 → df 1: t = (mean − mu0)/(sd/√2) = 1/(1/√2) = √2
    const g = val(oneSampleT({ mean: 1, sd: 1, n: 2, alternative: 'greater' }));
    expect(g.t).toBeCloseTo(Math.SQRT2, 14);
    expect(g.p).toBeCloseTo(0.5 - Math.atan(Math.SQRT2) / Math.PI, 12);
    expect(g.ci[1]).toBe(Infinity);
    const l = val(oneSampleT({ mean: 1, sd: 1, n: 2, alternative: 'less' }));
    expect(l.ci[0]).toBe(-Infinity);
    expect(l.p + g.p).toBeCloseTo(1, 14);
  });
  it('paired errors and zero spread', () => {
    bad(pairedT([1, 2], [1]), /same number/);
    bad(pairedT([1], [1]), /at least 2/);
    bad(pairedT([3, 4, 5], [1, 2, 3]), /identical/);
    const p = val(pairedT([2, 4], [1, 1]));
    expect(p.kind).toBe('paired');
    expect(p.estimate).toBe(2); // differences 1 and 3
  });
  it('two-sample errors, pooled vs Welch, and a zero-SD group', () => {
    const base = { mean1: 5, sd1: 1, n1: 10, mean2: 4, sd2: 1, n2: 10 };
    bad(twoSampleT({ ...base, mean1: NaN }), /both group means/);
    bad(twoSampleT({ ...base, sd2: -1 }), /zero or more/);
    bad(twoSampleT({ ...base, sd1: 0, sd2: 0 }), /At least one group/);
    bad(twoSampleT({ ...base, n2: 1 }), /at least 2/);
    bad(twoSampleT({ ...base, n1: 2.5 }), /whole-number/);
    bad(twoSampleT({ ...base, confidence: 0 }), /Confidence/);
    const pooled = val(twoSampleT({ ...base, equalVariances: true }));
    expect(pooled.df).toBe(18);
    expect(pooled.se).toBeCloseTo(Math.sqrt(0.2), 14);
    const welch = val(twoSampleT(base));
    expect(welch.df).toBeCloseTo(18, 12); // equal variances and sizes: Welch df = n1 + n2 − 2
    // Hedges' g = d·(1 − 3/(4·20 − 9)), d = 1
    expect(welch.hedgesG).toBeCloseTo(1 - 3 / 71, 14);
    const oneFlat = val(twoSampleT({ ...base, sd1: 0 }));
    expect(oneFlat.df).toBeCloseTo(9, 12); // only group 2 contributes: n2 − 1
  });
});

describe('chi-square tests', () => {
  it('goodness of fit errors', () => {
    bad(chiSquareGoodnessOfFit([5]), /at least 2/);
    bad(chiSquareGoodnessOfFit([5, -1]), /zero or more/);
    bad(chiSquareGoodnessOfFit([0, 0]), /add up to 0/);
    bad(chiSquareGoodnessOfFit([5, 5], [1]), /2 observed counts but 1 expected/);
    bad(chiSquareGoodnessOfFit([5, 5], [1, 0]), /greater than 0/);
    bad(chiSquareGoodnessOfFit([5, 5], [], 0.5), /whole number/);
    bad(chiSquareGoodnessOfFit([5, 5], [], 1), /below 1/);
  });
  it('goodness of fit values', () => {
    const fair = val(chiSquareGoodnessOfFit([10, 10, 10, 10, 10, 10]));
    expect(fair.chi2).toBe(0);
    expect(fair.p).toBe(1);
    // [10, 20] vs uniform: E = 15 → χ² = 2·25/15 = 10/3, p = erfc(√(5/3)) with 1 df
    const g = val(chiSquareGoodnessOfFit([10, 20]));
    expect(g.chi2).toBeCloseTo(10 / 3, 14);
    expect(g.p).toBeCloseTo(0.06788915486182902, 12);
    // percentages are rescaled to the total
    const w = val(chiSquareGoodnessOfFit([30, 70], [25, 75]));
    expect(w.expected).toEqual([25, 75]);
    expect(w.lowExpected).toBe(0);
  });
  it('independence errors', () => {
    bad(chiSquareIndependence([[1, 2]]), /at least 2 rows/);
    bad(chiSquareIndependence([[1], [2]]), /at least 2 columns/);
    bad(chiSquareIndependence([[1, 2], [3]]), /same number of columns/);
    bad(chiSquareIndependence([[1, -2], [3, 4]]), /zero or more/);
    bad(chiSquareIndependence([[0, 0], [0, 0]]), /empty/);
    bad(chiSquareIndependence([[0, 0], [3, 4]]), /row adds up to 0/);
    bad(chiSquareIndependence([[0, 2], [0, 4]]), /column adds up to 0/);
  });
  it('2 × 2 with and without Yates, and Yates ignored for larger tables', () => {
    // [[10, 20], [30, 40]]: E = [[12, 18], [28, 42]], every |O − E| = 2
    const t = [[10, 20], [30, 40]];
    const plain = val(chiSquareIndependence(t));
    expect(plain.chi2).toBeCloseTo(4 / 12 + 4 / 18 + 4 / 28 + 4 / 42, 14);
    expect(plain.phi).toBeCloseTo(-200 / Math.sqrt(30 * 70 * 40 * 60), 14);
    const y = val(chiSquareIndependence(t, true));
    expect(y.yates).toBe(true);
    expect(y.chi2).toBeCloseTo(2.25 * (1 / 12 + 1 / 18 + 1 / 28 + 1 / 42), 14); // (2 − 0.5)²
    expect(y.cramersV).toBeCloseTo(Math.abs(plain.phi!), 14);
    const big = val(chiSquareIndependence([[1, 2], [3, 4], [5, 6]], true));
    expect(big.yates).toBe(false);
    expect(big.phi).toBeUndefined();
    expect(big.df).toBe(2);
  });
  it('parseTable labels, bad cells and ragged rows', () => {
    expect(parseTable('\tYes\tNo\nMen\t10\t20\nWomen\t30\t40')).toEqual({ table: [[10, 20], [30, 40]], rowLabels: ['Men', 'Women'], colLabels: ['Yes', 'No'] });
    expect(parseTable('1 2\n3 4')).toEqual({ table: [[1, 2], [3, 4]], rowLabels: [], colLabels: [] });
    expect(parseTable('1, 2\n3, x').error).toBe('"x" is not a number.');
    expect(parseTable('1 2\n3').error).toMatch(/different numbers of cells/);
    expect(parseTable('').table).toEqual([]);
  });
});

describe('normal probabilities and inverse', () => {
  it('validation and the upper-tail branch', () => {
    bad(normalProbabilities(NaN, 1, 0, 1), /mean/);
    bad(normalProbabilities(0, 0, 0, 1), /greater than 0/);
    bad(normalProbabilities(0, 1, NaN, 1), /bound/);
    const up = val(normalProbabilities(100, 15, 145, 130)); // z from 2 to 3, bounds swapped
    expect(up.zLower).toBe(2);
    expect(up.between).toBeCloseTo(0.0214002339165491, 13); // Φ(3) − Φ(2)
    expect(up.outside + up.between).toBeCloseTo(1, 14);
  });
  it('every inverse tail', () => {
    bad(normalInverse(NaN, 1, 0.5, 'left'), /mean/);
    bad(normalInverse(0, -1, 0.5, 'left'), /greater than 0/);
    bad(normalInverse(0, 1, 0, 'left'), /strictly between/);
    bad(normalInverse(0, 1, 1, 'left'), /strictly between/);
    expect(val(normalInverse(100, 15, 0.975, 'left')).x[0]).toBeCloseTo(100 + 15 * Z975, 10);
    expect(val(normalInverse(0, 1, 0.025, 'right')).z[0]).toBeCloseTo(Z975, 12);
    expect(val(normalInverse(0, 1, 0.95, 'central')).z).toEqual([expect.closeTo(-Z975, 12), expect.closeTo(Z975, 12)]);
    expect(val(normalInverse(0, 1, 0.05, 'outside')).z[1]).toBeCloseTo(Z975, 12);
  });
});

describe('ANOVA and Levene', () => {
  it('holmAdjust matches R p.adjust(method = "holm")', () => {
    expect(holmAdjust([0.01, 0.02, 0.03, 0.04])).toEqual([0.04, 0.06, 0.06, 0.06]);
    expect(holmAdjust([0.04, 0.01])).toEqual([0.04, 0.02]);
    expect(holmAdjust([0.9, 0.8])).toEqual([1, 1]);
    expect(holmAdjust([])).toEqual([]);
  });
  it('oneWayAnova validation', () => {
    const g = (name: string, n: number, mean: number, sd: number) => ({ name, n, mean, sd });
    bad(oneWayAnova([g('A', 3, 1, 1)]), /at least 2 groups/);
    bad(oneWayAnova(Array.from({ length: 11 }, (_, i) => g(`G${i}`, 3, i, 1))), /At most 10/);
    bad(oneWayAnova([g('A', 0, 1, 1), g('B', 3, 1, 1)]), /"A" needs at least 1 value/);
    bad(oneWayAnova([g('A', 3, NaN, 1), g('B', 3, 1, 1)]), /needs a mean/);
    bad(oneWayAnova([g('A', 3, 1, -1), g('B', 3, 1, 1)]), /0 or more/);
    bad(oneWayAnova([g('A', 1, 1, 2), g('B', 3, 1, 1)]), /must be 0/);
    bad(oneWayAnova([g('A', 1, 1, 0), g('B', 1, 2, 0)]), /more observations than groups/);
    bad(oneWayAnova([g('A', 3, 1, 0), g('B', 3, 2, 0)]), /zero spread/);
  });
  it('hand-worked ANOVA: [1, 2, 3] vs [4, 5, 6]', () => {
    // means 2 and 5, SD 1; SSB = 2·3·1.5² = 13.5, SSW = 4, MSW = 1 → F = 13.5 on (1, 4)
    const a = val(oneWayAnova(anovaGroupsFromData([{ name: 'A', values: [1, 2, 3] }, { name: 'B', values: [4, 5, 6] }])));
    expect(a.ssBetween).toBeCloseTo(13.5, 13);
    expect(a.ssWithin).toBeCloseTo(4, 13);
    expect(a.f).toBeCloseTo(13.5, 12);
    expect(a.p).toBeCloseTo(0.021311641128767156, 9); // two-sided t test, t = √13.5, 4 df (Simpson integration)
    expect(a.etaSquared).toBeCloseTo(13.5 / 17.5, 13);
    expect(a.welch!.f).toBeCloseTo(13.5, 10); // equal n and SD: Welch F equals the classic F
    expect(a.pairwise[0].p).toBeCloseTo(a.p, 12);
    // a single-value group disables the Welch test
    const solo = val(oneWayAnova([{ name: 'A', n: 1, mean: 3, sd: 0 }, { name: 'B', n: 3, mean: 5, sd: 1 }]));
    expect(solo.welch).toBeNull();
    expect(anovaGroupsFromData([{ name: 'x', values: [4] }])[0].sd).toBe(0);
  });
  it('Levene (Brown-Forsythe): validation and a hand-worked case', () => {
    bad(leveneTest([[1, 2]]), /at least 2 groups/);
    bad(leveneTest([[1, 2], [3]]), /at least 2 values/);
    bad(leveneTest([[1, 1], [2, 2]]), /undefined/);
    // medians 2 and 3 → deviations [1, 0, 1] and [2, 0, 2]: F = (2/3)/(10/3 / 4) = 0.8 on (1, 4)
    const l = val(leveneTest([[1, 2, 3], [1, 3, 5]]));
    expect(l.f).toBeCloseTo(0.8, 13);
    expect([l.df1, l.df2]).toEqual([1, 4]);
    expect(l.p).toBeCloseTo(0.42164825517618565, 9);
  });
});
