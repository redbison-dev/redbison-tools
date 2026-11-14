/**
 * Pure logic for the statistics calculators: descriptive statistics,
 * quartiles, the normal and Student t distributions, confidence intervals,
 * sample size, combinatorics (exact BigInt) and probability rules.
 * No React here, so the regression tests exercise exactly what the UI shows.
 */
import { msg, built } from '../../msg';

export type Result<T> = { ok: true; value: T; error?: undefined } | { ok: false; error: string; value?: undefined };
const okR = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: string): Result<T> => ({ ok: false, error });
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

// ---------------------------------------------------------------------------
// Parsing and formatting
// ---------------------------------------------------------------------------

export type ParsedNumbers = { values: number[]; invalid: string[] };

/**
 * Pull numbers out of pasted text. Accepts commas, spaces, tabs, new lines,
 * semicolons and pipes as separators, so a spreadsheet column, a CSV row or a
 * comma list all work. Thousands separators are not supported because "1,234"
 * is ambiguous with a two-number list; numbers like 1e3 and -0.5 are.
 */
export function parseNumbers(text: string): ParsedNumbers {
  const values: number[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;|]+/)) {
    const tok = raw.trim().replace(/^[([{]+|[)\]}]+$/g, '');
    if (!tok) continue;
    const n = Number(tok);
    if (Number.isFinite(n) && /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(tok)) values.push(n);
    else invalid.push(tok);
  }
  return { values, invalid };
}

/** Format a number for display: up to `sig` significant digits, no trailing zeros, scientific when tiny or huge. */
export function fmt(n: number, sig = 6): string {
  if (!Number.isFinite(n)) return Number.isNaN(n) ? '-' : n > 0 ? '∞' : '-∞';
  if (n === 0) return '0';
  const a = Math.abs(n);
  if (a >= 1e15 || a < 1e-6) {
    const [m, e] = n.toExponential(sig - 1).split('e');
    return `${String(Number(m))} × 10^${Number(e)}`;
  }
  const s = Number(n.toPrecision(sig));
  return s.toLocaleString('en-US', { maximumFractionDigits: 12 });
}

/** Round to a number of decimals, half away from zero, without binary drift. */
export function round(n: number, decimals = 4): number {
  if (!Number.isFinite(n)) return n;
  const f = 10 ** decimals;
  return (Math.sign(n) * Math.round(Math.abs(n) * f + 1e-9)) / f;
}

// ---------------------------------------------------------------------------
// Descriptive statistics (standard deviation)
// ---------------------------------------------------------------------------

export type Describe = {
  n: number;
  sum: number;
  mean: number;
  /** Sum of squared deviations from the mean, Σ(x - x̄)². */
  sumSquares: number;
  sampleVariance: number;
  populationVariance: number;
  sampleSd: number;
  populationSd: number;
  /** Standard error of the mean, s / √n. */
  standardError: number;
  /** Coefficient of variation (sample SD / mean), as a fraction; NaN when the mean is 0. */
  cvSample: number;
  cvPopulation: number;
  min: number;
  max: number;
  range: number;
};

/**
 * Mean and variance in one pass with Welford's algorithm, which avoids the
 * catastrophic cancellation of the Σx² - (Σx)²/n shortcut (data such as
 * 1e9+4, 1e9+7, 1e9+13, 1e9+16 give the right variance of 30).
 */
export function describe(values: number[]): Result<Describe> {
  const n = values.length;
  if (n === 0) return err(msg('Enter at least one number.'));
  if (!values.every(isNum)) return err(msg('Every value must be a finite number.'));
  let mean = 0;
  let m2 = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  values.forEach((x, i) => {
    const delta = x - mean;
    mean += delta / (i + 1);
    m2 += delta * (x - mean);
    sum += x;
    if (x < min) min = x;
    if (x > max) max = x;
  });
  const populationVariance = m2 / n;
  const sampleVariance = n > 1 ? m2 / (n - 1) : NaN;
  const sampleSd = Math.sqrt(sampleVariance);
  const populationSd = Math.sqrt(populationVariance);
  return okR({
    n,
    sum,
    mean,
    sumSquares: m2,
    sampleVariance,
    populationVariance,
    sampleSd,
    populationSd,
    standardError: n > 1 ? sampleSd / Math.sqrt(n) : NaN,
    cvSample: mean === 0 ? NaN : sampleSd / Math.abs(mean),
    cvPopulation: mean === 0 ? NaN : populationSd / Math.abs(mean),
    min,
    max,
    range: max - min,
  });
}

