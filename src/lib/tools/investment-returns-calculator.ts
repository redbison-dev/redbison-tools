export interface CashFlow {
  /** ISO date, YYYY-MM-DD */
  date: string;
  /** Negative = money you put in, positive = money you took out (or the final value) */
  amount: number;
}

export interface UnitTransaction {
  type: 'buy' | 'sell';
  date: string;
  amount: number;
  shares?: number;
  price?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Links sub-period returns geometrically: (1 + r1)(1 + r2)...(1 + rn) - 1. */
export function chainReturns(returns: number[]): number {
  return returns.reduce((acc, r) => acc * (1 + r), 1) - 1;
}

/** Converts a cumulative return over `years` into a compound annual rate. */
export function annualizeReturn(cumulative: number, years: number): number {
  if (years <= 0 || cumulative <= -1) return NaN;
  return Math.pow(1 + cumulative, 1 / years) - 1;
}

function npv(rate: number, flows: { t: number; amount: number }[]): number {
  return flows.reduce((sum, f) => sum + f.amount / Math.pow(1 + rate, f.t), 0);
}

/**
 * Money-weighted return (XIRR): the annual rate at which the dated cash
 * flows have a net present value of zero, using actual days / 365 like
 * spreadsheet XIRR. Returns null when there is no sign change or no root.
 */
export function xirr(cashFlows: CashFlow[]): number | null {
  if (cashFlows.length < 2) return null;
  const sorted = [...cashFlows].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const t0 = Date.parse(sorted[0].date);
  const flows = sorted.map((f) => ({ t: (Date.parse(f.date) - t0) / DAY_MS / 365, amount: f.amount }));
  if (!flows.some((f) => f.amount > 0) || !flows.some((f) => f.amount < 0)) return null;
  if (flows.some((f) => !Number.isFinite(f.t) || !Number.isFinite(f.amount))) return null;

  // Newton-Raphson first, bisection as a fallback.
  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const value = npv(rate, flows);
    const deriv = flows.reduce((s, f) => s - (f.t * f.amount) / Math.pow(1 + rate, f.t + 1), 0);
    if (!Number.isFinite(value) || !Number.isFinite(deriv) || deriv === 0) break;
    const next = rate - value / deriv;
    if (!Number.isFinite(next) || next <= -1) break;
    if (Math.abs(next - rate) < 1e-12) return next;
    rate = next;
  }

  let lo = -0.999999;
  let hi = 1;
  while (npv(lo, flows) * npv(hi, flows) > 0 && hi < 1e6) hi *= 2;
  let fLo = npv(lo, flows);
  if (fLo * npv(hi, flows) > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, flows);
    if (Math.abs(fMid) < 1e-9 || hi - lo < 1e-12) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

/** Cash flows from the investor's side, plus the current value as a final inflow. */
export function toCashFlows(transactions: UnitTransaction[], currentValue: number, asOf: string): CashFlow[] {
  return [
    ...transactions.map((t) => ({ date: t.date, amount: t.type === 'buy' ? -t.amount : t.amount })),
    { date: asOf, amount: currentValue },
  ];
}

export interface TimeWeightedResult {
  /** Return of each sub-period between consecutive cash flows (and to today) */
  subPeriodReturns: number[];
  /** Cumulative time-weighted return */
  twr: number;
}

/**
 * True time-weighted return for a single holding. It needs a valuation at
 * every cash flow, which the share price provides: price is taken from the
 * Price per Share field or derived as amount / shares. The final price is the
 * current value divided by the shares still held. Each sub-period return is
 * p(i+1) / p(i) - 1 and the sub-periods are chained geometrically, so the
 * size and timing of deposits and withdrawals has no effect.
 * Returns null if any transaction lacks a share count or no shares remain.
 */
export function timeWeightedReturnFromUnits(transactions: UnitTransaction[], currentValue: number): TimeWeightedResult | null {
  if (transactions.length === 0 || !(currentValue > 0)) return null;
  const sorted = [...transactions].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const prices: number[] = [];
  let sharesHeld = 0;
  for (const t of sorted) {
    if (!t.shares || t.shares <= 0) return null;
    const price = t.price && t.price > 0 ? t.price : t.amount / t.shares;
    if (!(price > 0)) return null;
    prices.push(price);
    sharesHeld += t.type === 'buy' ? t.shares : -t.shares;
  }
  if (sharesHeld <= 1e-12) return null;
  prices.push(currentValue / sharesHeld);
  const subPeriodReturns = prices.slice(1).map((p, i) => p / prices[i] - 1);
  return { subPeriodReturns, twr: chainReturns(subPeriodReturns) };
}
