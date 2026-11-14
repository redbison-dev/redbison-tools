/**
 * Pure logic for the inferential statistics calculators: linear regression,
 * t-tests, p-values from z/t/chi-square/F, chi-square tests, the normal
 * distribution and one-way ANOVA.
 *
 * Distribution maths:
 * - Normal and Student t building blocks (Φ, Φ⁻¹, ln Γ, the regularized
 *   incomplete beta I_x(a, b) by Lentz's continued fraction) come from the
 *   existing, tested module ../calculators/stats.
 * - The regularized incomplete gamma P(a, x) and Q(a, x) are implemented here
 *   with the series / continued-fraction split of Numerical Recipes (3rd ed.,
 *   section 6.2), evaluating whichever tail converges directly so small upper
 *   tails such as p = 1e-12 keep their relative precision.
 * - Upper tails are computed directly (never as 1 - cdf) for t, chi-square and F.
 *
 * No React here, so the regression tests exercise exactly what the UI shows.
 */
import { msg, built } from '../../msg';
import {
  normalCdf,
  normalInv,
  tInv,
  lnGamma,
  incompleteBeta,
  parseNumbers,
  type Result,
} from '../calculators/stats';

export type { Result };
export { parseNumbers, tInv };

const okR = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: string): Result<T> => ({ ok: false, error });
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

// ---------------------------------------------------------------------------
// Distributions
// ---------------------------------------------------------------------------

/** Standard normal upper tail P(Z > z). */
export const zSf = (z: number): number => normalCdf(-z);
export const zCdf = (z: number): number => normalCdf(z);

/** Upper tail of Student t, P(T > t), computed directly in both tails. */
export function tSf(t: number, df: number): number {
  if (Number.isNaN(t) || !(df > 0)) return NaN;
  if (t === Infinity) return 0;
  if (t === -Infinity) return 1;
  if (df > 1e8) return zSf(t);
  const tail = 0.5 * incompleteBeta(df / (df + t * t), df / 2, 0.5);
  return t > 0 ? tail : 1 - tail;
}
export const tCdfTail = (t: number, df: number): number => tSf(-t, df);

const FPMIN = 1e-300;
const EPS = 1e-16;

