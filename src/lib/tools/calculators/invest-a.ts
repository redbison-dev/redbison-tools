/**
 * Pure time-value-of-money logic for the invest-a calculator group:
 * savings goal, inflation, CAGR, ROI, present/future value and NPV/IRR.
 * No React here so the regression tests exercise the same code as the UI.
 */
import { CPI_U_ANNUAL, CPI_U_FIRST_YEAR, CPI_U_LAST_YEAR } from './invest-a-cpi';
import { msg, built } from '../../msg';

const MS_PER_DAY = 86_400_000;
/** Average Gregorian year length, used to turn a day count into years. */
export const DAYS_PER_YEAR = 365.25;

export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Parse a user-typed number, tolerating thousands separators and spaces. */
export function parseNum(raw: string | number | undefined | null): number {
  if (typeof raw === 'number') return raw;
  if (raw == null) return NaN;
  const cleaned = String(raw).replace(/[,\s_]/g, '').replace(/[$€£₹¥%]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/** UTC midnight of a real YYYY-MM-DD date; NaN for impossible dates like 2023-02-29, which Date.parse rolls into March. */
function parseIsoDay(iso: string): number {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === iso ? t : NaN;
}

/** Years between two ISO dates (YYYY-MM-DD) using actual days / 365.25. */
export function yearsBetween(startIso: string, endIso: string): number {
  const a = parseIsoDay(startIso);
  const b = parseIsoDay(endIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  return (b - a) / MS_PER_DAY / DAYS_PER_YEAR;
}

export function daysBetween(startIso: string, endIso: string): number {
  const a = parseIsoDay(startIso);
  const b = parseIsoDay(endIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
  return Math.round((b - a) / MS_PER_DAY);
}

/** Split fractional years into whole years and (rounded) months. */
export function splitYearsMonths(years: number): { years: number; months: number } {
  let y = Math.floor(years + 1e-9);
  let m = Math.round((years - y) * 12) || 0; // || 0 turns -0 into 0
  if (m === 12) { y += 1; m = 0; }
  return { years: y, months: m };
}

// ---------------------------------------------------------------------------
// Compounding helpers
// ---------------------------------------------------------------------------

/** Compounding frequency: periods per year, or 'continuous'. */
export type Compounding = number | 'continuous';

/**
 * Interest rate per payment period when a nominal annual rate compounds
 * `compounding` times a year and payments happen `paymentsPerYear` times a year.
 * i = (1 + r/n)^(n/p) − 1, or e^(r/p) − 1 for continuous compounding.
 */
export function ratePerPaymentPeriod(annualRatePct: number, compounding: Compounding, paymentsPerYear: number): number {
  const r = annualRatePct / 100;
  if (compounding === 'continuous') return Math.expm1(r / paymentsPerYear);
  if (r === 0) return 0;
  return Math.pow(1 + r / compounding, compounding / paymentsPerYear) - 1;
}

/** Effective annual rate (APY) for a nominal rate and compounding. */
export function effectiveAnnualRate(annualRatePct: number, compounding: Compounding): number {
  return ratePerPaymentPeriod(annualRatePct, compounding, 1);
}

/** Future value factor of a level payment series: ((1+i)^n − 1)/i, n when i = 0. */
export function fvAnnuityFactor(i: number, n: number): number {
  if (Math.abs(i) < 1e-12) return n;
  return Math.expm1(n * Math.log1p(i)) / i;
}

/** Present value factor of a level payment series: (1 − (1+i)^−n)/i, n when i = 0. */
export function pvAnnuityFactor(i: number, n: number): number {
  if (Math.abs(i) < 1e-12) return n;
  return -Math.expm1(-n * Math.log1p(i)) / i;
}

// ---------------------------------------------------------------------------
// Savings goal
// ---------------------------------------------------------------------------

export type DepositTiming = 'end' | 'start';

export type SavingsInput = {
  goal: number;
  startingBalance: number;
  annualRatePct: number;
  compounding: Compounding;
  depositsPerYear: number;
  timing: DepositTiming;
};

export type SavingsYearRow = {
  year: number;
  deposits: number; // cumulative deposits, excluding the starting balance
  interest: number; // cumulative interest
  balance: number;
};

function depositRate(inp: SavingsInput) {
  return ratePerPaymentPeriod(inp.annualRatePct, inp.compounding, inp.depositsPerYear);
}

/** Balance after `periods` deposit periods. */
export function savingsBalance(inp: SavingsInput, deposit: number, periods: number): number {
  const i = depositRate(inp);
  const growth = Math.pow(1 + i, periods);
  const due = inp.timing === 'start' ? 1 + i : 1;
  return inp.startingBalance * growth + deposit * fvAnnuityFactor(i, periods) * due;
}

/**
 * Deposit per period needed to reach `goal` in `years`. Returns 0 when the
 * starting balance alone gets there.
 */
export function requiredDeposit(inp: SavingsInput, years: number): number {
  const n = Math.round(years * inp.depositsPerYear);
  if (n <= 0) return NaN;
  const i = depositRate(inp);
  const fromStart = inp.startingBalance * Math.pow(1 + i, n);
  const gap = inp.goal - fromStart;
  if (gap <= 0) return 0;
  const due = inp.timing === 'start' ? 1 + i : 1;
  return gap / (fvAnnuityFactor(i, n) * due);
}

/**
 * Number of deposit periods until the balance first reaches the goal.
 * `exact` is the fractional solution; `periods` rounds up to whole deposits.
 * Returns Infinity when the goal can never be reached.
 */
export function periodsToGoal(inp: SavingsInput, deposit: number): { exact: number; periods: number } {
  if (inp.startingBalance >= inp.goal) return { exact: 0, periods: 0 };
  const i = depositRate(inp);
  const a = inp.timing === 'start' ? 1 + i : 1;
  if (Math.abs(i) < 1e-12) {
    if (deposit <= 0) return { exact: Infinity, periods: Infinity };
    const exact = (inp.goal - inp.startingBalance) / deposit;
    return { exact, periods: Math.ceil(exact - 1e-9) };
  }
  // P(1+i)^k + D·a·((1+i)^k − 1)/i = G  →  (1+i)^k = (G·i + D·a) / (P·i + D·a)
  const num = inp.goal * i + deposit * a;
  const den = inp.startingBalance * i + deposit * a;
  if (den <= 0 || num <= 0 || num / den <= 0) return { exact: Infinity, periods: Infinity };
  const exact = Math.log(num / den) / Math.log1p(i);
  if (!Number.isFinite(exact) || exact < 0) return { exact: Infinity, periods: Infinity };
  let periods = Math.ceil(exact - 1e-9);
  // Guard against floating point landing a hair short.
  if (savingsBalance(inp, deposit, periods) < inp.goal - 1e-6) periods += 1;
  return { exact, periods };
}

/** Year-by-year schedule (the last row may be a partial year). */
export function savingsSchedule(inp: SavingsInput, deposit: number, totalPeriods: number): SavingsYearRow[] {
  const rows: SavingsYearRow[] = [];
  if (!Number.isFinite(totalPeriods) || totalPeriods <= 0) return rows;
  const p = inp.depositsPerYear;
  const capped = Math.min(totalPeriods, p * 200);
  const years = Math.ceil(capped / p);
  for (let y = 1; y <= years; y++) {
    const k = Math.min(y * p, capped);
    const balance = savingsBalance(inp, deposit, k);
    const deposits = deposit * k;
    rows.push({ year: Number((k / p).toFixed(4)), deposits, interest: balance - inp.startingBalance - deposits, balance });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Inflation
// ---------------------------------------------------------------------------

/** What `amount` today costs after `years` of inflation at `ratePct`. */
export function inflateForward(amount: number, ratePct: number, years: number): number {
  return amount * Math.pow(1 + ratePct / 100, years);
}

/** What a future `amount` is worth in today's money (purchasing power). */
export function deflateBack(amount: number, ratePct: number, years: number): number {
  return amount / Math.pow(1 + ratePct / 100, years);
}

/** Average annual rate that turns `from` into `to` over `years`. */
export function averageAnnualRate(from: number, to: number, years: number): number {
  if (!(from > 0) || !(to > 0) || !(years > 0)) return NaN;
  return Math.pow(to / from, 1 / years) - 1;
}

export function cpiYears(): { first: number; last: number } {
  return { first: CPI_U_FIRST_YEAR, last: CPI_U_LAST_YEAR };
}

export function cpiFor(year: number): number | undefined {
  return CPI_U_ANNUAL[year];
}

export type CpiResult = {
  value: number;
  cpiFrom: number;
  cpiTo: number;
  cumulativePct: number;
  averageAnnualPct: number;
};

/** Converts `amount` in `fromYear` dollars to `toYear` dollars using CPI-U annual averages. */
export function cpiAdjust(amount: number, fromYear: number, toYear: number): CpiResult | null {
  const cpiFrom = CPI_U_ANNUAL[fromYear];
  const cpiTo = CPI_U_ANNUAL[toYear];
  if (!cpiFrom || !cpiTo) return null;
  const ratio = cpiTo / cpiFrom;
  const years = Math.abs(toYear - fromYear);
  const avg = years === 0 ? 0 : Math.pow(toYear > fromYear ? ratio : 1 / ratio, 1 / years) - 1;
  return { value: amount * ratio, cpiFrom, cpiTo, cumulativePct: (ratio - 1) * 100, averageAnnualPct: avg * 100 };
}

// ---------------------------------------------------------------------------
// CAGR
// ---------------------------------------------------------------------------

/** CAGR = (end/start)^(1/years) − 1. NaN when undefined. */
export function cagr(start: number, end: number, years: number): number {
  if (!(start > 0) || !(end >= 0) || !(years > 0)) return NaN;
  if (end === 0) return -1;
  return Math.pow(end / start, 1 / years) - 1;
}

export function cagrEndValue(start: number, ratePct: number, years: number): number {
  return start * Math.pow(1 + ratePct / 100, years);
}

export function cagrYears(start: number, end: number, ratePct: number): number {
  const r = ratePct / 100;
  if (!(start > 0) || !(end > 0) || r <= -1 || r === 0) return NaN;
  const y = Math.log(end / start) / Math.log1p(r);
  return y >= 0 ? y : NaN;
}

/** Simple (arithmetic) average annual return: total return / years. */
export function simpleAnnualReturn(start: number, end: number, years: number): number {
  if (!(start > 0) || !(years > 0)) return NaN;
  return (end / start - 1) / years;
}

/** Year-over-year returns from a list of values, and their arithmetic mean. */
export function yearlyReturns(values: number[]): { returns: number[]; arithmeticMean: number; geometric: number } {
  const returns: number[] = [];
  for (let k = 1; k < values.length; k++) {
    returns.push(values[k - 1] > 0 ? values[k] / values[k - 1] - 1 : NaN);
  }
  const ok = returns.filter(Number.isFinite);
  const arithmeticMean = ok.length === returns.length && ok.length > 0 ? ok.reduce((s, x) => s + x, 0) / ok.length : NaN;
  const geometric = values.length > 1 ? cagr(values[0], values[values.length - 1], values.length - 1) : NaN;
  return { returns, arithmeticMean, geometric };
}

// ---------------------------------------------------------------------------
// ROI
// ---------------------------------------------------------------------------

export type RoiInput = {
  invested: number;
  returned: number;
  /** Fees, commissions, taxes paid: added to the cost basis. */
  costs?: number;
  /** Dividends, interest or rent received while holding. */
  income?: number;
  years: number;
};

export type RoiResult = {
  totalCost: number;
  totalBack: number;
  netGain: number;
  roi: number; // fraction
  annualized: number; // fraction, NaN when years <= 0
};

export function computeRoi(inp: RoiInput): RoiResult | null {
  const costs = inp.costs ?? 0;
  const income = inp.income ?? 0;
  const totalCost = inp.invested + costs;
  if (!(totalCost > 0) || !(inp.returned >= 0) || !(income >= 0) || !(costs >= 0)) return null;
  const totalBack = inp.returned + income;
  const netGain = totalBack - totalCost;
  const roi = netGain / totalCost;
  let annualized = NaN;
  if (inp.years > 0) annualized = roi <= -1 ? -1 : Math.pow(1 + roi, 1 / inp.years) - 1;
  return { totalCost, totalBack, netGain, roi, annualized };
}

// ---------------------------------------------------------------------------
// Present and future value
// ---------------------------------------------------------------------------

export type TvmInput = {
  annualRatePct: number;
  compounding: Compounding;
  years: number;
  /** Payments per year for the series (also used to convert the rate). */
  paymentsPerYear: number;
  payment: number;
  timing: DepositTiming; // 'end' = ordinary annuity, 'start' = annuity due
};

export type TvmParts = {
  i: number; // rate per payment period
  n: number; // number of payment periods
  growth: number; // (1+i)^n
  lump: number;
  series: number;
  total: number;
};

/** Future value of a present lump sum plus a payment series. */
export function futureValue(pv: number, t: TvmInput): TvmParts {
  const i = ratePerPaymentPeriod(t.annualRatePct, t.compounding, t.paymentsPerYear);
  const n = t.years * t.paymentsPerYear;
  const growth = Math.exp(n * Math.log1p(i));
  const due = t.timing === 'start' ? 1 + i : 1;
  const lump = pv * growth;
  const series = t.payment * fvAnnuityFactor(i, n) * due;
  return { i, n, growth, lump, series, total: lump + series };
}

/** Present value of a future lump sum plus a payment series. */
export function presentValue(fv: number, t: TvmInput): TvmParts {
  const i = ratePerPaymentPeriod(t.annualRatePct, t.compounding, t.paymentsPerYear);
  const n = t.years * t.paymentsPerYear;
  const growth = Math.exp(n * Math.log1p(i));
  const due = t.timing === 'start' ? 1 + i : 1;
  const lump = fv / growth;
  const series = t.payment * pvAnnuityFactor(i, n) * due;
  return { i, n, growth, lump, series, total: lump + series };
}

/** Present value of a level perpetuity (payment / i), annuity due adds one payment. */
export function perpetuityPv(payment: number, i: number, timing: DepositTiming): number {
  if (!(i > 0)) return Infinity;
  return payment / i + (timing === 'start' ? payment : 0);
}

// ---------------------------------------------------------------------------
// NPV / IRR / MIRR / payback
// ---------------------------------------------------------------------------

/** NPV with the first cash flow at t = 0 (not discounted). */
export function npv(rate: number, flows: number[]): number {
  if (rate <= -1) return NaN;
  let total = 0;
  const v = 1 / (1 + rate);
  let d = 1;
  for (const cf of flows) {
    total += cf * d;
    d *= v;
  }
  return total;
}

/** d NPV / d rate. */
function npvDerivative(rate: number, flows: number[]): number {
  let total = 0;
  for (let t = 1; t < flows.length; t++) total -= (t * flows[t]) / Math.pow(1 + rate, t + 1);
  return total;
}

/** Number of sign changes in the cash-flow sequence (zeros skipped). */
export function signChanges(flows: number[]): number {
  let changes = 0;
  let prev = 0;
  for (const cf of flows) {
    if (cf === 0) continue;
    const s = Math.sign(cf);
    if (prev !== 0 && s !== prev) changes++;
    prev = s;
  }
  return changes;
}

/** Root in [lo, hi] where NPV changes sign: safeguarded Newton with bisection fallback. */
function solveBracket(flows: number[], lo: number, hi: number): number {
  let fLo = npv(lo, flows);
  let x = (lo + hi) / 2;
  for (let iter = 0; iter < 200; iter++) {
    const fx = npv(x, flows);
    if (fx === 0 || hi - lo < 1e-14) return x;
    if (Math.sign(fx) === Math.sign(fLo)) { lo = x; fLo = fx; } else { hi = x; }
    const d = npvDerivative(x, flows);
    let next = d !== 0 ? x - fx / d : NaN;
    if (!(next > lo && next < hi)) next = (lo + hi) / 2;
    if (Math.abs(next - x) < 1e-13 * Math.max(1, Math.abs(x))) return next;
    x = next;
  }
  return x;
}

export type IrrResult = {
  /** All rates found in (−99%, 10,000%), ascending, as fractions. */
  rates: number[];
  signChanges: number;
  /** Why there is no single IRR, when there isn't one. */
  note?: 'no-sign-change' | 'no-root' | 'multiple';
};

/**
 * Finds every IRR by scanning NPV over a log-spaced grid of (1 + rate)
 * from 0.01 to 101 for sign changes, then refining each bracket.
 */
export function irrAll(flows: number[]): IrrResult {
  const sc = signChanges(flows);
  if (sc === 0) return { rates: [], signChanges: 0, note: 'no-sign-change' };
  const rates: number[] = [];
  const steps = 4000;
  const lnLo = Math.log(0.01);
  const lnHi = Math.log(101);
  let prevR = Math.exp(lnLo) - 1;
  let prevF = npv(prevR, flows);
  for (let k = 1; k <= steps; k++) {
    const r = Math.exp(lnLo + ((lnHi - lnLo) * k) / steps) - 1;
    const f = npv(r, flows);
    if (prevF === 0) rates.push(prevR);
    else if (Number.isFinite(f) && Number.isFinite(prevF) && f !== 0 && Math.sign(f) !== Math.sign(prevF)) {
      rates.push(solveBracket(flows, prevR, r));
    }
    prevR = r;
    prevF = f;
  }
  const unique = rates.filter((r, idx) => idx === 0 || Math.abs(r - rates[idx - 1]) > 1e-9);
  if (unique.length === 0) return { rates: [], signChanges: sc, note: 'no-root' };
  return { rates: unique, signChanges: sc, note: unique.length > 1 ? 'multiple' : undefined };
}

/**
 * MIRR as defined by Excel: negative flows discounted to t = 0 at the finance
 * rate, positive flows compounded to t = n at the reinvestment rate.
 */
export function mirr(flows: number[], financeRate: number, reinvestRate: number): number {
  const n = flows.length - 1;
  if (n < 1) return NaN;
  let pvNeg = 0;
  let fvPos = 0;
  flows.forEach((cf, t) => {
    if (cf < 0) pvNeg += cf / Math.pow(1 + financeRate, t);
    else fvPos += cf * Math.pow(1 + reinvestRate, n - t);
  });
  if (pvNeg === 0 || fvPos === 0) return NaN;
  return Math.pow(fvPos / -pvNeg, 1 / n) - 1;
}

/**
 * Payback period: when cumulative cash flow first turns non-negative and
 * stays there, interpolating linearly inside the period. Discounts each flow
 * at `rate` first when given. Returns null when it never pays back.
 */
export function paybackPeriod(flows: number[], rate?: number): number | null {
  const adj = rate === undefined ? flows : flows.map((cf, t) => cf / Math.pow(1 + rate, t));
  const cum: number[] = [];
  let run = 0;
  for (const cf of adj) { run += cf; cum.push(run); }
  if (cum.length === 0 || cum[cum.length - 1] < 0) return null;
  // Last index where the cumulative is still negative.
  let last = -1;
  for (let t = 0; t < cum.length; t++) if (cum[t] < -1e-9) last = t;
  if (last === -1) return 0;
  const next = adj[last + 1];
  return last + (next > 0 ? -cum[last] / next : 1);
}

/** Profitability index: PV of later flows / initial outlay. */
export function profitabilityIndex(rate: number, flows: number[]): number {
  if (flows.length < 2 || !(flows[0] < 0)) return NaN;
  return (npv(rate, flows) - flows[0]) / -flows[0];
}

/** Parses cash flows typed one per line or separated by commas/semicolons/tabs. */
export function parseCashFlows(text: string): { flows: number[]; errors: string[] } {
  const flows: number[] = [];
  const errors: string[] = [];
  // Lines, semicolons and tabs always separate. Inside a chunk, "comma space"
  // separates; a bare comma is a thousands separator only when the chunk looks
  // like 1,234,567, otherwise it separates too (so "-1000,300,400" works).
  const thousands = /^[-−]?\(?[$€£₹¥]?\d{1,3}(,\d{3})+(\.\d+)?\)?$/;
  const parts: string[] = [];
  for (const chunk of text.split(/[\n;\t]+/)) {
    const c = chunk.trim();
    if (c === '') continue;
    if (/,\s/.test(c)) parts.push(...c.split(/,\s+/));
    else if (thousands.test(c)) parts.push(c);
    else parts.push(...c.split(','));
  }
  parts.forEach((raw, idx) => {
    let s = raw.trim().replace(/^−/, '-');
    if (s === '') return;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    const v = parseNum(s);
    if (Number.isNaN(v)) errors.push(built(msg('Entry {n} ("{raw}") is not a number'), { n: idx + 1, raw: raw.trim() }));
    else flows.push(neg ? -v : v);
  });
  return { flows, errors };
}

/** Converts an annual effective rate to a per-period rate. */
export function annualToPeriodRate(annual: number, periodsPerYear: number): number {
  return Math.pow(1 + annual, 1 / periodsPerYear) - 1;
}

export function periodToAnnualRate(period: number, periodsPerYear: number): number {
  return Math.pow(1 + period, periodsPerYear) - 1;
}