export type DeviationRow = { x: number; deviation: number; squared: number };

export function deviationTable(values: number[], mean: number): DeviationRow[] {
  return values.map((x) => {
    const d = x - mean;
    return { x, deviation: d, squared: d * d };
  });
}

// ---------------------------------------------------------------------------
// Mean, median, mode, quartiles
// ---------------------------------------------------------------------------

export type QuartileMethod = 'exclusive-halves' | 'tukey' | 'inclusive' | 'exclusive';

export const QUARTILE_METHODS: { id: QuartileMethod; label: string; matches: string }[] = [
  { id: 'exclusive-halves', label: msg('Median of halves, median excluded'), matches: msg('TI-83/84, most school textbooks (Moore & McCabe)') },
  { id: 'tukey', label: msg('Tukey hinges, median included'), matches: msg('R fivenum() and boxplot()') },
  { id: 'inclusive', label: msg('Linear interpolation, inclusive'), matches: msg('Excel QUARTILE.INC / QUARTILE, Google Sheets, R type 7, NumPy default') },
  { id: 'exclusive', label: msg('Linear interpolation, exclusive'), matches: msg('Excel QUARTILE.EXC, R type 6, Minitab, SPSS') },
];

const sortAsc = (v: number[]) => [...v].sort((a, b) => a - b);

export function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Hyndman-Fan quantile on 1-based position h, clamped to the data. */
function interpAt(sorted: number[], h: number): number {
  const n = sorted.length;
  if (h <= 1) return sorted[0];
  if (h >= n) return sorted[n - 1];
  const lo = Math.floor(h);
  return sorted[lo - 1] + (h - lo) * (sorted[lo] - sorted[lo - 1]);
}

/** Quantile p of sorted data by R type 7 (inclusive) or type 6 (exclusive). */
export function quantile(sorted: number[], p: number, method: 'inclusive' | 'exclusive' = 'inclusive'): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const h = method === 'inclusive' ? (n - 1) * p + 1 : (n + 1) * p;
  return interpAt(sorted, h);
}

export function quartiles(sortedIn: number[], method: QuartileMethod): { q1: number; q2: number; q3: number } {
  const s = sortedIn;
  const n = s.length;
  const q2 = median(s);
  if (n === 1) return { q1: s[0], q2, q3: s[0] };
  if (method === 'inclusive' || method === 'exclusive') {
    return { q1: quantile(s, 0.25, method), q2, q3: quantile(s, 0.75, method) };
  }
  const half = Math.floor(n / 2);
  const includeMid = method === 'tukey' && n % 2 === 1;
  const lower = s.slice(0, includeMid ? half + 1 : half);
  const upper = s.slice(n % 2 === 1 && !includeMid ? half + 1 : half);
  return { q1: median(lower), q2, q3: median(upper) };
}

export type ModeResult = { modes: number[]; frequency: number; kind: 'none' | 'unimodal' | 'bimodal' | 'multimodal' };

/** Mode(s). When every distinct value occurs equally often there is no mode. */
export function modes(values: number[]): ModeResult {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = 0;
  counts.forEach((c) => { if (c > best) best = c; });
  const top = [...counts.entries()].filter(([, c]) => c === best).map(([v]) => v).sort((a, b) => a - b);
  if (values.length === 0 || (top.length === counts.size && counts.size > 1)) {
    return { modes: [], frequency: best, kind: 'none' };
  }
  return { modes: top, frequency: best, kind: top.length === 1 ? 'unimodal' : top.length === 2 ? 'bimodal' : 'multimodal' };
}

export type Summary = {
  n: number;
  sorted: number[];
  sum: number;
  mean: number;
  median: number;
  mode: ModeResult;
  min: number;
  max: number;
  range: number;
  q1: number;
  q3: number;
  iqr: number;
  lowerFence: number;
  upperFence: number;
  outliers: number[];
  /** Smallest and largest values inside the fences (box-plot whiskers). */
  whiskerLow: number;
  whiskerHigh: number;
  geometricMean: number;
  harmonicMean: number;
};

