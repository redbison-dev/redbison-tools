/**
 * Balance transfer maths: does moving a card balance to a promotional-rate
 * card save money once the transfer fee is paid, and what is left when the
 * promotional rate ends?
 *
 * Conventions (shared with ./loans): rates are annual percentages, interest
 * is charged monthly at APR / 12 on the opening balance, a fixed payment is
 * made at the end of each month, and money is kept unrounded. Most card
 * issuers charge a daily periodic rate on the average daily balance, so a
 * statement can differ by a few dollars a month on a large balance.
 *
 * Assumptions, stated on the page:
 * - The fee is the larger of a percentage of the amount transferred and a
 *   minimum (the form CFPB describes), added to the new card's balance on
 *   day one and charged the promotional rate.
 * - The promotional period covers the first `promoMonths` monthly payments;
 *   after that the go-to APR applies to whatever is left. Regulation Z
 *   (12 CFR 1026.55(b)(1)) requires a promotional rate to last at least six
 *   months and the go-to rate to be disclosed in advance.
 * - No new purchases go on either card, so all of the payment reduces the
 *   transferred balance (with purchases, 12 CFR 1026.53 sends payments above
 *   the minimum to the highest-rate balance first).
 * - The promotion is a true reduced APR, not a deferred-interest offer that
 *   charges back interest if the balance is not cleared.
 * - During the promotion a payment below the month's interest lets the
 *   balance grow (unpaid interest is added), as on a real card; the result
 *   flags it. After the promotion and on the current card, a payment that
 *   does not exceed the interest means the plan never ends (months = null).
 */
import { amortize, monthlyPayment, PAYOFF_MONTH_CAP, type AmortRow } from './loans';

const EPS = 1e-7;

export interface BalanceTransferInput {
  /** Amount moved to the new card. */
  balance: number;
  /** APR on the card you would otherwise keep paying. */
  currentAprPct: number;
  /** Transfer fee as a percent of the amount transferred. */
  feePct: number;
  /** Minimum transfer fee in currency units (0 for none). */
  feeMin: number;
  /** Promotional APR on the transferred balance, usually 0. */
  promoAprPct: number;
  /** Number of monthly payments made at the promotional rate. */
  promoMonths: number;
  /** APR after the promotion ends (the "go-to" rate). */
  goToAprPct: number;
  /** Fixed monthly payment made on either plan. */
  monthlyPayment: number;
}

export interface CardPlan {
  /** Months until the balance is zero; null when it is not paid off within PAYOFF_MONTH_CAP. */
  months: number | null;
  totalInterest: number;
  totalPaid: number;
  /** Balance at the end of each month (index 0 = month 1). */
  balances: number[];
}

export interface TransferPlan extends CardPlan {
  /** Balance still owed after the last promotional payment (0 when cleared). */
  balanceAtPromoEnd: number;
  interestDuringPromo: number;
  interestAfterPromo: number;
  /** Fee plus all interest: what the transfer costs you. */
  totalCost: number;
  /** True when the balance reaches zero before the promotion ends. */
  clearedInPromo: boolean;
  /** True when the payment does not exceed the first month's promotional interest, so the balance does not fall during the promotion. */
  paymentBelowPromoInterest: boolean;
}

export interface BalanceTransferResult {
  fee: number;
  /** Fee as a percent of the amount transferred (differs from feePct when the minimum applies). */
  effectiveFeePct: number;
  /** Balance on the new card on day one: transfer + fee. */
  startingBalance: number;
  transfer: TransferPlan;
  stay: CardPlan & { totalCost: number };
  /** Stay cost minus transfer cost; positive means the transfer saves money. Null when either plan never pays off. */
  savings: number | null;
  /** Level payment that clears the starting balance within the promotion. */
  paymentToClearInPromo: number;
  /** First month's interest on the current card: the payment must exceed it for the stay plan to end. */
  stayFirstMonthInterest: number;
  /** First month's interest at the go-to rate on the balance left at promo end (0 when cleared). */
  goToFirstMonthInterest: number;
}

const finite = (...xs: number[]) => xs.every((x) => Number.isFinite(x));

/** `payment` caps each month's outflow: amortize books a payment below the interest as interest-only, which would overstate what was paid. */
function planFromRows(rows: AmortRow[], payment: number): CardPlan {
  const last = rows[rows.length - 1];
  const done = !last || last.balance <= EPS;
  return {
    months: done ? rows.length : null,
    totalInterest: rows.reduce((s, r) => s + r.interest, 0),
    totalPaid: rows.reduce((s, r) => s + Math.min(r.payment + r.extra, payment), 0),
    balances: rows.map((r) => r.balance),
  };
}

/** Pays a fixed amount on a balance at one APR for up to `maxMonths`. */
function payDown(balance: number, aprPct: number, payment: number, maxMonths: number): AmortRow[] {
  if (balance <= EPS || maxMonths <= 0) return [];
  return amortize(balance, aprPct, maxMonths, {}, { payment, maxMonths }).rows;
}