/** Series for P(a, x), valid and fast for x < a + 1. */
function gammaSeries(a: number, x: number): number {
  let ap = a;
  let del = 1 / a;
  let sum = del;
  for (let n = 0; n < 1_000_000; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
}

/** Continued fraction for Q(a, x) by the modified Lentz method, valid for x >= a + 1. */
function gammaContinuedFraction(a: number, x: number): number {
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1_000_000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

/** Regularized lower incomplete gamma P(a, x) = γ(a, x) / Γ(a). */
export function gammaP(a: number, x: number): number {
  if (Number.isNaN(a) || Number.isNaN(x) || !(a > 0)) return NaN;
  if (x <= 0) return 0;
  if (x === Infinity) return 1;
  return x < a + 1 ? gammaSeries(a, x) : 1 - gammaContinuedFraction(a, x);
}

/** Regularized upper incomplete gamma Q(a, x) = 1 - P(a, x), computed directly in the upper tail. */
export function gammaQ(a: number, x: number): number {
  if (Number.isNaN(a) || Number.isNaN(x) || !(a > 0)) return NaN;
  if (x <= 0) return 1;
  if (x === Infinity) return 0;
  return x < a + 1 ? 1 - gammaSeries(a, x) : gammaContinuedFraction(a, x);
}

export const chiSquareCdf = (x: number, df: number): number => gammaP(df / 2, x / 2);
export const chiSquareSf = (x: number, df: number): number => gammaQ(df / 2, x / 2);

/** F distribution CDF with d1 (numerator) and d2 (denominator) degrees of freedom. */
export function fCdf(x: number, d1: number, d2: number): number {
  if (Number.isNaN(x) || !(d1 > 0) || !(d2 > 0)) return NaN;
  if (x <= 0) return 0;
  if (x === Infinity) return 1;
  return incompleteBeta((d1 * x) / (d1 * x + d2), d1 / 2, d2 / 2);
}

/** F distribution upper tail P(F > x), computed without subtracting from 1. */
export function fSf(x: number, d1: number, d2: number): number {
  if (Number.isNaN(x) || !(d1 > 0) || !(d2 > 0)) return NaN;
  if (x <= 0) return 1;
  if (x === Infinity) return 0;
  return incompleteBeta(d2 / (d2 + d1 * x), d2 / 2, d1 / 2);
}

/**
 * Solve cdf(x) = p for a distribution on [0, ∞) by bracketing and bisection.
 * Works on the lower tail when p <= 0.5 and on the upper tail otherwise, so
 * extreme quantiles keep their precision. Bisection is slow but cannot fail.
 */
function positiveQuantile(p: number, cdf: (x: number) => number, sf: (x: number) => number): number {
  if (Number.isNaN(p) || p < 0 || p > 1) return NaN;
  if (p === 0) return 0;
  if (p === 1) return Infinity;
  const useLower = p <= 0.5;
  const target = useLower ? p : 1 - p;
  // g(x) increases with x in both cases: lower tail rises, -(upper tail) rises.
  const g = (x: number) => (useLower ? cdf(x) - target : target - sf(x));
  let lo = 0;
  let hi = 1;
  while (g(hi) < 0) {
    lo = hi;
    hi *= 2;
    if (hi > 1e300) return Infinity;
  }
  for (let i = 0; i < 400; i++) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    if (g(mid) < 0) lo = mid; else hi = mid;
    if (hi - lo <= 1e-15 * hi) break;
  }
  return (lo + hi) / 2;
}

export const chiSquareInv = (p: number, df: number): number =>
  df > 0 ? positiveQuantile(p, (x) => chiSquareCdf(x, df), (x) => chiSquareSf(x, df)) : NaN;
export const fInv = (p: number, d1: number, d2: number): number =>
  d1 > 0 && d2 > 0 ? positiveQuantile(p, (x) => fCdf(x, d1, d2), (x) => fSf(x, d1, d2)) : NaN;

export function chiSquarePdf(x: number, df: number): number {
  if (x < 0) return 0;
  if (x === 0) return df === 2 ? 0.5 : df < 2 ? Infinity : 0;
  const k = df / 2;
  return Math.exp((k - 1) * Math.log(x) - x / 2 - k * Math.LN2 - lnGamma(k));
}

export function fPdf(x: number, d1: number, d2: number): number {
  if (x < 0) return 0;
  if (x === 0) return d1 === 2 ? 1 : d1 < 2 ? Infinity : 0;
  const lnB = lnGamma(d1 / 2) + lnGamma(d2 / 2) - lnGamma((d1 + d2) / 2);
  return Math.exp(0.5 * (d1 * Math.log(d1 * x) + d2 * Math.log(d2) - (d1 + d2) * Math.log(d1 * x + d2)) - Math.log(x) - lnB);
}

// ---------------------------------------------------------------------------
// P-value calculator
// ---------------------------------------------------------------------------

export type Tail = 'two' | 'left' | 'right';
export type DistKind = 'z' | 't' | 'chi2' | 'f';

export type PValueInput = { dist: DistKind; stat: number; df1?: number; df2?: number; tail: Tail; alpha?: number };

export type PValueResult = {
  dist: DistKind;
  stat: number;
  df1?: number;
  df2?: number;
  tail: Tail;
  p: number;
  left: number;
  right: number;
  twoTailed: number;
  alpha: number;
  significant: boolean;
  /** Critical value(s) for the chosen tail at alpha. Two-tailed tests return [lower, upper]. */
  critical: number[];
};

export function cdfOf(dist: DistKind, x: number, df1 = 1, df2 = 1): number {
  switch (dist) {
    case 'z': return zCdf(x);
    case 't': return tCdfTail(x, df1);
    case 'chi2': return chiSquareCdf(x, df1);
    case 'f': return fCdf(x, df1, df2);
  }
}

export function sfOf(dist: DistKind, x: number, df1 = 1, df2 = 1): number {
  switch (dist) {
    case 'z': return zSf(x);
    case 't': return tSf(x, df1);
    case 'chi2': return chiSquareSf(x, df1);
    case 'f': return fSf(x, df1, df2);
  }
}

export function quantileOf(dist: DistKind, p: number, df1 = 1, df2 = 1): number {
  switch (dist) {
    case 'z': return normalInv(p);
    case 't': return tInv(p, df1);
    case 'chi2': return chiSquareInv(p, df1);
    case 'f': return fInv(p, df1, df2);
  }
}

export function pValue(input: PValueInput): Result<PValueResult> {
  const { dist, stat, tail } = input;
  const alpha = input.alpha ?? 0.05;
  if (!isNum(stat)) return err(msg('Enter the test statistic as a number.'));
  if (!(alpha > 0 && alpha < 1)) return err(msg('The significance level must be between 0 and 1, for example 0.05.'));
  const df1 = input.df1 ?? 1;
  const df2 = input.df2 ?? 1;
  if (dist === 't' || dist === 'chi2' || dist === 'f') {
    if (!isNum(df1) || !(df1 > 0)) return err(msg('Degrees of freedom must be a positive number.'));
  }
  if (dist === 'f' && (!isNum(df2) || !(df2 > 0))) return err(msg('Denominator degrees of freedom must be a positive number.'));
  if ((dist === 'chi2' || dist === 'f') && stat < 0) {
    return err(dist === 'chi2' ? 'A chi-square statistic cannot be negative.' : 'An F statistic cannot be negative.');
  }
  const left = cdfOf(dist, stat, df1, df2);
  const right = sfOf(dist, stat, df1, df2);
  const symmetric = dist === 'z' || dist === 't';
  const twoTailed = symmetric ? Math.min(1, 2 * sfOf(dist, Math.abs(stat), df1, df2)) : Math.min(1, 2 * Math.min(left, right));
  const p = tail === 'left' ? left : tail === 'right' ? right : twoTailed;
  let critical: number[];
  if (tail === 'left') critical = [quantileOf(dist, alpha, df1, df2)];
  else if (tail === 'right') critical = [quantileOf(dist, 1 - alpha, df1, df2)];
  else critical = [quantileOf(dist, alpha / 2, df1, df2), quantileOf(dist, 1 - alpha / 2, df1, df2)];
  return okR({
    dist, stat, tail, p, left, right, twoTailed, alpha, significant: p <= alpha, critical,
    ...(dist === 'z' ? {} : { df1 }),
    ...(dist === 'f' ? { df2 } : {}),
  });
}

// ---------------------------------------------------------------------------
// Descriptive helpers
// ---------------------------------------------------------------------------

export type SampleSummary = { n: number; mean: number; sd: number; variance: number };

/** Mean and sample SD by two passes (stable for data far from zero). */
export function sampleSummary(values: number[]): SampleSummary {
  const n = values.length;
  if (n === 0) return { n: 0, mean: NaN, sd: NaN, variance: NaN };
  let s = 0;
  for (const v of values) s += v;
  const mean = s / n;
  let ss = 0;
  let c = 0;
  for (const v of values) { ss += (v - mean) ** 2; c += v - mean; }
  const variance = n > 1 ? (ss - (c * c) / n) / (n - 1) : NaN;
  return { n, mean, sd: Math.sqrt(variance), variance };
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---------------------------------------------------------------------------
// Linear regression
// ---------------------------------------------------------------------------

export type ParsedPairs = { xs: number[]; ys: number[]; invalid: string[] };

/**
 * Read x,y pairs, one per line. A line may separate the two numbers with a
 * comma, tab, semicolon or spaces. A first line that is a header (non-numeric)
 * is skipped silently; other unreadable lines are reported.
 */
export function parsePairs(text: string): ParsedPairs {
  const xs: number[] = [];
  const ys: number[] = [];
  const invalid: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, idx) => {
    const toks = line.split(/[\s,;|]+/).filter(Boolean);
    const nums = parseNumbers(toks.join(' '));
    if (toks.length === 2 && nums.values.length === 2) {
      xs.push(nums.values[0]);
      ys.push(nums.values[1]);
    } else if (!(idx === 0 && nums.values.length === 0)) {
      invalid.push(line);
    }
  });
  return { xs, ys, invalid };
}