export function summarize(values: number[], method: QuartileMethod): Result<Summary> {
  if (values.length === 0) return err(msg('Enter at least one number.'));
  if (!values.every(isNum)) return err(msg('Every value must be a finite number.'));
  const d = describe(values);
  if (!d.ok) return err(d.error);
  const sorted = sortAsc(values);
  const { q1, q3 } = quartiles(sorted, method);
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;
  const inside = sorted.filter((x) => x >= lowerFence && x <= upperFence);
  const allPositive = sorted[0] > 0;
  return okR({
    n: sorted.length,
    sorted,
    sum: d.value.sum,
    mean: d.value.mean,
    median: median(sorted),
    mode: modes(values),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    range: d.value.range,
    q1,
    q3,
    iqr,
    lowerFence,
    upperFence,
    outliers: sorted.filter((x) => x < lowerFence || x > upperFence),
    whiskerLow: inside.length ? inside[0] : sorted[0],
    whiskerHigh: inside.length ? inside[inside.length - 1] : sorted[sorted.length - 1],
    geometricMean: allPositive ? Math.exp(sorted.reduce((a, x) => a + Math.log(x), 0) / sorted.length) : NaN,
    harmonicMean: allPositive ? sorted.length / sorted.reduce((a, x) => a + 1 / x, 0) : NaN,
  });
}

// ---------------------------------------------------------------------------
// Normal distribution
// ---------------------------------------------------------------------------

const LN_SQRT_2PI = 0.9189385332046728;

export function normalPdf(z: number): number {
  return Math.exp(-0.5 * z * z - LN_SQRT_2PI);
}

/** Upper tail Q(x) = P(Z > x) for x >= 3 by the Laplace continued fraction (full relative precision). */
function upperTailCf(x: number): number {
  // Q(x) = φ(x) / (x + 1/(x + 2/(x + 3/(x + ...)))), evaluated bottom-up.
  let f = x;
  for (let k = 120; k >= 1; k--) f = x + k / f;
  return normalPdf(x) / f;
}

/**
 * Standard normal CDF Φ(z). Marsaglia's (2004) Taylor series for |z| < 3,
 * a continued fraction in the tails, so both Φ(-8) and 1 - Φ(8) keep
 * their relative precision (about 15 significant digits).
 */
export function normalCdf(z: number): number {
  if (Number.isNaN(z)) return NaN;
  if (z === Infinity) return 1;
  if (z === -Infinity) return 0;
  if (z <= -3) return upperTailCf(-z);
  if (z >= 3) return 1 - upperTailCf(z);
  let s = z;
  let t = 0;
  let b = z;
  const q = z * z;
  let i = 1;
  while (s !== t) {
    t = s;
    i += 2;
    b *= q / i;
    s = t + b;
  }
  return 0.5 + s * Math.exp(-0.5 * q - LN_SQRT_2PI);
}

/** P(Z > z) computed without subtracting from 1 in the upper tail. */
export function normalSf(z: number): number {
  return normalCdf(-z);
}

/**
 * Inverse standard normal CDF. Acklam's rational approximation (relative
 * error 1.15e-9) followed by one Halley step against normalCdf, which takes
 * it to full double precision.
 */
