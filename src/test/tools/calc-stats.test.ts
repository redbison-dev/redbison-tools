import { describe as group, it, expect } from 'vitest';
import {
  parseNumbers, describe, summarize, quartiles, modes, median, normalCdf, normalSf, normalInv, zCritical,
  zProbabilities, zFromX, xFromZ, normalBetween, tCdf, tInv, tCritical, lnGamma, meanCi, proportionCi,
  sampleSizeProportion, sampleSizeMean, marginOfError, countArrangements, describeBig, factorialBig,
  binomialBig, listArrangements, twoEvents, atLeastOne, binomial, fmt, parseProbability, type Result,
} from '@/lib/tools/calculators/stats';

function ok<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

group('parseNumbers', () => {
  it('accepts commas, spaces, new lines, tabs and semicolons', () => {
    expect(parseNumbers('1, 2 3\n4\t5;6|7').values).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it('keeps negatives, decimals and exponents and reports bad tokens', () => {
    const r = parseNumbers('-1.5 .25 2e3 abc 4x (7)');
    expect(r.values).toEqual([-1.5, 0.25, 2000, 7]);
    expect(r.invalid).toEqual(['abc', '4x']);
  });
  it('returns nothing for blank input', () => {
    expect(parseNumbers('  \n ').values).toEqual([]);
  });
});

group('standard deviation (describe)', () => {
  it('matches the textbook data set 2,4,4,4,5,5,7,9', () => {
    const d = ok(describe([2, 4, 4, 4, 5, 5, 7, 9]));
    expect(d.mean).toBe(5);
    expect(d.sumSquares).toBe(32);
    expect(d.populationSd).toBe(2);
    expect(d.populationVariance).toBe(4);
    expect(d.sampleVariance).toBeCloseTo(32 / 7, 12);
    expect(d.sampleSd).toBeCloseTo(2.138089935299395, 12);
    expect(d.standardError).toBeCloseTo(2.138089935299395 / Math.sqrt(8), 12);
    expect(d.cvSample).toBeCloseTo(0.427617987059879, 12);
    expect(d.range).toBe(7);
  });
  it('matches NIST StRD NumAcc1 (certified mean 10000002, sd 1)', () => {
    const d = ok(describe([10000001, 10000003, 10000002]));
    expect(d.mean).toBe(10000002);
    expect(d.sampleSd).toBe(1);
  });
  it('matches NIST StRD NumAcc3 (1001 values near 1e6, certified sd 0.1)', () => {
    const data = [1000000.2];
    for (let i = 0; i < 500; i++) data.push(1000000.1, 1000000.3);
    const d = ok(describe(data));
    expect(d.mean).toBeCloseTo(1000000.2, 8);
    expect(d.sampleSd).toBeCloseTo(0.1, 9);
  });
  it('is numerically stable for large offsets (Welford)', () => {
    const d = ok(describe([1e9 + 4, 1e9 + 7, 1e9 + 13, 1e9 + 16]));
    expect(d.sampleVariance).toBeCloseTo(30, 6);
  });
  it('handles a single value and rejects empty input', () => {
    const d = ok(describe([42]));
    expect(d.populationSd).toBe(0);
    expect(Number.isNaN(d.sampleSd)).toBe(true);
    expect(describe([]).ok).toBe(false);
  });
  it('leaves CV undefined when the mean is zero', () => {
    expect(Number.isNaN(ok(describe([-1, 1])).cvSample)).toBe(true);
  });
});

group('mean, median, mode and quartiles', () => {
  // Wikipedia "Quartile" worked examples.
  const odd = [6, 7, 15, 36, 39, 40, 41, 42, 43, 47, 49];
  const even = [7, 15, 36, 39, 40, 41];
  it('median for odd and even counts', () => {
    expect(median(odd)).toBe(40);
    expect(median(even)).toBe(37.5);
  });
  it('quartiles by the median-excluded halves method (TI-84)', () => {
    expect(quartiles(odd, 'exclusive-halves')).toEqual({ q1: 15, q2: 40, q3: 43 });
    expect(quartiles(even, 'exclusive-halves')).toEqual({ q1: 15, q2: 37.5, q3: 40 });
  });
  it('quartiles by Tukey hinges (R fivenum)', () => {
    expect(quartiles(odd, 'tukey')).toEqual({ q1: 25.5, q2: 40, q3: 42.5 });
    expect(quartiles(even, 'tukey')).toEqual({ q1: 15, q2: 37.5, q3: 40 });
  });
  it('quartiles by Excel QUARTILE.INC / R type 7', () => {
    expect(quartiles(odd, 'inclusive')).toEqual({ q1: 25.5, q2: 40, q3: 42.5 });
    const q = quartiles(even, 'inclusive');
    expect(q.q1).toBeCloseTo(20.25, 12);
    expect(q.q3).toBeCloseTo(39.75, 12);
  });
  it('quartiles by Excel QUARTILE.EXC / R type 6', () => {
    expect(quartiles(odd, 'exclusive')).toEqual({ q1: 15, q2: 40, q3: 43 });
    const q = quartiles(even, 'exclusive');
    expect(q.q1).toBeCloseTo(13, 12);
    expect(q.q3).toBeCloseTo(40.25, 12);
  });
  it('modes: unimodal, bimodal, none', () => {
    expect(modes([1, 2, 2, 3])).toMatchObject({ modes: [2], frequency: 2, kind: 'unimodal' });
    expect(modes([1, 1, 2, 3, 3])).toMatchObject({ modes: [1, 3], kind: 'bimodal' });
    expect(modes([1, 2, 3]).kind).toBe('none');
    expect(modes([4, 4, 5, 5]).kind).toBe('none');
    expect(modes([7, 7, 7]).modes).toEqual([7]);
    expect(modes([1, 1, 2, 2, 3, 3, 4]).kind).toBe('multimodal');
  });
  it('summary flags outliers beyond 1.5 x IQR', () => {
    const s = ok(summarize([1, 2, 3, 4, 5, 6, 7, 8, 9, 100], 'exclusive-halves'));
    expect(s.q1).toBe(3);
    expect(s.q3).toBe(8);
    expect(s.iqr).toBe(5);
    expect(s.upperFence).toBe(15.5);
    expect(s.outliers).toEqual([100]);
    expect(s.whiskerHigh).toBe(9);
    expect(s.mean).toBe(14.5);
    expect(s.median).toBe(5.5);
  });
  it('geometric and harmonic means for positive data', () => {
    const s = ok(summarize([1, 2, 4], 'inclusive'));
    expect(s.geometricMean).toBeCloseTo(2, 12);
    expect(s.harmonicMean).toBeCloseTo(12 / 7, 12);
    expect(Number.isNaN(ok(summarize([-1, 2], 'inclusive')).geometricMean)).toBe(true);
  });
});

group('normal distribution', () => {
  it('matches standard normal table values', () => {
    expect(normalCdf(0)).toBe(0.5);
    expect(normalCdf(1)).toBeCloseTo(0.8413447460685429, 14);
    expect(normalCdf(1.96)).toBeCloseTo(0.9750021048517795, 14);
    expect(normalCdf(0.5)).toBeCloseTo(0.6914624612740131, 14);
    expect(normalCdf(-1.645)).toBeCloseTo(0.04998490553912, 12);
    expect(normalCdf(-2.33)).toBeCloseTo(0.009903075559164252, 14);
  });
  it('keeps relative precision far in the tails', () => {
    const rel = (a: number, b: number) => Math.abs(a - b) / b;
    expect(rel(normalCdf(-3), 0.0013498980316300946)).toBeLessThan(1e-12);
    expect(rel(normalSf(5), 2.866515718791939e-7)).toBeLessThan(1e-12);
    expect(rel(normalSf(8), 6.220960574271785e-16)).toBeLessThan(1e-12);
    expect(rel(normalCdf(-6), 9.865876450376946e-10)).toBeLessThan(1e-12);
  });
  it('inverse matches well-known critical values', () => {
    expect(normalInv(0.975)).toBeCloseTo(1.959963984540054, 13);
    expect(normalInv(0.995)).toBeCloseTo(2.5758293035489004, 13);
    expect(normalInv(0.95)).toBeCloseTo(1.6448536269514722, 13);
    expect(normalInv(0.9)).toBeCloseTo(1.2815515655446004, 13);
    expect(normalInv(0.5)).toBe(0);
    expect(normalInv(1e-10)).toBeCloseTo(-6.361340902404056, 11);
    expect(normalInv(0.025)).toBeCloseTo(-1.959963984540054, 13);
    expect(normalInv(0)).toBe(-Infinity);
    expect(Number.isNaN(normalInv(1.2))).toBe(true);
  });
  it('inverse round-trips the CDF', () => {
    for (const z of [-7, -3.2, -1, 0.1, 0.77, 2.4, 4]) expect(normalInv(normalCdf(z))).toBeCloseTo(z, 8);
  });
  it('z-score probabilities', () => {
    const p = zProbabilities(1.96);
    expect(p.twoTailed).toBeCloseTo(0.04999579029644087, 13);
    expect(p.between).toBeCloseTo(0.9500042097035591, 13);
    expect(p.percentile).toBeCloseTo(97.50021048517795, 11);
    expect(normalBetween(-1, 1)).toBeCloseTo(0.6826894921370859, 13);
    expect(normalBetween(2, 1)).toBeCloseTo(0.13590512198327787, 13);
    expect(zCritical(0.95)).toBeCloseTo(1.959963984540054, 13);
  });
  it('z from x and x from z', () => {
    expect(ok(zFromX(85, 70, 10))).toBe(1.5);
    expect(ok(xFromZ(-2, 100, 15))).toBe(70);
    expect(zFromX(1, 0, 0).ok).toBe(false);
  });
});

group('Student t distribution', () => {
  it('lnGamma matches known values', () => {
    expect(lnGamma(1)).toBeCloseTo(0, 14);
    expect(lnGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 14);
    expect(lnGamma(10)).toBeCloseTo(Math.log(362880), 12);
  });
  it('critical values match a t table', () => {
    expect(tInv(0.975, 1)).toBeCloseTo(12.706204736174698, 9);
    expect(tInv(0.975, 2)).toBeCloseTo(4.302652729749464, 10);
    expect(tInv(0.975, 5)).toBeCloseTo(2.570581835636314, 10);
    expect(tInv(0.975, 10)).toBeCloseTo(2.228138851986274, 10);
    expect(tInv(0.975, 30)).toBeCloseTo(2.042272456301238, 10);
    expect(tInv(0.995, 30)).toBeCloseTo(2.749995653567, 9);
    expect(tInv(0.95, 20)).toBeCloseTo(1.724718242920787, 10);
    expect(tCritical(0.99, 4)).toBeCloseTo(4.604094871415897, 9);
    expect(tInv(0.025, 10)).toBeCloseTo(-2.228138851986274, 10);
  });
  it('CDF matches closed forms (df = 1 is Cauchy, df = 2 has a formula)', () => {
    expect(tCdf(1, 1)).toBeCloseTo(0.75, 13);
    expect(tCdf(-3, 1)).toBeCloseTo(0.5 + Math.atan(-3) / Math.PI, 13);
    const t = 1.5;
    expect(tCdf(t, 2)).toBeCloseTo(0.5 + t / (2 * Math.sqrt(2 + t * t)), 13);
    expect(tCdf(0, 7)).toBeCloseTo(0.5, 14);
  });
  it('approaches the normal for large df', () => {
    expect(tInv(0.975, 1e7)).toBeCloseTo(1.959964, 5);
  });
});

group('confidence intervals', () => {
  it('z interval for a mean with known sigma', () => {
    const r = ok(meanCi({ mean: 100, sd: 15, n: 36, confidence: 0.95, method: 'z' }));
    expect(r.standardError).toBe(2.5);
    expect(r.margin).toBeCloseTo(4.899909961350135, 10);
    expect(r.lower).toBeCloseTo(95.10009, 5);
  });
  it('t interval for a mean with sample sd', () => {
    const r = ok(meanCi({ mean: 50, sd: 8, n: 11, confidence: 0.95, method: 't' }));
    expect(r.df).toBe(10);
    expect(r.critical).toBeCloseTo(2.228138852, 8);
    expect(r.margin).toBeCloseTo(2.228138851986274 * 8 / Math.sqrt(11), 9);
  });
  it('rejects a t interval from one observation', () => {
    expect(meanCi({ mean: 1, sd: 1, n: 1, confidence: 0.95, method: 't' }).ok).toBe(false);
  });
  it('Wald and Wilson match Newcombe (1998) example 81/263', () => {
    const r = ok(proportionCi(81, 263, 0.95));
    expect(r.wald.lower).toBeCloseTo(0.2522, 4);
    expect(r.wald.upper).toBeCloseTo(0.3638, 4);
    expect(r.wilson.lower).toBeCloseTo(0.2553, 4);
    expect(r.wilson.upper).toBeCloseTo(0.3662, 4);
  });
  it('Wilson stays sensible with 0 successes where Wald collapses (Newcombe 0/20)', () => {
    const r = ok(proportionCi(0, 20, 0.95));
    expect(r.wald.lower).toBe(0);
    expect(r.wald.upper).toBe(0);
    expect(r.wilson.lower).toBe(0);
    expect(r.wilson.upper).toBeCloseTo(0.1611, 4);
    expect(r.smallCounts).toBe(true);
  });
  it('Wilson for 1/29 and 15/148 (Newcombe)', () => {
    const a = ok(proportionCi(1, 29, 0.95));
    expect(a.wilson.lower).toBeCloseTo(0.0061, 4);
    expect(a.wilson.upper).toBeCloseTo(0.1718, 4);
    const b = ok(proportionCi(15, 148, 0.95));
    expect(b.wilson.lower).toBeCloseTo(0.0624, 4);
    expect(b.wilson.upper).toBeCloseTo(0.1605, 4);
  });
  it('validates successes against n', () => {
    expect(proportionCi(5, 4, 0.95).ok).toBe(false);
    expect(proportionCi(1.5, 4, 0.95).ok).toBe(false);
  });
});

group('sample size', () => {
  it('gives the classic 385 for 95% / ±5% / p = 0.5', () => {
    const r = ok(sampleSizeProportion({ confidence: 0.95, margin: 0.05 }));
    expect(r.n0).toBeCloseTo(384.1458820694124, 8);
    expect(r.n).toBe(385);
  });
  it('matches other standard survey sizes', () => {
    expect(ok(sampleSizeProportion({ confidence: 0.99, margin: 0.05 })).n).toBe(664);
    expect(ok(sampleSizeProportion({ confidence: 0.9, margin: 0.05 })).n).toBe(271);
    expect(ok(sampleSizeProportion({ confidence: 0.95, margin: 0.03 })).n).toBe(1068);
    expect(ok(sampleSizeProportion({ confidence: 0.95, margin: 0.01 })).n).toBe(9604);
    expect(ok(sampleSizeProportion({ confidence: 0.95, margin: 0.05, p: 0.1 })).n).toBe(139);
  });
  it('applies the finite population correction', () => {
    expect(ok(sampleSizeProportion({ confidence: 0.95, margin: 0.05, population: 1000 })).n).toBe(278);
    expect(ok(sampleSizeProportion({ confidence: 0.95, margin: 0.05, population: 100 })).n).toBe(80);
    expect(ok(sampleSizeProportion({ confidence: 0.95, margin: 0.05, population: 10000 })).n).toBe(370);
  });
  it('sample size for a mean', () => {
    // (1.96 x 15 / 2)^2 = 216.09 -> 217
    expect(ok(sampleSizeMean({ confidence: 0.95, margin: 2, sd: 15 })).n).toBe(217);
  });
  it('margin of error from n', () => {
    expect(ok(marginOfError({ confidence: 0.95, n: 1000 })).margin).toBeCloseTo(0.0309898, 6);
    expect(ok(marginOfError({ confidence: 0.95, n: 385 })).margin).toBeCloseTo(0.04994, 4);
    const fpc = ok(marginOfError({ confidence: 0.95, n: 278, population: 1000 }));
    expect(fpc.margin).toBeLessThan(0.05);
    expect(fpc.margin).toBeGreaterThan(0.049);
  });
  it('rejects impossible inputs', () => {
    expect(sampleSizeProportion({ confidence: 0.95, margin: 0 }).ok).toBe(false);
    expect(sampleSizeProportion({ confidence: 1, margin: 0.05 }).ok).toBe(false);
    expect(marginOfError({ confidence: 0.95, n: 500, population: 100 }).ok).toBe(false);
  });
});

group('permutations and combinations', () => {
  it('known counts', () => {
    expect(ok(countArrangements('permutation', 10, 3))).toBe(720n);
    expect(ok(countArrangements('combination', 52, 5))).toBe(2598960n);
    expect(ok(countArrangements('combination', 49, 6))).toBe(13983816n);
    expect(ok(countArrangements('permutation-repetition', 10, 4))).toBe(10000n);
    expect(ok(countArrangements('combination-repetition', 5, 3))).toBe(35n);
    expect(ok(countArrangements('combination', 5, 0))).toBe(1n);
    expect(ok(countArrangements('permutation', 0, 0))).toBe(1n);
  });
  it('rejects r > n without repetition and negative or fractional inputs', () => {
    expect(countArrangements('combination', 3, 5).ok).toBe(false);
    expect(countArrangements('permutation', -1, 0).ok).toBe(false);
    expect(countArrangements('permutation', 2.5, 1).ok).toBe(false);
    expect(countArrangements('permutation-repetition', 3, 5).ok).toBe(true);
  });
  it('exact big values with scientific summary', () => {
    const f = describeBig(factorialBig(100));
    expect(f.digits).toBe(158);
    expect(f.scientific).toBe('9.33262 × 10^157');
    expect(binomialBig(100, 50).toString()).toBe('100891344545564193334812497256');
    expect(describeBig(720n).scientific).toBe('720');
    expect(describeBig(binomialBig(1000, 500)).digits).toBe(300);
  });
  it('lists small sets', () => {
    expect(listArrangements('combination', ['A', 'B', 'C'], 2).rows).toEqual([['A', 'B'], ['A', 'C'], ['B', 'C']]);
    expect(listArrangements('permutation', ['A', 'B', 'C'], 2).rows.length).toBe(6);
    expect(listArrangements('combination-repetition', ['A', 'B'], 2).rows).toEqual([['A', 'A'], ['A', 'B'], ['B', 'B']]);
    expect(listArrangements('permutation-repetition', ['0', '1'], 3).rows.length).toBe(8);
    const big = listArrangements('permutation', 'ABCDEFG'.split(''), 5, 50);
    expect(big.rows.length).toBe(50);
    expect(big.truncated).toBe(true);
  });
});

group('probability', () => {
  it('independent events', () => {
    const r = ok(twoEvents(0.5, 1 / 6, 'independent'));
    expect(r.and).toBeCloseTo(1 / 12, 14);
    expect(r.or).toBeCloseTo(7 / 12, 14);
    expect(r.neither).toBeCloseTo(5 / 12, 14);
    expect(r.aGivenB).toBeCloseTo(0.5, 14);
    expect(r.independent).toBe(true);
  });
  it('mutually exclusive events', () => {
    const r = ok(twoEvents(1 / 6, 1 / 6, 'exclusive'));
    expect(r.or).toBeCloseTo(1 / 3, 14);
    expect(r.and).toBe(0);
    expect(twoEvents(0.7, 0.5, 'exclusive').ok).toBe(false);
  });
  it('joint and conditional inputs (cards: heart and face card)', () => {
    const r = ok(twoEvents(13 / 52, 12 / 52, 'joint', 3 / 52));
    expect(r.or).toBeCloseTo(22 / 52, 14);
    expect(r.aGivenB).toBeCloseTo(0.25, 14);
    expect(r.independent).toBe(true);
    const c = ok(twoEvents(0.3, 0.4, 'conditional', 0.5));
    expect(c.and).toBeCloseTo(0.15, 14);
    expect(c.aGivenB).toBeCloseTo(0.375, 14);
  });
  it('rejects impossible joint probabilities', () => {
    expect(twoEvents(0.3, 0.4, 'joint', 0.5).ok).toBe(false);
    expect(twoEvents(0.8, 0.9, 'joint', 0.6).ok).toBe(false);
    expect(twoEvents(1.2, 0.5, 'independent').ok).toBe(false);
  });
  it('at least one success: de Méré\'s at least one six in four rolls', () => {
    const r = ok(atLeastOne(1 / 6, 4));
    expect(r.atLeastOne).toBeCloseTo(0.5177469135802469, 14);
    expect(r.trialsFor50).toBe(4);
    expect(r.trialsFor95).toBe(17);
    expect(ok(atLeastOne(1e-9, 1000)).atLeastOne).toBeCloseTo(9.999995005e-7, 15);
    expect(ok(atLeastOne(1, 3)).atLeastOne).toBe(1);
    expect(ok(atLeastOne(0.5, 0)).atLeastOne).toBe(0);
  });
  it('binomial probabilities', () => {
    const r = ok(binomial(10, 0.5, 5));
    expect(r.exactly).toBeCloseTo(252 / 1024, 13);
    expect(r.atMost).toBeCloseTo(638 / 1024, 13);
    expect(r.lessThan).toBeCloseTo(386 / 1024, 13);
    expect(r.atLeast).toBeCloseTo(638 / 1024, 13);
    expect(r.moreThan).toBeCloseTo(386 / 1024, 13);
    expect(r.mean).toBe(5);
    expect(r.sd).toBeCloseTo(Math.sqrt(2.5), 14);
    // 3 sixes in 10 rolls: C(10,3) (1/6)^3 (5/6)^7
    expect(ok(binomial(10, 1 / 6, 3)).exactly).toBeCloseTo(0.15504535957425192, 13);
    expect(ok(binomial(5, 0, 0)).exactly).toBe(1);
    expect(ok(binomial(5, 1, 5)).exactly).toBe(1);
    expect(binomial(5, 0.5, 6).ok).toBe(false);
  });
});

group('parseProbability', () => {
  it('reads decimals, percentages and fractions', () => {
    expect(parseProbability('0.25')).toBe(0.25);
    expect(parseProbability('25%')).toBe(0.25);
    expect(parseProbability('1/6')).toBeCloseTo(1 / 6, 15);
    expect(parseProbability(' 3 / 4 ')).toBe(0.75);
    expect(Number.isNaN(parseProbability('1/0'))).toBe(true);
    expect(Number.isNaN(parseProbability('abc'))).toBe(true);
  });
});

group('fmt', () => {
  it('formats compactly', () => {
    expect(fmt(1234.56789)).toBe('1,234.57');
    expect(fmt(0)).toBe('0');
    expect(fmt(6.220960574271785e-16, 4)).toBe('6.221 × 10^-16');
    expect(fmt(NaN)).toBe('-');
  });
});