export type ResidualRow = { x: number; y: number; fitted: number; residual: number; standardized: number; leverage: number };

export type Regression = {
  n: number;
  df: number;
  meanX: number;
  meanY: number;
  sxx: number;
  syy: number;
  sxy: number;
  slope: number;
  intercept: number;
  r: number;
  r2: number;
  adjR2: number;
  /** Residual standard error s = √(SSE / (n - 2)). */
  se: number;
  seSlope: number;
  seIntercept: number;
  tSlope: number;
  pSlope: number;
  tIntercept: number;
  pIntercept: number;
  ssRegression: number;
  sse: number;
  sst: number;
  f: number;
  pF: number;
  confidence: number;
  tCrit: number;
  slopeCi: [number, number];
  interceptCi: [number, number];
  residuals: ResidualRow[];
  minX: number;
  maxX: number;
};

/** Ordinary least squares y = a + b·x with centred sums (numerically stable). */
export function linearRegression(xs: number[], ys: number[], confidence = 0.95): Result<Regression> {
  if (xs.length !== ys.length) return err(msg('x and y need the same number of values.'));
  const n = xs.length;
  if (n < 3) return err(msg('Enter at least 3 (x, y) pairs. Two points fit a line exactly, leaving nothing to estimate the error from.'));
  if (!xs.every(isNum) || !ys.every(isNum)) return err(msg('Every x and y must be a finite number.'));
  if (!(confidence > 0 && confidence < 1)) return err(msg('Confidence level must be between 0 and 1.'));
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const meanX = sx / n;
  const meanY = sy / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  if (!(sxx > 0)) return err(msg('All x values are the same, so the slope is undefined (a vertical line).'));
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const df = n - 2;
  const fitted = xs.map((x) => intercept + slope * x);
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (ys[i] - fitted[i]) ** 2;
  const sst = syy;
  const ssRegression = Math.max(0, sst - sse);
  const r = syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
  const r2 = syy > 0 ? 1 - sse / sst : NaN;
  const adjR2 = syy > 0 ? 1 - (1 - r2) * (n - 1) / df : NaN;
  const mse = sse / df;
  const se = Math.sqrt(mse);
  const seSlope = Math.sqrt(mse / sxx);
  const seIntercept = Math.sqrt(mse * (1 / n + (meanX * meanX) / sxx));
  const tSlope = slope / seSlope;
  const tIntercept = intercept / seIntercept;
  const twoSided = (t: number) => (Number.isNaN(t) ? NaN : Math.min(1, 2 * tSf(Math.abs(t), df)));
  const f = ssRegression / mse;
  // A perfect fit (mse = 0) gives t = ±∞ and p = 0, but a perfectly flat y gives t = 0/0, so p is undefined (NaN), as in R.
  const pF = fSf(f, 1, df);
  const tCrit = tInv(1 - (1 - confidence) / 2, df);
  const residuals: ResidualRow[] = xs.map((x, i) => {
    const leverage = 1 / n + (x - meanX) ** 2 / sxx;
    const residual = ys[i] - fitted[i];
    // Internally studentized residual e / (s·√(1 - h)), as R's rstandard().
    const standardized = se > 0 && leverage < 1 ? residual / (se * Math.sqrt(1 - leverage)) : NaN;
    return { x, y: ys[i], fitted: fitted[i], residual, standardized, leverage };
  });
  return okR({
    n, df, meanX, meanY, sxx, syy, sxy, slope, intercept, r, r2, adjR2, se, seSlope, seIntercept,
    tSlope, pSlope: twoSided(tSlope), tIntercept, pIntercept: twoSided(tIntercept),
    ssRegression, sse, sst, f, pF, confidence, tCrit,
    slopeCi: [slope - tCrit * seSlope, slope + tCrit * seSlope],
    interceptCi: [intercept - tCrit * seIntercept, intercept + tCrit * seIntercept],
    residuals,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
  });
}