export function normalInv(p: number): number {
  if (Number.isNaN(p) || p < 0 || p > 1) return NaN;
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  let x: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  // Halley refinement. In the upper half work on the upper tail to keep precision.
  const e = p > 0.5 ? -(normalSf(x) - (1 - p)) : normalCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

/** Two-sided critical z for a confidence level such as 0.95 (gives 1.959964). */
export function zCritical(confidence: number): number {
  return normalInv(1 - (1 - confidence) / 2);
}

export type ZProbabilities = {
  z: number;
  below: number;
  above: number;
  /** P(-|z| < Z < |z|) */
  between: number;
  /** P(|Z| > |z|), the two-tailed p-value */
  twoTailed: number;
  percentile: number;
};

export function zProbabilities(z: number): ZProbabilities {
  const below = normalCdf(z);
  const above = normalSf(z);
  const tail = normalCdf(-Math.abs(z));
  return { z, below, above, between: 1 - 2 * tail, twoTailed: 2 * tail, percentile: below * 100 };
}

export function zFromX(x: number, mean: number, sd: number): Result<number> {
  if (![x, mean, sd].every(isNum)) return err(msg('Enter the raw score, the mean and the standard deviation.'));
  if (sd <= 0) return err(msg('The standard deviation must be greater than 0.'));
  return okR((x - mean) / sd);
}

export function xFromZ(z: number, mean: number, sd: number): Result<number> {
  if (![z, mean, sd].every(isNum)) return err(msg('Enter the z-score, the mean and the standard deviation.'));
  if (sd <= 0) return err(msg('The standard deviation must be greater than 0.'));
  return okR(mean + z * sd);
}

/** P(a < Z < b) for z bounds, computed from the nearer tails for accuracy. */
export function normalBetween(a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (lo >= 0) return normalSf(lo) - normalSf(hi);
  return normalCdf(hi) - normalCdf(lo);
}

// ---------------------------------------------------------------------------
// Gamma, incomplete beta and Student t
// ---------------------------------------------------------------------------

/** ln Γ(x) for x > 0, Lanczos approximation (g = 7, n = 9), about 15 digits. */
export function lnGamma(x: number): number {
  const g = 7;
  const coef = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x);
  const xx = x - 1;
  let a = coef[0];
  const t = xx + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += coef[i] / (xx + i);
  return 0.5 * Math.log(2 * Math.PI) + (xx + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction for the incomplete beta (modified Lentz). */
function betacf(a: number, b: number, x: number): number {
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 1000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

export function tPdf(t: number, df: number): number {
  return Math.exp(lnGamma((df + 1) / 2) - lnGamma(df / 2) - 0.5 * Math.log(df * Math.PI) - ((df + 1) / 2) * Math.log(1 + (t * t) / df));
}

/** Student t CDF with df degrees of freedom (df may be fractional, e.g. Welch). */
export function tCdf(t: number, df: number): number {
  if (Number.isNaN(t) || !(df > 0)) return NaN;
  if (t === Infinity) return 1;
  if (t === -Infinity) return 0;
  const tail = 0.5 * incompleteBeta(df / (df + t * t), df / 2, 0.5);
  return t > 0 ? 1 - tail : tail;
}

/** Inverse Student t CDF: Newton steps from the normal quantile, safeguarded by bisection. */
export function tInv(p: number, df: number): number {
  if (Number.isNaN(p) || p < 0 || p > 1 || !(df > 0)) return NaN;
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  if (p === 0.5) return 0;
  if (p < 0.5) return -tInv(1 - p, df);
  // Solve on the upper tail, 1 - p, so small tail areas keep their precision.
  const target = 1 - p;
  const sf = (t: number) => 0.5 * incompleteBeta(df / (df + t * t), df / 2, 0.5);
  let lo = 0;
  let hi = Math.max(1, normalInv(p));
  while (sf(hi) > target) { lo = hi; hi *= 2; if (hi > 1e300) return Infinity; }
  let t = normalInv(p);
  if (!(t > lo && t < hi)) t = (lo + hi) / 2;
  for (let i = 0; i < 200; i++) {
    const f = sf(t) - target;
    if (f > 0) lo = t; else hi = t;
    let next = t + f / tPdf(t, df);
    if (!(next > lo && next < hi)) next = (lo + hi) / 2;
    if (Math.abs(next - t) <= 1e-15 * Math.max(1, Math.abs(t))) return next;
    t = next;
  }
  return t;
}

export function tCritical(confidence: number, df: number): number {
  return tInv(1 - (1 - confidence) / 2, df);
}

// ---------------------------------------------------------------------------
// Confidence intervals
// ---------------------------------------------------------------------------

export type MeanCi = {
  method: 'z' | 't';
  mean: number;
  n: number;
  sd: number;
  df?: number;
  critical: number;
  standardError: number;
  margin: number;
  lower: number;
  upper: number;
};

export function meanCi(input: { mean: number; sd: number; n: number; confidence: number; method: 'z' | 't' }): Result<MeanCi> {
  const { mean, sd, n, confidence, method } = input;
  if (![mean, sd, n, confidence].every(isNum)) return err(msg('Enter the mean, standard deviation, sample size and confidence level.'));
  if (!(confidence > 0 && confidence < 1)) return err(msg('The confidence level must be between 0% and 100%.'));
  if (sd < 0) return err(msg('The standard deviation cannot be negative.'));
  if (!Number.isInteger(n) || n < 1) return err(msg('The sample size must be a whole number of at least 1.'));
  if (method === 't' && n < 2) return err(msg('A t interval needs at least 2 observations (df = n - 1).'));
  const df = method === 't' ? n - 1 : undefined;
  const critical = method === 't' ? tCritical(confidence, n - 1) : zCritical(confidence);
  const standardError = sd / Math.sqrt(n);
  const margin = critical * standardError;
  return okR({ method, mean, n, sd, df, critical, standardError, margin, lower: mean - margin, upper: mean + margin });
}

export type ProportionCi = {
  x: number;
  n: number;
  pHat: number;
  critical: number;
  wald: { lower: number; upper: number; margin: number; standardError: number };
  wilson: { lower: number; upper: number; center: number; halfWidth: number };
  /** True when n·p̂ or n·(1-p̂) is below 10, where the Wald interval is unreliable. */
  smallCounts: boolean;
};

export function proportionCi(x: number, n: number, confidence: number): Result<ProportionCi> {
  if (![x, n, confidence].every(isNum)) return err(msg('Enter the number of successes, the sample size and the confidence level.'));
  if (!(confidence > 0 && confidence < 1)) return err(msg('The confidence level must be between 0% and 100%.'));
  if (!Number.isInteger(n) || n < 1) return err(msg('The sample size must be a whole number of at least 1.'));
  if (!Number.isInteger(x) || x < 0 || x > n) return err(msg('Successes must be a whole number between 0 and the sample size.'));
  const z = zCritical(confidence);
  const p = x / n;
  const se = Math.sqrt((p * (1 - p)) / n);
  const m = z * se;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return okR({
    x,
    n,
    pHat: p,
    critical: z,
    wald: { lower: Math.max(0, p - m), upper: Math.min(1, p + m), margin: m, standardError: se },
    wilson: { lower: x === 0 ? 0 : Math.max(0, center - half), upper: x === n ? 1 : Math.min(1, center + half), center, halfWidth: half },
    smallCounts: n * p < 10 || n * (1 - p) < 10,
  });
}

// ---------------------------------------------------------------------------
// Sample size
// ---------------------------------------------------------------------------

export type SampleSizeResult = {
  z: number;
  /** Infinite-population size before rounding. */
  n0: number;
  /** After the finite population correction, before rounding (equals n0 without a population). */
  nAdjusted: number;
  /** Rounded up to the next whole respondent. */
  n: number;
};

/** Cochran's formula n0 = z² p(1-p) / E², with n = n0 / (1 + (n0 - 1) / N) for a finite population. */
export function sampleSizeProportion(input: { confidence: number; margin: number; p?: number; population?: number }): Result<SampleSizeResult> {
  const { confidence, margin } = input;
  const p = input.p ?? 0.5;
  const N = input.population;
  if (![confidence, margin, p].every(isNum)) return err(msg('Enter the confidence level, margin of error and expected proportion.'));
  if (!(confidence > 0 && confidence < 1)) return err(msg('The confidence level must be between 0% and 100%.'));
  if (!(margin > 0 && margin < 1)) return err(msg('The margin of error must be between 0% and 100%.'));
  if (!(p > 0 && p < 1)) return err(msg('The expected proportion must be between 0% and 100% (use 50% if unsure).'));
  if (N !== undefined && (!isNum(N) || N < 1)) return err(msg('The population size must be at least 1, or leave it blank for a very large population.'));
  const z = zCritical(confidence);
  const n0 = (z * z * p * (1 - p)) / (margin * margin);
  const nAdjusted = N ? n0 / (1 + (n0 - 1) / N) : n0;
  return okR({ z, n0, nAdjusted, n: Math.ceil(nAdjusted - 1e-9) });
}

/** Sample size to estimate a mean within ±E: n0 = (zσ / E)², with the same finite correction. */
export function sampleSizeMean(input: { confidence: number; margin: number; sd: number; population?: number }): Result<SampleSizeResult> {
  const { confidence, margin, sd } = input;
  const N = input.population;
  if (![confidence, margin, sd].every(isNum)) return err(msg('Enter the confidence level, margin of error and standard deviation.'));
  if (!(confidence > 0 && confidence < 1)) return err(msg('The confidence level must be between 0% and 100%.'));
  if (margin <= 0) return err(msg('The margin of error must be greater than 0.'));
  if (sd <= 0) return err(msg('The standard deviation must be greater than 0.'));
  if (N !== undefined && (!isNum(N) || N < 1)) return err(msg('The population size must be at least 1, or leave it blank for a very large population.'));
  const z = zCritical(confidence);
  const n0 = ((z * sd) / margin) ** 2;
  const nAdjusted = N ? n0 / (1 + (n0 - 1) / N) : n0;
  return okR({ z, n0, nAdjusted, n: Math.ceil(nAdjusted - 1e-9) });
}

/** Margin of error for a proportion from a sample size, with the finite population correction when N is given. */
export function marginOfError(input: { confidence: number; n: number; p?: number; population?: number }): Result<{ z: number; margin: number; fpc: number }> {
  const { confidence, n } = input;
  const p = input.p ?? 0.5;
  const N = input.population;
  if (![confidence, n, p].every(isNum)) return err(msg('Enter the confidence level, sample size and proportion.'));
  if (!(confidence > 0 && confidence < 1)) return err(msg('The confidence level must be between 0% and 100%.'));
  if (n < 1) return err(msg('The sample size must be at least 1.'));
  if (!(p >= 0 && p <= 1)) return err(msg('The proportion must be between 0% and 100%.'));
  if (N !== undefined && (!isNum(N) || N < n)) return err(msg('The population must be at least as large as the sample.'));
  const z = zCritical(confidence);
  // A census (N = n) has no sampling error, including N = n = 1 where the formula is 0/0.
  const fpc = N === undefined ? 1 : N > 1 ? Math.sqrt((N - n) / (N - 1)) : 0;
  return okR({ z, margin: z * Math.sqrt((p * (1 - p)) / n) * fpc, fpc });
}

// ---------------------------------------------------------------------------
// Permutations and combinations (exact, BigInt)
// ---------------------------------------------------------------------------

export const COMBINATORICS_MAX_N = 10000;

export type CountKind = 'permutation' | 'combination' | 'permutation-repetition' | 'combination-repetition';

function fallingFactorial(n: bigint, r: bigint): bigint {
  let out = 1n;
  for (let i = 0n; i < r; i++) out *= n - i;
  return out;
}

export function factorialBig(n: number): bigint {
  return fallingFactorial(BigInt(n), BigInt(n));
}

/** C(n, r) exactly, multiplying and dividing step by step so every intermediate is an integer. */
export function binomialBig(n: number, r: number): bigint {
  if (r < 0 || r > n) return 0n;
  const k = BigInt(Math.min(r, n - r));
  const N = BigInt(n);
  let out = 1n;
  for (let i = 1n; i <= k; i++) out = (out * (N - k + i)) / i;
  return out;
}

export function countArrangements(kind: CountKind, n: number, r: number): Result<bigint> {
  if (!Number.isInteger(n) || !Number.isInteger(r)) return err(msg('n and r must be whole numbers.'));
  if (n < 0 || r < 0) return err(msg('n and r cannot be negative.'));
  if (n > COMBINATORICS_MAX_N || r > COMBINATORICS_MAX_N) return err(built(msg('n and r are limited to {max} so the exact answer stays fast to compute.'), { max: COMBINATORICS_MAX_N.toLocaleString() }));
  switch (kind) {
    case 'permutation':
      if (r > n) return err(msg('Without repetition you cannot choose more items (r) than you have (n).'));
      return okR(fallingFactorial(BigInt(n), BigInt(r)));
    case 'combination':
      if (r > n) return err(msg('Without repetition you cannot choose more items (r) than you have (n).'));
      return okR(binomialBig(n, r));
    case 'permutation-repetition':
      if (n === 0 && r > 0) return okR(0n);
      return okR(BigInt(n) ** BigInt(r));
    case 'combination-repetition':
      if (n === 0) return okR(r === 0 ? 1n : 0n);
      return okR(binomialBig(n + r - 1, r));
  }
}

export type BigDisplay = { digits: number; exact: string; scientific: string };

/** Exact digits plus a scientific-notation summary (e.g. 9.3326 × 10^157 for 100!). */
export function describeBig(v: bigint, sig = 6): BigDisplay {
  const s = (v < 0n ? -v : v).toString();
  const sign = v < 0n ? '-' : '';
  const exact = sign + s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (s.length <= 15) return { digits: s.length, exact, scientific: exact };
  // Round the mantissa to `sig` significant digits.
  const head = s.slice(0, sig + 1);
  let mant = Math.round(Number(head) / 10);
  let exp = s.length - 1;
  if (String(mant).length > sig) { mant = Math.round(mant / 10); exp += 1; }
  const ms = String(mant);
  const mantissa = `${ms[0]}.${ms.slice(1)}`.replace(/\.?0+$/, '');
  return { digits: s.length, exact, scientific: `${sign}${mantissa} × 10^${exp}` };
}

/** List up to `limit` arrangements of the given items (lexicographic order of positions). */
export function listArrangements(kind: CountKind, items: string[], r: number, limit = 200): { rows: string[][]; truncated: boolean } {
  const n = items.length;
  const rows: string[][] = [];
  let truncated = false;
  const ordered = kind === 'permutation' || kind === 'permutation-repetition';
  const repeat = kind === 'permutation-repetition' || kind === 'combination-repetition';
  if (r < 0 || (!repeat && r > n) || n === 0 && r > 0) return { rows, truncated };
  const cur: number[] = [];
  const used = new Array<boolean>(n).fill(false);
  const walk = (start: number): boolean => {
    if (cur.length === r) {
      if (rows.length >= limit) { truncated = true; return false; }
      rows.push(cur.map((i) => items[i]));
      return true;
    }
    for (let i = ordered ? 0 : start; i < n; i++) {
      if (!repeat && used[i]) continue;
      cur.push(i);
      used[i] = true;
      const go = walk(repeat ? i : i + 1);
      cur.pop();
      used[i] = false;
      if (!go) return false;
    }
    return true;
  };
  walk(0);
  return { rows, truncated };
}

// ---------------------------------------------------------------------------
// Probability of two events
// ---------------------------------------------------------------------------

export type Relationship = 'independent' | 'exclusive' | 'joint' | 'conditional';

export type TwoEvents = {
  pA: number;
  pB: number;
  notA: number;
  notB: number;
  and: number;
  or: number;
  xor: number;
  neither: number;
  aGivenB: number;
  bGivenA: number;
  /** True when P(A∩B) = P(A)P(B) within rounding. */
  independent: boolean;
  exclusive: boolean;
};

/**
 * Combine P(A) and P(B) under a stated relationship. `extra` is P(A and B)
 * for 'joint' or P(B | A) for 'conditional'; it is ignored otherwise.
 */
export function twoEvents(pA: number, pB: number, relationship: Relationship, extra?: number): Result<TwoEvents> {
  if (![pA, pB].every(isNum)) return err(msg('Enter P(A) and P(B).'));
  if (pA < 0 || pA > 1 || pB < 0 || pB > 1) return err(msg('Probabilities must be between 0 and 1 (0% to 100%).'));
  let and: number;
  switch (relationship) {
    case 'independent':
      and = pA * pB;
      break;
    case 'exclusive':
      if (pA + pB > 1 + 1e-12) return err(msg('Mutually exclusive events cannot have P(A) + P(B) above 1.'));
      and = 0;
      break;
    case 'joint':
      if (!isNum(extra) || extra < 0 || extra > 1) return err(msg('Enter P(A and B) between 0 and 1.'));
      and = extra;
      break;
    case 'conditional':
      if (!isNum(extra) || extra < 0 || extra > 1) return err(msg('Enter P(B | A) between 0 and 1.'));
      and = pA * extra;
      break;
  }
  if (and > Math.min(pA, pB) + 1e-12) return err(msg('P(A and B) cannot exceed the smaller of P(A) and P(B).'));
  if (and < pA + pB - 1 - 1e-12) return err(msg('These values are impossible: P(A or B) would exceed 1. P(A and B) must be at least P(A) + P(B) - 1.'));
  const or = pA + pB - and;
  return okR({
    pA,
    pB,
    notA: 1 - pA,
    notB: 1 - pB,
    and,
    or,
    xor: or - and,
    neither: 1 - or,
    aGivenB: pB > 0 ? and / pB : NaN,
    bGivenA: pA > 0 ? and / pA : NaN,
    independent: Math.abs(and - pA * pB) < 1e-12,
    exclusive: and === 0,
  });
}

/** P(at least one success in n independent trials) = 1 - (1 - p)^n, computed with log1p for small p. */
export function atLeastOne(p: number, n: number): Result<{ atLeastOne: number; none: number; all: number; trialsFor50: number; trialsFor95: number }> {
  if (![p, n].every(isNum)) return err(msg('Enter the probability per trial and the number of trials.'));
  if (p < 0 || p > 1) return err(msg('The probability per trial must be between 0 and 1.'));
  if (!Number.isInteger(n) || n < 0) return err(msg('The number of trials must be a whole number of 0 or more.'));
  const none = p === 1 ? (n === 0 ? 1 : 0) : Math.exp(n * Math.log1p(-p));
  const trialsFor = (target: number) => (p <= 0 ? Infinity : p >= 1 ? 1 : Math.ceil(Math.log1p(-target) / Math.log1p(-p) - 1e-9));
  return okR({ atLeastOne: -Math.expm1(n * Math.log1p(-p)) || (1 - none), none, all: p ** n, trialsFor50: trialsFor(0.5), trialsFor95: trialsFor(0.95) });
}

// ---------------------------------------------------------------------------
// Binomial distribution
// ---------------------------------------------------------------------------

export const BINOMIAL_MAX_N = 100000;

export function binomialPmf(k: number, n: number, p: number): number {
  if (k < 0 || k > n || !Number.isInteger(k)) return 0;
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  const lnC = lnGamma(n + 1) - lnGamma(k + 1) - lnGamma(n - k + 1);
  return Math.exp(lnC + k * Math.log(p) + (n - k) * Math.log1p(-p));
}

export type Binomial = {
  n: number;
  p: number;
  k: number;
  exactly: number;
  atMost: number;
  lessThan: number;
  atLeast: number;
  moreThan: number;
  mean: number;
  variance: number;
  sd: number;
  pmf: number[];
};

/** Binomial probabilities for X = k, X ≤ k, X < k, X ≥ k, X > k (sums of the exact pmf, smaller tail summed directly). */
export function binomial(n: number, p: number, k: number): Result<Binomial> {
  if (![n, p, k].every(isNum)) return err(msg('Enter the number of trials, the probability of success and k.'));
  if (!Number.isInteger(n) || n < 1) return err(msg('The number of trials must be a whole number of at least 1.'));
  if (n > BINOMIAL_MAX_N) return err(built(msg('The number of trials is limited to {max}.'), { max: BINOMIAL_MAX_N.toLocaleString() }));
  if (p < 0 || p > 1) return err(msg('The probability of success must be between 0 and 1.'));
  if (!Number.isInteger(k) || k < 0 || k > n) return err(msg('k must be a whole number between 0 and the number of trials.'));
  const pmf = Array.from({ length: n + 1 }, (_, i) => binomialPmf(i, n, p));
  let below = 0; // P(X < k)
  for (let i = 0; i < k; i++) below += pmf[i];
  let above = 0; // P(X > k)
  for (let i = k + 1; i <= n; i++) above += pmf[i];
  const exactly = pmf[k];
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return okR({
    n,
    p,
    k,
    exactly,
    atMost: clamp(below + exactly),
    lessThan: clamp(below),
    atLeast: clamp(above + exactly),
    moreThan: clamp(above),
    mean: n * p,
    variance: n * p * (1 - p),
    sd: Math.sqrt(n * p * (1 - p)),
    pmf,
  });
}

/** Read a probability typed as a decimal (0.25), a percentage (25%) or a fraction (1/4). NaN when unreadable. */
export function parseProbability(text: string): number {
  const s = text.trim().replace(/\s+/g, '');
  if (!s) return NaN;
  let m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+))%$/);
  if (m) return Number(m[1]) / 100;
  m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+))\/((?:\d+\.?\d*|\.\d+))$/);
  if (m) return Number(m[2]) === 0 ? NaN : Number(m[1]) / Number(m[2]);
  return /^[+-]?(?:\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s) ? Number(s) : NaN;
}
