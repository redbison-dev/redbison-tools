/**
 * Debt consolidation maths: keep paying your current debts as you do now, or
 * replace them with one fixed-rate loan that has an origination fee?
 *
 * Reuses ./loans: the current plan is simulatePayoff in 'minimum' mode (each
 * debt gets its own fixed payment, nothing is rolled over when one is paid
 * off), the loan payment and APR come from calculateApr (Regulation Z
 * Appendix J actuarial method), and the "keep paying what you pay now"
 * variant is amortize with a fixed payment.
 *
 * Origination fee handling:
 * - 'deducted': the lender takes the fee out of the loan proceeds, so to pay
 *   off debts totalling D you must borrow L = D / (1 - fee%). The fee and the
 *   interest on it are part of the cost.
 * - 'cash': you borrow L = D and pay the fee separately at signing.
 * Either way the fee is a prepaid finance charge (12 CFR 1026.4), so the
 * amount financed is L - fee and the APR is the same for the same L.
 */
import { amortize, calculateApr, simulatePayoff, effectiveAnnualRate, monthlyEquivalentRatePct, PAYOFF_MONTH_CAP, type Debt } from './loans';

export type OriginationFeeMode = 'deducted' | 'cash';

export interface ConsolidationDebt {
  name: string;
  balance: number;
  aprPct: number;
  /** What you pay on this debt each month now. */
  payment: number;
}

export interface ConsolidationInput {
  debts: ConsolidationDebt[];
  /** Note rate of the consolidation loan. */
  loanRatePct: number;
  termMonths: number;
  /** Origination fee as a percent of the loan amount. */
  feePct: number;
  feeMode: OriginationFeeMode;
  /**
   * How every rate here is quoted. 12 (default) is a nominal APR charged at
   * rate / 12 a month, the US behaviour. 1 reads each rate as a UK APR, an
   * annual effective rate (FCA CONC App 1.1): the monthly rate is
   * (1 + APR)^(1/12) - 1 and the loan APR is reported the same way.
   */
  compoundingPerYear?: number;
}

export interface ConsolidationResult {
  totalDebt: number;
  /** Balance-weighted average APR of the current debts. */
  weightedAprPct: number;
  current: {
    /** Sum of the current payments. */
    monthlyPayment: number;
    /** Months until the last debt is paid; null if some debt never pays off. */
    months: number | null;
    totalInterest: number;
    totalPaid: number;
    /** Debts whose payment does not cover their interest. */
    stuck: string[];
    /** Total balance at the end of each month (index 0 = month 1). */
    balances: number[];
  };
  loan: {
    amount: number;
    fee: number;
    amountFinanced: number;
    payment: number;
    months: number;
    totalInterest: number;
    /** Interest plus origination fee. */
    totalCost: number;
    totalPaid: number;
    aprPct: number;
    balances: number[];
  };
  /** Current interest minus loan cost (interest + fee); positive = consolidation is cheaper. Null if the current plan never ends. */
  savings: number | null;
  /** Loan payment minus current total payment (negative = lower payment). */
  monthlyChange: number;
  /** Paying the current total each month on the new loan (only when that is more than the loan payment). */
  sameBudget: { payment: number; months: number; totalInterest: number; totalCost: number; savings: number | null } | null;
  /** The loan rate is below the weighted APR, yet the loan costs more in total because of its term or fee. */
  longerTermCostsMore: boolean;
  /**
   * When longerTermCostsMore: 'fee' if the same loan without the fee would
   * cost less than the current plan (the fee tips it), otherwise 'term'
   * (even fee-free, repaying over this term costs more). Null otherwise.
   */
  costDriver: 'fee' | 'term' | null;
}

const finite = (...xs: number[]) => xs.every((x) => Number.isFinite(x));

/** Highest origination fee accepted, percent. Larger fees push the APR past what solveRate can bracket. */
export const MAX_FEE_PCT = 30;

export function calculateConsolidation(i: ConsolidationInput): ConsolidationResult | null {
  if (!finite(i.loanRatePct, i.termMonths, i.feePct)) return null;
  if (i.loanRatePct < 0 || i.feePct < 0 || i.feePct > MAX_FEE_PCT) return null;
  const n = Math.round(i.termMonths);
  if (n < 1 || n > PAYOFF_MONTH_CAP) return null;
  const debts = i.debts.filter((d) => finite(d.balance, d.aprPct, d.payment) && d.balance > 0);
  if (debts.length === 0 || debts.some((d) => d.aprPct < 0 || d.payment < 0)) return null;

  const totalDebt = debts.reduce((s, d) => s + d.balance, 0);
  const weightedAprPct = debts.reduce((s, d) => s + d.balance * d.aprPct, 0) / totalDebt;
  const currentPayment = debts.reduce((s, d) => s + d.payment, 0);

  const comp = i.compoundingPerYear ?? 12;
  const nominal = (ratePct: number) => monthlyEquivalentRatePct(ratePct, comp);
  const loanRate = nominal(i.loanRatePct);
  const named: Debt[] = debts.map((d, k) => ({ name: d.name.trim() || `Debt ${k + 1}`, balance: d.balance, aprPct: nominal(d.aprPct), minPayment: d.payment }));
  const sim = simulatePayoff(named, currentPayment, 'minimum');

  const f = i.feePct / 100;
  const amount = i.feeMode === 'deducted' ? totalDebt / (1 - f) : totalDebt;
  const fee = amount * f;
  const apr = calculateApr({ loanAmount: amount, ratePct: loanRate, termMonths: n, fees: fee, pointsPct: 0, financeFees: false });
  if (!apr) return null;
  const sched = amortize(amount, loanRate, n);
  const loanCost = sched.totalInterest + fee;

  const savings = sim.months === null ? null : sim.totalInterest - loanCost;

  let sameBudget: ConsolidationResult['sameBudget'] = null;
  if (currentPayment > apr.payment + 0.005) {
    const fast = amortize(amount, loanRate, n, {}, { payment: currentPayment });
    const cost = fast.totalInterest + fee;
    sameBudget = { payment: currentPayment, months: fast.months, totalInterest: fast.totalInterest, totalCost: cost, savings: sim.months === null ? null : sim.totalInterest - cost };
  }

  const longerTermCostsMore = i.loanRatePct < weightedAprPct && savings !== null && savings < 0;
  let costDriver: ConsolidationResult['costDriver'] = null;
  if (longerTermCostsMore) {
    const noFeeInterest = amortize(totalDebt, loanRate, n).totalInterest;
    costDriver = noFeeInterest < sim.totalInterest ? 'fee' : 'term';
  }

  return {
    totalDebt,
    weightedAprPct,
    current: { monthlyPayment: currentPayment, months: sim.months, totalInterest: sim.totalInterest, totalPaid: sim.totalPaid, stuck: sim.stuck, balances: sim.balances.slice(1) },
    loan: {
      amount,
      fee,
      amountFinanced: apr.amountFinanced,
      payment: apr.payment,
      months: sched.months,
      totalInterest: sched.totalInterest,
      totalCost: loanCost,
      totalPaid: sched.totalPaid + (i.feeMode === 'cash' ? fee : 0),
      aprPct: comp === 12 ? apr.aprPct : effectiveAnnualRate(apr.aprPct, 12),
      balances: sched.rows.map((r) => r.balance),
    },
    savings,
    monthlyChange: apr.payment - currentPayment,
    sameBudget,
    longerTermCostsMore,
    costDriver,
  };
}