export type Prediction = {
  x: number;
  y: number;
  seMean: number;
  sePrediction: number;
  meanCi: [number, number];
  predictionInterval: [number, number];
  extrapolation: boolean;
};

/** Predicted y at x0 with a confidence interval for the mean response and a prediction interval for one new observation. */
export function predict(reg: Regression, x0: number): Prediction {
  const y = reg.intercept + reg.slope * x0;
  const h = 1 / reg.n + (x0 - reg.meanX) ** 2 / reg.sxx;
  const seMean = reg.se * Math.sqrt(h);
  const sePrediction = reg.se * Math.sqrt(1 + h);
  return {
    x: x0,
    y,
    seMean,
    sePrediction,
    meanCi: [y - reg.tCrit * seMean, y + reg.tCrit * seMean],
    predictionInterval: [y - reg.tCrit * sePrediction, y + reg.tCrit * sePrediction],
    extrapolation: x0 < reg.minX || x0 > reg.maxX,
  };
}

// ---------------------------------------------------------------------------
// t-tests
// ---------------------------------------------------------------------------

export type Alternative = 'two-sided' | 'less' | 'greater';
export type TTestKind = 'one-sample' | 'paired' | 'welch' | 'pooled';

export type TTest = {
  kind: TTestKind;
  alternative: Alternative;
  confidence: number;
  /** The quantity estimated: the mean (one-sample), the mean difference (paired) or mean1 - mean2. */
  estimate: number;
  mu0: number;
  se: number;
  t: number;
  df: number;
  p: number;
  pTwoSided: number;
  pLess: number;
  pGreater: number;
  ci: [number, number];
  critical: number;
  /** Cohen's d: (estimate - mu0) / SD (one-sample and paired d_z) or / pooled SD (two-sample). */
  cohenD: number;
  /** Hedges' g, the small-sample corrected d (two-sample only). */
  hedgesG?: number;
  pooledSd?: number;
  groups: SampleSummary[];
};

function finishT(kind: TTestKind, estimate: number, mu0: number, se: number, df: number, alternative: Alternative,
  confidence: number, cohenD: number, groups: SampleSummary[], extra: Partial<TTest> = {}): TTest {
  const t = (estimate - mu0) / se;
  const pGreater = tSf(t, df);
  const pLess = tSf(-t, df);
  const pTwoSided = Math.min(1, 2 * tSf(Math.abs(t), df));
  const p = alternative === 'less' ? pLess : alternative === 'greater' ? pGreater : pTwoSided;
  let ci: [number, number];
  let critical: number;
  if (alternative === 'two-sided') {
    critical = tInv(1 - (1 - confidence) / 2, df);
    ci = [estimate - critical * se, estimate + critical * se];
  } else {
    critical = tInv(confidence, df);
    ci = alternative === 'less' ? [-Infinity, estimate + critical * se] : [estimate - critical * se, Infinity];
  }
  return { kind, alternative, confidence, estimate, mu0, se, t, df, p, pTwoSided, pLess, pGreater, ci, critical, cohenD, groups, ...extra };
}

function checkCommon(alternative: Alternative, confidence: number, mu0: number): string | null {
  if (!['two-sided', 'less', 'greater'].includes(alternative)) return msg('Unknown alternative hypothesis.');
  if (!(confidence > 0 && confidence < 1)) return msg('Confidence level must be between 0 and 1.');
  if (!isNum(mu0)) return msg('The hypothesised value must be a number.');
  return null;
}

export function oneSampleT(input: { mean: number; sd: number; n: number; mu0?: number; alternative?: Alternative; confidence?: number }): Result<TTest> {
  const { mean, sd, n } = input;
  const mu0 = input.mu0 ?? 0;
  const alternative = input.alternative ?? 'two-sided';
  const confidence = input.confidence ?? 0.95;
  const c = checkCommon(alternative, confidence, mu0);
  if (c) return err(c);
  if (!isNum(mean)) return err(msg('Enter the sample mean.'));
  if (!isNum(sd) || !(sd > 0)) return err(msg('The standard deviation must be greater than 0.'));
  if (!Number.isInteger(n) || n < 2) return err(msg('The sample size must be a whole number of at least 2.'));
  const se = sd / Math.sqrt(n);
  return okR(finishT('one-sample', mean, mu0, se, n - 1, alternative, confidence, (mean - mu0) / sd, [{ n, mean, sd, variance: sd * sd }]));
}