/**
 * Promotional phase: up to `months` fixed payments at `aprPct`. Unlike
 * amortize, a payment below the interest does not stop the loop; the unpaid
 * interest is added to the balance, so the promotion always runs its length.
 */
function promoPhase(balance: number, aprPct: number, payment: number, months: number): AmortRow[] {
  const r = aprPct / 1200;
  const rows: AmortRow[] = [];
  let b = balance;
  for (let m = 1; m <= months && b > EPS; m++) {
    const interest = b * r;
    const pay = Math.min(payment, b + interest);
    b = b + interest - pay;
    if (b < EPS) b = 0;
    rows.push({ month: m, payment: pay, interest, principal: pay - interest, extra: 0, balance: b });
  }
  return rows;
}

/** The fee charged on a transfer: max(percent of amount, minimum). */
export function transferFee(balance: number, feePct: number, feeMin = 0): number {
  if (!finite(balance, feePct, feeMin) || balance <= 0) return 0;
  return Math.max((balance * Math.max(0, feePct)) / 100, Math.max(0, feeMin));
}

export function calculateBalanceTransfer(i: BalanceTransferInput): BalanceTransferResult | null {
  if (!finite(i.balance, i.currentAprPct, i.feePct, i.feeMin, i.promoAprPct, i.promoMonths, i.goToAprPct, i.monthlyPayment)) return null;
  if (i.balance <= 0 || i.monthlyPayment <= 0) return null;
  if (i.currentAprPct < 0 || i.feePct < 0 || i.feeMin < 0 || i.promoAprPct < 0 || i.goToAprPct < 0) return null;
  const promoMonths = Math.round(i.promoMonths);
  if (promoMonths < 0 || promoMonths > PAYOFF_MONTH_CAP) return null;

  const fee = transferFee(i.balance, i.feePct, i.feeMin);
  const startingBalance = i.balance + fee;

  // Transfer: promotional phase, then the go-to rate on whatever is left.
  const promoRows = promoPhase(startingBalance, i.promoAprPct, i.monthlyPayment, promoMonths);
  const lastPromo = promoRows[promoRows.length - 1];
  const balanceAtPromoEnd = promoMonths === 0 ? startingBalance : lastPromo ? Math.max(0, lastPromo.balance) : 0;
  const afterRows = payDown(balanceAtPromoEnd, i.goToAprPct, i.monthlyPayment, PAYOFF_MONTH_CAP - promoRows.length).map((r) => ({ ...r, month: r.month + promoRows.length }));
  const transferRows = [...promoRows, ...afterRows];
  const tPlan = planFromRows(transferRows, i.monthlyPayment);
  const interestDuringPromo = promoRows.reduce((s, r) => s + r.interest, 0);
  const interestAfterPromo = afterRows.reduce((s, r) => s + r.interest, 0);
  const transfer: TransferPlan = {
    ...tPlan,
    balanceAtPromoEnd: balanceAtPromoEnd <= EPS ? 0 : balanceAtPromoEnd,
    interestDuringPromo,
    interestAfterPromo,
    totalCost: fee + tPlan.totalInterest,
    clearedInPromo: balanceAtPromoEnd <= EPS,
    paymentBelowPromoInterest: promoMonths > 0 && i.monthlyPayment <= (startingBalance * i.promoAprPct) / 1200,
  };

  // Stay: the same payment on the current card.
  const stayRows = payDown(i.balance, i.currentAprPct, i.monthlyPayment, PAYOFF_MONTH_CAP);
  const sPlan = planFromRows(stayRows, i.monthlyPayment);
  const stay = { ...sPlan, totalCost: sPlan.totalInterest };

  const savings = transfer.months !== null && stay.months !== null ? stay.totalCost - transfer.totalCost : null;
  const paymentToClearInPromo = promoMonths > 0 ? monthlyPayment(startingBalance, i.promoAprPct, promoMonths) : NaN;

  return {
    fee,
    effectiveFeePct: (fee / i.balance) * 100,
    startingBalance,
    transfer,
    stay,
    savings,
    paymentToClearInPromo,
    stayFirstMonthInterest: (i.balance * i.currentAprPct) / 1200,
    goToFirstMonthInterest: (transfer.balanceAtPromoEnd * i.goToAprPct) / 1200,
  };
}

/**
 * Largest transfer fee percentage at which the transfer still costs no more
 * than staying, for the same payment (bisection on feePct, minimum fee
 * ignored). Null when even a 0% fee does not save money or a plan never ends.
 */
export function breakEvenFeePct(i: BalanceTransferInput): number | null {
  const at = (feePct: number) => calculateBalanceTransfer({ ...i, feePct, feeMin: 0 })?.savings ?? null;
  const zero = at(0);
  if (zero === null || zero <= 0) return null;
  let lo = 0;
  let hi = 100;
  const top = at(hi);
  if (top !== null && top > 0) return hi;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    const s = at(mid);
    if (s !== null && s > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