/** Paired t-test on differences x - y (the same order as R's t.test(x, y, paired = TRUE)). */
export function pairedT(x: number[], y: number[], opts: { mu0?: number; alternative?: Alternative; confidence?: number } = {}): Result<TTest> {
  if (x.length !== y.length) return err(built(msg('Paired data need the same number of values in each column (got {x} and {y}).'), { x: x.length, y: y.length }));
  if (x.length < 2) return err(msg('Enter at least 2 pairs.'));
  const d = x.map((v, i) => v - y[i]);
  const s = sampleSummary(d);
  if (!(s.sd > 0)) return err(msg('Every difference is identical, so the standard deviation of the differences is 0 and t is undefined.'));
  const r = oneSampleT({ mean: s.mean, sd: s.sd, n: s.n, ...opts });
  if (!r.ok) return r;
  return okR({ ...r.value, kind: 'paired', groups: [sampleSummary(x), sampleSummary(y), s] });
}

export function twoSampleT(input: {
  mean1: number; sd1: number; n1: number; mean2: number; sd2: number; n2: number;
  equalVariances?: boolean; mu0?: number; alternative?: Alternative; confidence?: number;
}): Result<TTest> {
  const { mean1, sd1, n1, mean2, sd2, n2 } = input;
  const mu0 = input.mu0 ?? 0;
  const alternative = input.alternative ?? 'two-sided';
  const confidence = input.confidence ?? 0.95;
  const c = checkCommon(alternative, confidence, mu0);
  if (c) return err(c);
  if (!isNum(mean1) || !isNum(mean2)) return err(msg('Enter both group means.'));
  if (!isNum(sd1) || !isNum(sd2) || sd1 < 0 || sd2 < 0) return err(msg('Standard deviations must be zero or more.'));
  if (!(sd1 > 0 || sd2 > 0)) return err(msg('At least one group needs a standard deviation above 0.'));
  if (!Number.isInteger(n1) || !Number.isInteger(n2) || n1 < 2 || n2 < 2) return err(msg('Each group needs a whole-number size of at least 2.'));
  const v1 = sd1 * sd1;
  const v2 = sd2 * sd2;
  const pooledVar = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
  const pooledSd = Math.sqrt(pooledVar);
  const estimate = mean1 - mean2;
  const cohenD = (estimate - mu0) / pooledSd;
  const hedgesG = cohenD * (1 - 3 / (4 * (n1 + n2) - 9));
  const groups = [{ n: n1, mean: mean1, sd: sd1, variance: v1 }, { n: n2, mean: mean2, sd: sd2, variance: v2 }];
  if (input.equalVariances) {
    const se = Math.sqrt(pooledVar * (1 / n1 + 1 / n2));
    return okR(finishT('pooled', estimate, mu0, se, n1 + n2 - 2, alternative, confidence, cohenD, groups, { hedgesG, pooledSd }));
  }
  const a = v1 / n1;
  const b = v2 / n2;
  const se = Math.sqrt(a + b);
  const df = (a + b) ** 2 / ((a * a) / (n1 - 1) + (b * b) / (n2 - 1));
  return okR(finishT('welch', estimate, mu0, se, df, alternative, confidence, cohenD, groups, { hedgesG, pooledSd }));
}

// ---------------------------------------------------------------------------
// Chi-square tests
// ---------------------------------------------------------------------------

export type GoodnessOfFit = {
  n: number;
  k: number;
  chi2: number;
  df: number;
  p: number;
  observed: number[];
  expected: number[];
  contributions: number[];
  /** Pearson residuals (O - E) / √E. */
  residuals: number[];
  lowExpected: number;
  minExpected: number;
};

/**
 * Chi-square goodness of fit. `expected` holds relative weights (counts,
 * proportions or percentages all work); they are rescaled to the observed
 * total, as R's chisq.test(x, p = w, rescale.p = TRUE). Empty means a uniform
 * distribution. `estimatedParams` lowers df when the expected distribution
 * was fitted from the same data (for example a Poisson mean).
 */
export function chiSquareGoodnessOfFit(observed: number[], expected: number[] = [], estimatedParams = 0): Result<GoodnessOfFit> {
  const k = observed.length;
  if (k < 2) return err(msg('Enter at least 2 categories.'));
  if (!observed.every((o) => isNum(o) && o >= 0)) return err(msg('Observed counts must be zero or more.'));
  const n = observed.reduce((a, b) => a + b, 0);
  if (!(n > 0)) return err(msg('The observed counts add up to 0.'));
  let w = expected;
  if (w.length === 0) w = observed.map(() => 1);
  if (w.length !== k) return err(built(msg('There are {k} observed counts but {w} expected values. Give one expected value per category, or leave it empty for equal frequencies.'), { k, w: w.length }));
  if (!w.every((v) => isNum(v) && v > 0)) return err(msg('Every expected value must be greater than 0.'));
  if (!Number.isInteger(estimatedParams) || estimatedParams < 0) return err(msg('Estimated parameters must be a whole number.'));
  const df = k - 1 - estimatedParams;
  if (df < 1) return err(msg('Degrees of freedom would be below 1. Use more categories or fewer estimated parameters.'));
  const wSum = w.reduce((a, b) => a + b, 0);
  const exp = w.map((v) => (n * v) / wSum);
  const contributions = observed.map((o, i) => (o - exp[i]) ** 2 / exp[i]);
  const chi2 = contributions.reduce((a, b) => a + b, 0);
  return okR({
    n, k, chi2, df, p: chiSquareSf(chi2, df), observed, expected: exp, contributions,
    residuals: observed.map((o, i) => (o - exp[i]) / Math.sqrt(exp[i])),
    lowExpected: exp.filter((e) => e < 5).length,
    minExpected: Math.min(...exp),
  });
}

export type Independence = {
  n: number;
  rows: number;
  cols: number;
  chi2: number;
  df: number;
  p: number;
  yates: boolean;
  expected: number[][];
  contributions: number[][];
  /** Adjusted standardized residuals (Agresti), approximately N(0, 1) under independence. */
  adjustedResiduals: number[][];
  rowTotals: number[];
  colTotals: number[];
  cramersV: number;
  phi?: number;
  lowExpected: number;
  minExpected: number;
};

/** Pearson chi-square test of independence for an r x c table. Yates' correction applies only to 2 x 2 tables, as in R. */
export function chiSquareIndependence(table: number[][], yates = false): Result<Independence> {
  const rows = table.length;
  if (rows < 2) return err(msg('A contingency table needs at least 2 rows.'));
  const cols = table[0].length;
  if (cols < 2) return err(msg('A contingency table needs at least 2 columns.'));
  if (!table.every((r) => r.length === cols)) return err(msg('Every row must have the same number of columns.'));
  if (!table.every((r) => r.every((v) => isNum(v) && v >= 0))) return err(msg('Counts must be zero or more.'));
  const rowTotals = table.map((r) => r.reduce((a, b) => a + b, 0));
  const colTotals = table[0].map((_, j) => table.reduce((a, r) => a + r[j], 0));
  const n = rowTotals.reduce((a, b) => a + b, 0);
  if (!(n > 0)) return err(msg('The table is empty.'));
  if (rowTotals.some((t) => t === 0)) return err(msg('A row adds up to 0. Remove empty rows; their expected counts would be 0.'));
  if (colTotals.some((t) => t === 0)) return err(msg('A column adds up to 0. Remove empty columns; their expected counts would be 0.'));
  const useYates = yates && rows === 2 && cols === 2;
  const expected = table.map((_, i) => table[0].map((__, j) => (rowTotals[i] * colTotals[j]) / n));
  let yatesShift = 0;
  if (useYates) {
    let m = Infinity;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) m = Math.min(m, Math.abs(table[i][j] - expected[i][j]));
    yatesShift = Math.min(0.5, m);
  }
  const contributions = table.map((r, i) => r.map((o, j) => (Math.abs(o - expected[i][j]) - yatesShift) ** 2 / expected[i][j]));
  const chi2 = contributions.flat().reduce((a, b) => a + b, 0);
  const df = (rows - 1) * (cols - 1);
  const adjustedResiduals = table.map((r, i) => r.map((o, j) => {
    const e = expected[i][j];
    return (o - e) / Math.sqrt(e * (1 - rowTotals[i] / n) * (1 - colTotals[j] / n));
  }));
  // Cramér's V uses the uncorrected statistic.
  const chi2Raw = table.reduce((acc, r, i) => acc + r.reduce((a, o, j) => a + (o - expected[i][j]) ** 2 / expected[i][j], 0), 0);
  const cramersV = Math.sqrt(chi2Raw / (n * (Math.min(rows, cols) - 1)));
  let phi: number | undefined;
  if (rows === 2 && cols === 2) {
    const [[a, b], [c, d]] = table;
    phi = (a * d - b * c) / Math.sqrt(rowTotals[0] * rowTotals[1] * colTotals[0] * colTotals[1]);
  }
  const flatE = expected.flat();
  return okR({
    n, rows, cols, chi2, df, p: chiSquareSf(chi2, df), yates: useYates, expected, contributions, adjustedResiduals,
    rowTotals, colTotals, cramersV, phi, lowExpected: flatE.filter((e) => e < 5).length, minExpected: Math.min(...flatE),
  });
}

export type ParsedTable = { table: number[][]; rowLabels: string[]; colLabels: string[]; error?: string };

/**
 * Read a contingency table pasted from a spreadsheet: one row per line,
 * cells separated by tabs, commas, semicolons or spaces. An optional header
 * row and an optional first column of labels are detected when they are not numbers.
 */
export function parseTable(text: string): ParsedTable {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const split = (l: string) => (l.includes('\t') ? l.split('\t') : l.split(/[,;]|\s+/)).map((c) => c.trim()).filter((c) => c !== '');
  const isNumTok = (t: string) => /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t);
  let cells = lines.map(split);
  let colLabels: string[] = [];
  if (cells.length > 1 && cells[0].some((c) => !isNumTok(c))) {
    colLabels = cells[0];
    cells = cells.slice(1);
  }
  let rowLabels: string[] = [];
  if (cells.length && cells.every((r) => r.length > 1 && !isNumTok(r[0]))) {
    rowLabels = cells.map((r) => r[0]);
    cells = cells.map((r) => r.slice(1));
  }
  if (colLabels.length === (cells[0]?.length ?? 0) + 1) colLabels = colLabels.slice(1);
  const bad = cells.flat().find((c) => !isNumTok(c));
  if (bad !== undefined) return { table: [], rowLabels, colLabels, error: `"${bad}" is not a number.` };
  const table = cells.map((r) => r.map(Number));
  if (table.length && !table.every((r) => r.length === table[0].length)) {
    return { table, rowLabels, colLabels, error: msg('Rows have different numbers of cells. Every row needs one count per column.') };
  }
  return { table, rowLabels, colLabels };
}

// ---------------------------------------------------------------------------
// Normal distribution
// ---------------------------------------------------------------------------

export type NormalProbs = {
  mean: number;
  sd: number;
  lower: number;
  upper: number;
  zLower: number;
  zUpper: number;
  /** P(X < lower) */
  below: number;
  /** P(X > upper) */
  above: number;
  /** P(lower < X < upper) */
  between: number;
  /** P(X < lower or X > upper) */
  outside: number;
};

export function normalProbabilities(mean: number, sd: number, a: number, b: number): Result<NormalProbs> {
  if (!isNum(mean)) return err(msg('Enter the mean.'));
  if (!isNum(sd) || !(sd > 0)) return err(msg('The standard deviation must be greater than 0.'));
  if (!isNum(a) || !isNum(b)) return err(msg('Enter the bound(s) as numbers.'));
  const lower = Math.min(a, b);
  const upper = Math.max(a, b);
  const zLower = (lower - mean) / sd;
  const zUpper = (upper - mean) / sd;
  const below = zCdf(zLower);
  const above = zSf(zUpper);
  const between = zLower >= 0 ? zSf(zLower) - zSf(zUpper) : zCdf(zUpper) - zCdf(zLower);
  return okR({ mean, sd, lower, upper, zLower, zUpper, below, above, between, outside: below + above });
}

export type InverseTail = 'left' | 'right' | 'central' | 'outside';

export type NormalInverse = { tail: InverseTail; p: number; x: number[]; z: number[] };

/**
 * Inverse normal. left: x with P(X < x) = p. right: x with P(X > x) = p.
 * central: symmetric bounds holding probability p between them.
 * outside: symmetric bounds with total probability p in the two tails.
 */
export function normalInverse(mean: number, sd: number, p: number, tail: InverseTail): Result<NormalInverse> {
  if (!isNum(mean)) return err(msg('Enter the mean.'));
  if (!isNum(sd) || !(sd > 0)) return err(msg('The standard deviation must be greater than 0.'));
  if (!(p > 0 && p < 1)) return err(msg('The probability must be strictly between 0 and 1.'));
  let z: number[];
  if (tail === 'left') z = [normalInv(p)];
  else if (tail === 'right') z = [-normalInv(p)];
  else if (tail === 'central') { const q = -normalInv((1 - p) / 2); z = [-q, q]; }
  else { const q = -normalInv(p / 2); z = [-q, q]; }
  return okR({ tail, p, z, x: z.map((v) => mean + v * sd) });
}

// ---------------------------------------------------------------------------
// One-way ANOVA
// ---------------------------------------------------------------------------

export type AnovaGroup = { name: string; n: number; mean: number; sd: number };

export type PairwiseRow = { a: string; b: string; diff: number; se: number; t: number; p: number; pBonferroni: number; pHolm: number };

export type Anova = {
  k: number;
  N: number;
  grandMean: number;
  ssBetween: number;
  ssWithin: number;
  ssTotal: number;
  dfBetween: number;
  dfWithin: number;
  dfTotal: number;
  msBetween: number;
  msWithin: number;
  f: number;
  p: number;
  etaSquared: number;
  omegaSquared: number;
  groups: AnovaGroup[];
  welch: { f: number; df1: number; df2: number; p: number } | null;
  pairwise: PairwiseRow[];
};

export const ANOVA_MAX_GROUPS = 10;

/** Group summaries from raw values. */
export function anovaGroupsFromData(data: { name: string; values: number[] }[]): AnovaGroup[] {
  return data.map((g) => {
    const s = sampleSummary(g.values);
    return { name: g.name, n: s.n, mean: s.mean, sd: g.values.length > 1 ? s.sd : 0 };
  });
}

/** Holm step-down adjustment (same as R's p.adjust(method = "holm")). */
export function holmAdjust(ps: number[]): number[] {
  const m = ps.length;
  const order = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(m);
  let running = 0;
  order.forEach(([p, i], rank) => {
    running = Math.max(running, Math.min(1, (m - rank) * p));
    out[i] = running;
  });
  return out;
}

/**
 * Classic one-way ANOVA from group summaries (n, mean, SD), plus Welch's
 * heteroscedastic F test (Welch, 1951; R's oneway.test) and pairwise t-tests
 * on the pooled within-group variance with Bonferroni and Holm adjustments
 * (R's pairwise.t.test with pool.sd = TRUE).
 */
export function oneWayAnova(groups: AnovaGroup[]): Result<Anova> {
  const k = groups.length;
  if (k < 2) return err(msg('Enter at least 2 groups.'));
  if (k > ANOVA_MAX_GROUPS) return err(built(msg('At most {max} groups are supported.'), { max: ANOVA_MAX_GROUPS }));
  for (const g of groups) {
    if (!Number.isInteger(g.n) || g.n < 1) return err(built(msg('Group "{name}" needs at least 1 value.'), { name: g.name }));
    if (!isNum(g.mean)) return err(`Group "${g.name}" needs a mean.`);
    if (!isNum(g.sd) || g.sd < 0) return err(built(msg('Group "{name}" needs a standard deviation of 0 or more.'), { name: g.name }));
    if (g.n === 1 && g.sd !== 0) return err(built(msg('Group "{name}" has 1 value, so its standard deviation must be 0.'), { name: g.name }));
  }
  const N = groups.reduce((a, g) => a + g.n, 0);
  const dfBetween = k - 1;
  const dfWithin = N - k;
  if (dfWithin < 1) return err(msg('Need more observations than groups so the within-group variance can be estimated.'));
  const grandMean = groups.reduce((a, g) => a + g.n * g.mean, 0) / N;
  const ssBetween = groups.reduce((a, g) => a + g.n * (g.mean - grandMean) ** 2, 0);
  const ssWithin = groups.reduce((a, g) => a + (g.n - 1) * g.sd * g.sd, 0);
  const ssTotal = ssBetween + ssWithin;
  if (!(ssWithin > 0)) return err(msg('Every group has zero spread, so the F ratio is undefined.'));
  const msBetween = ssBetween / dfBetween;
  const msWithin = ssWithin / dfWithin;
  const f = msBetween / msWithin;
  const p = fSf(f, dfBetween, dfWithin);
  const etaSquared = ssTotal > 0 ? ssBetween / ssTotal : 0;
  const omegaSquared = Math.max(0, (ssBetween - dfBetween * msWithin) / (ssTotal + msWithin));

  let welch: Anova['welch'] = null;
  if (groups.every((g) => g.n >= 2 && g.sd > 0)) {
    const w = groups.map((g) => g.n / (g.sd * g.sd));
    const W = w.reduce((a, b) => a + b, 0);
    const mw = groups.reduce((a, g, i) => a + w[i] * g.mean, 0) / W;
    const A = groups.reduce((a, g, i) => a + w[i] * (g.mean - mw) ** 2, 0) / (k - 1);
    const tmp = groups.reduce((a, g, i) => a + (1 - w[i] / W) ** 2 / (g.n - 1), 0);
    const B = 1 + ((2 * (k - 2)) / (k * k - 1)) * tmp;
    const wf = A / B;
    const df2 = (k * k - 1) / (3 * tmp);
    welch = { f: wf, df1: k - 1, df2, p: fSf(wf, k - 1, df2) };
  }

  const raw: Omit<PairwiseRow, 'pBonferroni' | 'pHolm'>[] = [];
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const diff = groups[i].mean - groups[j].mean;
      const se = Math.sqrt(msWithin * (1 / groups[i].n + 1 / groups[j].n));
      const t = diff / se;
      raw.push({ a: groups[i].name, b: groups[j].name, diff, se, t, p: Math.min(1, 2 * tSf(Math.abs(t), dfWithin)) });
    }
  }
  const holm = holmAdjust(raw.map((r) => r.p));
  const pairwise = raw.map((r, i) => ({ ...r, pBonferroni: Math.min(1, r.p * raw.length), pHolm: holm[i] }));

  return okR({
    k, N, grandMean, ssBetween, ssWithin, ssTotal, dfBetween, dfWithin, dfTotal: N - 1, msBetween, msWithin, f, p,
    etaSquared, omegaSquared, groups, welch, pairwise,
  });
}

/**
 * Levene's test for equal variances using deviations from the group median
 * (the Brown-Forsythe variant, the default in R's car::leveneTest and in
 * SciPy's levene). Needs raw data.
 */
export function leveneTest(data: number[][]): Result<{ f: number; df1: number; df2: number; p: number }> {
  if (data.length < 2) return err(msg('Need at least 2 groups.'));
  if (data.some((g) => g.length < 2)) return err(msg('Each group needs at least 2 values for Levene\'s test.'));
  const dev = data.map((g) => { const m = median(g); return g.map((v) => Math.abs(v - m)); });
  const r = oneWayAnova(anovaGroupsFromData(dev.map((v, i) => ({ name: String(i), values: v }))));
  if (!r.ok) return err(msg('Levene\'s test is undefined here (no spread in the deviations).'));
  return okR({ f: r.value.f, df1: r.value.dfBetween, df2: r.value.dfWithin, p: r.value.p });
}
