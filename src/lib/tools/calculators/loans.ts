/**
 * Pure loan maths for the Loans & Mortgages calculators (mortgage,
 * affordability, refinance, auto loan, auto lease, debt payoff, DTI,
 * student loan, APR). No React here so the regression tests exercise
 * exactly what the UI shows.
 *
 * Conventions: rates are annual percentages (6.5 means 6.5%), interest is
 * charged monthly at rate / 12 on the opening balance, payments are made at
 * the end of each month, and money is kept unrounded internally (the UI
 * rounds for display).
 */
import { msg, fillMsg, type MsgText } from '../../msg';

const EPS = 1e-7;

const finite = (...xs: number[]) => xs.every((x) => Number.isFinite(x));

/** Level monthly payment that repays `principal` over `months` at `annualRatePct`. */
export function monthlyPayment(principal: number, annualRatePct: number, months: number): number {
  if (!finite(principal, annualRatePct, months) || months <= 0 || principal <= 0) return 0;
  const r = annualRatePct / 1200;
  if (r === 0) return principal / months;
  // Stable form of P r g / (g - 1): for a tiny rate (1 + r)^n rounds to 1 and the naive divisor is 0.
  return (principal * r) / -Math.expm1(-months * Math.log1p(r));
}

/** Present value of `months` level payments discounted at a monthly rate. */
export function presentValue(payment: number, monthlyRate: number, months: number): number {
  if (monthlyRate === 0) return payment * months;
  return (payment * -Math.expm1(-months * Math.log1p(monthlyRate))) / monthlyRate;
}

/** Effective annual rate of a nominal annual rate compounded `periods` times a year. */
export function effectiveAnnualRate(nominalPct: number, periods = 12): number {
  return (Math.pow(1 + nominalPct / 100 / periods, periods) - 1) * 100;
}

/** Calendar label for payment `n` (1-based) given a first-payment month. */
export function paymentDate(startYear: number, startMonth: number, n: number): { year: number; month: number } {
  const idx = startYear * 12 + (startMonth - 1) + (n - 1);
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatPaymentDate(startYear: number, startMonth: number, n: number): string {
  const d = paymentDate(startYear, startMonth, n);
  return `${MONTHS[d.month - 1]} ${d.year}`;
}

/** "N years M months" from a month count. */
export function formatDuration(months: number): string {
  return fillMsg(formatDurationMsg(months));
}

/** formatDuration as a message for t(): one/other forms for years and months ("{years} years {months} month"). */
export function formatDurationMsg(total: number): MsgText {
  const years = Math.floor(total / 12);
  const months = total % 12;
  if (years && months) return { text: years === 1 ? (msg.plural(months, { one: '{years} year {months} month', other: '{years} year {months} months' }, 'months')) : msg.plural(months, { one: '{years} years {months} month', other: '{years} years {months} months' }, 'months'), vars: { years, months } };
  if (years) return { text: msg.plural(years, { one: '{years} year', other: '{years} years' }), vars: { years } };
  return { text: msg.plural(months, { one: '{months} month', other: '{months} months' }), vars: { months } };
}

// ---------------------------------------------------------------------------
// Market conventions (localized versions, docs/seo/localization-plan.md)
// ---------------------------------------------------------------------------

/**
 * Nominal annual rate, compounded monthly, that is equivalent to `ratePct`
 * compounded `compoundingPerYear` times a year. Canadian fixed-rate mortgages
 * quote a rate compounded half-yearly (Interest Act, s. 6: "calculated yearly
 * or half-yearly, not in advance"), so 5% there is 4.9487% compounded monthly.
 * 12 returns the rate unchanged, which keeps the US behaviour exact.
 */
export function monthlyEquivalentRatePct(ratePct: number, compoundingPerYear = 12): number {
  if (!Number.isFinite(ratePct) || !Number.isFinite(compoundingPerYear) || compoundingPerYear === 12 || compoundingPerYear <= 0) return ratePct;
  return 1200 * Math.expm1((compoundingPerYear / 12) * Math.log1p(ratePct / 100 / compoundingPerYear));
}

/** Rate per payment period for `paymentsPerYear` payments, from a nominal rate compounded `compoundingPerYear` times a year. */
export function periodicRate(ratePct: number, compoundingPerYear: number, paymentsPerYear: number): number {
  return Math.expm1((compoundingPerYear / paymentsPerYear) * Math.log1p(ratePct / 100 / compoundingPerYear));
}

/**
 * CMHC mortgage loan insurance premium, percent of the loan, by loan-to-value
 * (standard down payment). Table "Premium on Total Loan" on CMHC's
 * "Mortgage loan insurance cost" page. NaN above 95%: the minimum down
 * payment in Canada is 5%, so no insured loan exists there.
 */
export const CMHC_PREMIUMS: { maxLtvPct: number; premiumPct: number }[] = [
  { maxLtvPct: 65, premiumPct: 0.6 },
  { maxLtvPct: 75, premiumPct: 1.7 },
  { maxLtvPct: 80, premiumPct: 2.4 },
  { maxLtvPct: 85, premiumPct: 2.8 },
  { maxLtvPct: 90, premiumPct: 3.1 },
  { maxLtvPct: 95, premiumPct: 4.0 },
];
/**
 * Surcharge, in percentage points, CMHC adds to the premium when an insured
 * amortization is longer than 25 years (CMHC notice "CMHC revises homeowner
 * mortgage loan insurance premiums", 2024).
 */
export const CMHC_LONG_AMORTIZATION_SURCHARGE_PCT = 0.2;
export function cmhcPremiumRatePct(ltvPct: number, amortizationYears?: number): number {
  if (!Number.isFinite(ltvPct) || ltvPct < 0) return NaN;
  const band = CMHC_PREMIUMS.find((b) => ltvPct <= b.maxLtvPct + 1e-9);
  if (!band) return NaN;
  const surcharge = amortizationYears !== undefined && amortizationYears > 25 + 1e-9 ? CMHC_LONG_AMORTIZATION_SURCHARGE_PCT : 0;
  return Math.round((band.premiumPct + surcharge) * 100) / 100;
}

/**
 * Canada's minimum down payment (FCAC "Saving for a down payment", Table 1):
 * 5% of a price up to $500,000; 5% of the first $500,000 plus 10% of the rest
 * up to $1.5 million; 20% at $1.5 million or more.
 */
export function canadaMinimumDownPayment(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (price <= 500000) return price * 0.05;
  if (price < 1500000) return 25000 + (price - 500000) * 0.1;
  return price * 0.2;
}

/** Highest price a down payment reaches under Canada's minimum down payment rule. */
export function canadaMaxPriceForDown(down: number): number {
  if (!Number.isFinite(down) || down <= 0) return 0;
  if (down <= 25000) return down / 0.05;
  const tiered = 500000 + (down - 25000) / 0.1;
  if (tiered < 1500000) return tiered;
  // Between $125,000 and $300,000 of down payment the tiered rule tops out just under $1.5 million.
  return Math.max(1500000 - 1e-6, down / 0.2);
}

/**
 * Canadian stress test (FCAC "Preparing to get a mortgage"): you qualify at the
 * higher of 5.25% and your contract rate plus 2 points, insured or uninsured.
 */
export const CANADA_QUALIFYING_FLOOR_PCT = 5.25;
export const CANADA_QUALIFYING_BUFFER_PTS = 2;
export function canadaQualifyingRatePct(contractRatePct: number): number {
  return Math.max(CANADA_QUALIFYING_FLOOR_PCT, contractRatePct + CANADA_QUALIFYING_BUFFER_PTS);
}

/**
 * Payment frequencies as FCAC defines them ("Choosing a mortgage"):
 * semi-monthly = monthly ÷ 2; bi-weekly = monthly × 12 ÷ 26; weekly = monthly
 * × 12 ÷ 52; accelerated bi-weekly = monthly ÷ 2 every two weeks; accelerated
 * weekly = monthly ÷ 4 every week. Accelerated plans add about one monthly
 * payment a year, which shortens the loan.
 */
export type PaymentFrequency = 'monthly' | 'semi-monthly' | 'biweekly' | 'weekly' | 'accelerated-biweekly' | 'accelerated-weekly';
export const FREQUENCY_PER_YEAR: Record<PaymentFrequency, number> = {
  monthly: 12, 'semi-monthly': 24, biweekly: 26, weekly: 52, 'accelerated-biweekly': 26, 'accelerated-weekly': 52,
};
export function frequencyPayment(monthly: number, f: PaymentFrequency): number {
  switch (f) {
    case 'semi-monthly': return monthly / 2;
    case 'biweekly': return (monthly * 12) / 26;
    case 'weekly': return (monthly * 12) / 52;
    case 'accelerated-biweekly': return monthly / 2;
    case 'accelerated-weekly': return monthly / 4;
    default: return monthly;
  }
}

export interface FrequencyPlan {
  frequency: PaymentFrequency;
  paymentsPerYear: number;
  payment: number;
  /** Number of payments to clear the loan (the last one trimmed). */
  payments: number;
  years: number;
  totalInterest: number;
  /** Interest and years saved against paying monthly. */
  interestSaved: number;
  yearsSaved: number;
}

/**
 * Repays `principal` at the payment a lender sets for frequency `f` (derived
 * from the monthly payment over `months`), charging interest each period at
 * the rate equivalent to `ratePct` compounded `compoundingPerYear` times a
 * year. Lenders that accrue interest daily give slightly different cents.
 */
export function paymentFrequencyPlan(principal: number, ratePct: number, months: number, compoundingPerYear: number, f: PaymentFrequency): FrequencyPlan | null {
  if (!finite(principal, ratePct, months, compoundingPerYear) || principal <= 0 || months < 1 || ratePct < 0 || compoundingPerYear <= 0) return null;
  const j = monthlyEquivalentRatePct(ratePct, compoundingPerYear);
  const monthly = monthlyPayment(principal, j, months);
  const base = amortize(principal, j, months);
  const perYear = FREQUENCY_PER_YEAR[f];
  const payment = frequencyPayment(monthly, f);
  const i = periodicRate(ratePct, compoundingPerYear, perYear);
  let bal = principal;
  let interest = 0;
  let n = 0;
  const cap = perYear * 100;
  while (bal > EPS && n < cap) {
    const int = bal * i;
    if (payment <= int) return null;
    interest += int;
    bal = bal + int - Math.min(payment, bal + int);
    n++;
  }
  return {
    frequency: f,
    paymentsPerYear: perYear,
    payment,
    payments: n,
    years: n / perYear,
    totalInterest: interest,
    interestSaved: base.totalInterest - interest,
    yearsSaved: base.months / 12 - n / perYear,
  };
}

/**
 * How the lender credits a payment smaller than the monthly payment.
 * - 'arrival': each part-payment reduces the balance when it arrives and
 *   interest is charged every period (paymentFrequencyPlan; the Canadian
 *   model FCAC describes).
 * - 'held': the US rule, Regulation Z 12 CFR 1026.36(c)(1)(ii): a payment
 *   less than a periodic payment may be held in suspense, and once suspense
 *   holds enough for a periodic payment it must be treated as one
 *   (paragraph (B)). The spare payment an accelerated plan builds up is
 *   therefore credited as the next periodic payment: the loan is paid ahead,
 *   no interest is saved, and the last payment is covered earlier only by
 *   the calendar.
 * - 'held-principal': held the same way, but the spare is applied to
 *   principal, which takes a principal-only instruction from the borrower or
 *   a servicer program (Fannie Mae Servicing Guide C-1.2-01 has servicers
 *   apply borrower-identified additional principal). The best case.
 * Share links: `cr` keeps 'arrival'; 'held' changed meaning from "spare to
 * principal" (batch wk20261123-tool1, first version) to the rule's default
 * on review, and that model moved to 'held-principal'.
 */
export type Crediting = 'arrival' | 'held' | 'held-principal';
export const CREDITING_VALUES: Crediting[] = ['held', 'held-principal', 'arrival'];
/** Frequencies whose part-payments do not line up with the monthly due date, so crediting changes the answer. */
export const PART_PAYMENT_FREQUENCIES: PaymentFrequency[] = ['biweekly', 'accelerated-biweekly', 'weekly', 'accelerated-weekly'];
/** Days between part-payments. */
export const PART_PAYMENT_DAYS: Partial<Record<PaymentFrequency, number>> = { biweekly: 14, 'accelerated-biweekly': 14, weekly: 7, 'accelerated-weekly': 7 };
/** Average days from the start of the loan to monthly payment m is m × DAYS_PER_YEAR / 12. */
export const DAYS_PER_YEAR = 365;

export interface HeldFrequencyPlan extends FrequencyPlan {
  crediting: 'held' | 'held-principal';
  /** Day of the loan (day 0 = start of the first payment period) the first part-payment arrives. */
  firstPartDay: number;
  /** Monthly payments credited, the last one trimmed (the full term when spares are credited as next payments). */
  months: number;
  /** Calendar month (day × 12 / 365, rounded up) by which the part-payments have covered the last payment. Equals `months` for 'held-principal'. */
  calendarMonths: number;
  /** Part-payments sent until the last payment is covered. */
  lastPart: number;
  /** Day of the loan that last part-payment arrives. */
  lastPartDay: number;
  /** Spare full payments applied to principal ('held-principal'; 0 for 'held'). */
  extraPayments: number;
  /** Payment number the first spare payment goes to principal with (0 when none). */
  firstExtraMonth: number;
  /** Monthly payments already covered ahead of their due date when the last one is covered ('held'; 0 for 'held-principal'). */
  paidAheadMonths: number;
  /** Due dates up to payoff when the part-payments received so far were less than the payments due (a plain plan runs behind early in each year). */
  shortMonths: number;
  /** The monthly schedule: with the spare payments as extra principal ('held-principal'), or the plain schedule ('held'). */
  schedule: Amortization;
}

/**
 * US crediting of a biweekly or weekly plan (12 CFR 1026.36(c)(1)(ii)).
 * Assumptions, stated on the page:
 * - the loan stays a monthly loan: interest is charged monthly at the rate
 *   compounded monthly that matches `ratePct` (amortize), and monthly
 *   payment m falls due on day m × 365 / 12;
 * - part-payments of frequencyPayment(monthly, f) arrive every 14 days
 *   (7 for weekly), the first on day `firstPartDay` (default one interval in:
 *   day 14, or day 7 for weekly, so the first two half-payments or four
 *   quarter-payments land before payment 1 is due);
 * - each due payment is credited from suspense on its due date;
 * - spare: `spare` 'next-payment' (crediting 'held', the rule's default)
 *   credits a full payment built up in suspense as the next periodic payment,
 *   so interest follows the plain schedule and the plan only covers the last
 *   payment sooner by the calendar; 'principal' (crediting 'held-principal')
 *   applies it to principal the same month.
 * A due date the part-payments have not yet covered (a plain plan early in a
 * year) is treated as paid on time for the interest and counted in
 * shortMonths; a servicer may treat that payment as late.
 * Returns null for monthly and semi-monthly, which credit the same as monthly.
 */
export function usHeldFrequencyPlan(
  principal: number, ratePct: number, months: number, compoundingPerYear: number, f: PaymentFrequency,
  opts: { firstPartDay?: number; spare?: 'next-payment' | 'principal' } = {},
): HeldFrequencyPlan | null {
  const step = PART_PAYMENT_DAYS[f];
  if (!step) return null;
  if (!finite(principal, ratePct, months, compoundingPerYear) || principal <= 0 || months < 1 || ratePct < 0 || compoundingPerYear <= 0) return null;
  const firstPartDay = opts.firstPartDay ?? step;
  if (!Number.isFinite(firstPartDay) || firstPartDay < 0) return null;
  const toPrincipal = opts.spare === 'principal';
  const j = monthlyEquivalentRatePct(ratePct, compoundingPerYear);
  const base = amortize(principal, j, months);
  const monthly = base.payment;
  const part = frequencyPayment(monthly, f);
  const perYear = FREQUENCY_PER_YEAR[f];
  const oneTime: { month: number; amount: number }[] = [];
  const short: number[] = [];
  let susp = 0;
  let k = 0;
  for (let m = 1; m <= months; m++) {
    while (firstPartDay + step * k <= (m * DAYS_PER_YEAR) / 12 + EPS) { susp += part; k++; }
    susp -= monthly;
    if (susp < -1e-6) short.push(m);
    // 'next-payment' keeps the spare in the running balance: it pays the next due payment.
    if (toPrincipal && susp >= monthly - 1e-6) { oneTime.push({ month: m, amount: monthly }); susp -= monthly; }
  }
  const schedule = toPrincipal ? amortize(principal, j, months, { oneTime }) : base;
  const n = schedule.months;
  // Spares actually applied (an extra after payoff, or one the balance had no room for, does not count).
  const extras = toPrincipal ? schedule.rows.filter((r) => r.extra > 1e-9) : [];
  // Part-payments needed to cover everything owed on the schedule, and when the last one arrives.
  const lastPart = Math.max(1, Math.ceil(schedule.totalPaid / part - 1e-9));
  const lastPartDay = firstPartDay + step * (lastPart - 1);
  const calendarMonths = toPrincipal ? n : Math.max(1, Math.ceil((lastPartDay * 12) / DAYS_PER_YEAR - 1e-9));
  return {
    frequency: f,
    crediting: toPrincipal ? 'held-principal' : 'held',
    paymentsPerYear: perYear,
    payment: part,
    payments: lastPart,
    years: calendarMonths / 12,
    totalInterest: schedule.totalInterest,
    interestSaved: base.totalInterest - schedule.totalInterest,
    yearsSaved: (base.months - calendarMonths) / 12,
    firstPartDay,
    months: n,
    calendarMonths,
    lastPart,
    lastPartDay,
    extraPayments: extras.length,
    firstExtraMonth: extras[0]?.month ?? 0,
    paidAheadMonths: toPrincipal ? 0 : Math.max(0, n - calendarMonths),
    shortMonths: short.filter((m) => m <= n).length,
    schedule,
  };
}

/** The plan for frequency `f` under `crediting`: held (US) for part-payment frequencies, otherwise credited on arrival. */
export function frequencyPlanFor(
  principal: number, ratePct: number, months: number, compoundingPerYear: number, f: PaymentFrequency, crediting: Crediting,
): FrequencyPlan | HeldFrequencyPlan | null {
  if (crediting !== 'arrival' && PART_PAYMENT_FREQUENCIES.includes(f)) {
    return usHeldFrequencyPlan(principal, ratePct, months, compoundingPerYear, f, { spare: crediting === 'held-principal' ? 'principal' : 'next-payment' });
  }
  return paymentFrequencyPlan(principal, ratePct, months, compoundingPerYear, f);
}

export const isHeldPlan = (p: FrequencyPlan | HeldFrequencyPlan | null): p is HeldFrequencyPlan => !!p && 'firstPartDay' in p;

// ---------------------------------------------------------------------------
// Generic amortization with extra payments
// ---------------------------------------------------------------------------

export interface ExtraPayments {
  /** Added to every monthly payment. */
  monthly?: number;
  /** Added to every 12th payment (payments 12, 24, 36 ...). */
  yearly?: number;
  /** One-off lump sums keyed by payment number (1-based). */
  oneTime?: { month: number; amount: number }[];
}

export interface AmortRow {
  month: number;
  /** Scheduled payment actually made this month (interest + principal, excluding extras). */
  payment: number;
  interest: number;
  /** Principal from the scheduled payment. */
  principal: number;
  /** Extra principal paid this month. */
  extra: number;
  balance: number;
}

export interface Amortization {
  payment: number;
  rows: AmortRow[];
  totalInterest: number;
  totalPaid: number;
  months: number;
}

/**
 * Amortizes `principal` with a level payment (computed from `months` unless
 * `payment` is given) plus optional extra principal. The final payment is
 * trimmed so the balance lands exactly on zero. `maxMonths` guards loops
 * whose payment never covers the interest.
 */
export function amortize(
  principal: number,
  annualRatePct: number,
  months: number,
  extras: ExtraPayments = {},
  opts: { payment?: number; maxMonths?: number } = {},
): Amortization {
  const r = annualRatePct / 1200;
  const payment = opts.payment ?? monthlyPayment(principal, annualRatePct, months);
  const maxMonths = opts.maxMonths ?? Math.max(months, 1) * 4 + 1200;
  const rows: AmortRow[] = [];
  let balance = principal;
  let totalInterest = 0;
  let totalPaid = 0;
  const oneTime = new Map<number, number>();
  for (const o of extras.oneTime ?? []) {
    if (o.amount > 0 && o.month >= 1) oneTime.set(Math.round(o.month), (oneTime.get(Math.round(o.month)) ?? 0) + o.amount);
  }
  for (let m = 1; balance > EPS && m <= maxMonths; m++) {
    const interest = balance * r;
    let sched = Math.min(payment, balance + interest);
    let principalPart = sched - interest;
    if (principalPart < 0) principalPart = 0; // payment below interest: unpaid interest is not modelled as negative amortization
    if (sched < interest) sched = interest; // interest is always paid
    let extra = (extras.monthly ?? 0) + (m % 12 === 0 ? extras.yearly ?? 0 : 0) + (oneTime.get(m) ?? 0);
    const remaining = balance - principalPart;
    extra = Math.max(0, Math.min(extra, remaining));
    balance = remaining - extra;
    if (balance < EPS) balance = 0;
    totalInterest += interest;
    totalPaid += sched + extra;
    rows.push({ month: m, payment: sched, interest, principal: principalPart, extra, balance });
    if (payment <= interest && extra <= 0 && m > 1) {
      // Payment never reduces the balance; stop rather than loop to maxMonths.
      break;
    }
  }
  return { payment, rows, totalInterest, totalPaid, months: rows.length };
}

export interface YearRow {
  year: number;
  interest: number;
  principal: number;
  /** Total of all payments in the year including extras and escrow items when supplied. */
  paid: number;
  balance: number;
}

/** Groups monthly rows into 12-month loan years. `extraCost` adds non-loan costs (tax, PMI ...) per row. */
export function yearlySummary(rows: AmortRow[], extraCost: (row: AmortRow) => number = () => 0): YearRow[] {
  const out: YearRow[] = [];
  rows.forEach((row) => {
    const y = Math.ceil(row.month / 12);
    let cur = out[y - 1];
    if (!cur) {
      cur = { year: y, interest: 0, principal: 0, paid: 0, balance: row.balance };
      out[y - 1] = cur;
    }
    cur.interest += row.interest;
    cur.principal += row.principal + row.extra;
    cur.paid += row.payment + row.extra + extraCost(row);
    cur.balance = row.balance;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Mortgage
// ---------------------------------------------------------------------------

export interface MortgageInput {
  homePrice: number;
  downPayment: number;
  ratePct: number;
  termYears: number;
  /** Annual property tax in money. */
  propertyTaxYearly: number;
  /** Annual homeowners insurance in money. */
  insuranceYearly: number;
  /** Annual PMI as a percent of the original loan amount (only charged while LTV > 78%). */
  pmiRatePct: number;
  hoaMonthly: number;
  extraMonthly?: number;
  extraYearly?: number;
  oneTimeAmount?: number;
  oneTimeMonth?: number;
  /** Times a year the quoted rate compounds: 12 (default, US) or 2 (Canadian fixed rates). */
  compoundingPerYear?: number;
  /**
   * Mortgage insurance: 'pmi' (default, US monthly PMI), 'cmhc' (Canadian
   * one-off premium from the CMHC table, added to the loan when the down
   * payment is under 20%) or 'none' (UK and others: no borrower-paid insurance).
   */
  insurance?: 'pmi' | 'cmhc' | 'none';
}

export interface MortgageResult {
  /** What you borrow, including any CMHC premium added to the loan. */
  loanAmount: number;
  /** Price minus down payment, before any premium. */
  baseLoanAmount: number;
  /** CMHC premium added to the loan (0 when none). */
  insurancePremium: number;
  insurancePremiumPct: number;
  /** Rate compounded monthly that the schedule uses (equals the quoted rate when it compounds monthly). */
  monthlyEquivalentRatePct: number;
  ltvPct: number;
  principalAndInterest: number;
  monthlyTax: number;
  monthlyInsurance: number;
  monthlyPmi: number;
  monthlyHoa: number;
  /** First month's total housing payment (P&I + tax + insurance + PMI + HOA), excluding extras. */
  monthlyTotal: number;
  schedule: Amortization;
  /** Same loan without extra payments, for comparison. */
  baseline: Amortization;
  /** Last month PMI is charged (0 when no PMI). PMI stops once the balance reaches 78% of the home's original value. */
  pmiLastMonth: number;
  /** First payment after which the balance is at or below 80% of value: when you may ask the servicer to cancel PMI. */
  pmiRequestMonth: number;
  /** Month the original schedule (no extras) first reaches 78%: the Homeowners Protection Act automatic termination date. */
  pmiScheduledAutoMonth: number;
  totalPmi: number;
  totalInterest: number;
  interestSaved: number;
  monthsSaved: number;
  /** Everything paid over the life of the loan: P&I, extras, tax, insurance, PMI, HOA (down payment excluded). */
  totalOfPayments: number;
}

export function firstMonthAtOrBelow(rows: AmortRow[], threshold: number): number {
  const row = rows.find((r) => r.balance <= threshold + EPS);
  return row ? row.month : 0;
}

export function calculateMortgage(input: MortgageInput): MortgageResult | null {
  const { homePrice, downPayment, ratePct, termYears } = input;
  if (!finite(homePrice, downPayment, ratePct, termYears)) return null;
  if (homePrice <= 0 || downPayment < 0 || ratePct < 0 || termYears <= 0) return null;
  const baseLoanAmount = homePrice - downPayment;
  if (baseLoanAmount <= 0) return null;
  const months = Math.round(termYears * 12);
  if (months < 1) return null;
  const insurance = input.insurance ?? 'pmi';
  const ltvPct = (baseLoanAmount / homePrice) * 100;
  let insurancePremiumPct = 0;
  if (insurance === 'cmhc' && baseLoanAmount > homePrice * 0.8 + EPS) {
    insurancePremiumPct = cmhcPremiumRatePct(ltvPct, termYears);
    if (!Number.isFinite(insurancePremiumPct)) return null;
  }
  const insurancePremium = (baseLoanAmount * insurancePremiumPct) / 100;
  const loanAmount = baseLoanAmount + insurancePremium;
  const rate = monthlyEquivalentRatePct(ratePct, input.compoundingPerYear ?? 12);
  const extras: ExtraPayments = {
    monthly: Math.max(0, input.extraMonthly ?? 0),
    yearly: Math.max(0, input.extraYearly ?? 0),
    oneTime: input.oneTimeAmount && input.oneTimeAmount > 0 ? [{ month: input.oneTimeMonth ?? 1, amount: input.oneTimeAmount }] : [],
  };
  const schedule = amortize(loanAmount, rate, months, extras);
  const baseline = amortize(loanAmount, rate, months);
  const monthlyTax = Math.max(0, input.propertyTaxYearly) / 12;
  const monthlyInsurance = Math.max(0, input.insuranceYearly) / 12;
  const monthlyHoa = Math.max(0, input.hoaMonthly);
  const pmiApplies = insurance === 'pmi' && input.pmiRatePct > 0 && loanAmount > homePrice * 0.8 + EPS;
  const monthlyPmi = pmiApplies ? (loanAmount * input.pmiRatePct) / 100 / 12 : 0;
  const threshold78 = homePrice * 0.78;
  let pmiLastMonth = 0;
  let pmiRequestMonth = 0;
  let pmiScheduledAutoMonth = 0;
  if (pmiApplies) {
    // PMI is charged on a payment while the balance going into it is above 78%.
    const drop = firstMonthAtOrBelow(schedule.rows, threshold78);
    pmiLastMonth = drop || schedule.months;
    pmiRequestMonth = firstMonthAtOrBelow(schedule.rows, homePrice * 0.8);
    pmiScheduledAutoMonth = firstMonthAtOrBelow(baseline.rows, threshold78);
  }
  const totalPmi = monthlyPmi * pmiLastMonth;
  const n = schedule.months;
  const totalOfPayments = schedule.totalPaid + n * (monthlyTax + monthlyInsurance + monthlyHoa) + totalPmi;
  return {
    loanAmount,
    baseLoanAmount,
    insurancePremium,
    insurancePremiumPct,
    monthlyEquivalentRatePct: rate,
    ltvPct,
    principalAndInterest: schedule.payment,
    monthlyTax,
    monthlyInsurance,
    monthlyPmi,
    monthlyHoa,
    monthlyTotal: schedule.payment + monthlyTax + monthlyInsurance + monthlyPmi + monthlyHoa,
    schedule,
    baseline,
    pmiLastMonth,
    pmiRequestMonth,
    pmiScheduledAutoMonth,
    totalPmi,
    totalInterest: schedule.totalInterest,
    interestSaved: Math.max(0, baseline.totalInterest - schedule.totalInterest),
    monthsSaved: Math.max(0, baseline.months - schedule.months),
    totalOfPayments,
  };
}

// ---------------------------------------------------------------------------
// House affordability
// ---------------------------------------------------------------------------

export interface AffordabilityInput {
  annualIncome: number;
  monthlyDebts: number;
  downPayment: number;
  ratePct: number;
  termYears: number;
  /** Property tax as a percent of home value per year. */
  propertyTaxRatePct: number;
  insuranceYearly: number;
  hoaMonthly: number;
  /** Annual PMI percent of the loan when the down payment is under 20%. */
  pmiRatePct: number;
  /** Front-end (housing) limit in percent; 0 or less means no front-end limit. */
  frontEndPct: number;
  /** Back-end (total debt) limit in percent. 0 means no limit, allowed only with a loan-to-income cap. */
  backEndPct: number;
  /** Times a year the rate compounds (12 default; 2 for Canadian fixed rates). */
  compoundingPerYear?: number;
  /** Rate the ratios are tested at (a stress test), when it differs from the contract rate. */
  qualifyingRatePct?: number;
  /** Monthly heating cost counted in the housing payment (Canada's GDS includes heat). */
  heatingMonthly?: number;
  /** Share of the HOA or condo fee counted, percent (default 100; CMHC counts 50%). */
  hoaSharePct?: number;
  /** 'pmi' (default), 'cmhc' (premium added to the loan) or 'none'. */
  insurance?: 'pmi' | 'cmhc' | 'none';
  /** Maximum loan as a multiple of gross annual income (UK lenders' income multiple). 0 or undefined = none. */
  maxLoanToIncome?: number;
  /** Apply Canada's minimum down payment rule to the price. */
  canadaMinimumDown?: boolean;
  /**
   * Maximum loan-to-value in percent (Ireland: 90, so a 10% minimum deposit,
   * Central Bank mortgage measures). Caps the price at deposit / (1 - LTV).
   * 0, 100 or undefined = no cap. Reported as the 'minimum-down-payment' binding.
   */
  maxLtvPct?: number;
}

export interface AffordabilityResult {
  maxPrice: number;
  loanAmount: number;
  /** Housing budget the binding rule allows. */
  maxHousingPayment: number;
  frontEndBudget: number;
  backEndBudget: number;
  binding: 'front-end' | 'back-end' | 'down-payment-only' | 'income-multiple' | 'minimum-down-payment';
  /** Principal and interest at the qualifying rate (the contract rate unless a stress rate is set). */
  principalAndInterest: number;
  /** Principal and interest at the contract rate, what you would actually pay. */
  contractPayment: number;
  qualifyingRatePct: number;
  insurancePremium: number;
  monthlyHeating: number;
  /** Loan ÷ gross annual income. */
  loanToIncome: number;
  monthlyTax: number;
  monthlyInsurance: number;
  monthlyPmi: number;
  monthlyHoa: number;
  housingPayment: number;
  frontEndRatio: number;
  backEndRatio: number;
  downPaymentPct: number;
}

/** Monthly housing cost (PITI + PMI + HOA) for a given price. */
export function housingCostForPrice(
  price: number,
  i: Pick<AffordabilityInput, 'downPayment' | 'ratePct' | 'termYears' | 'propertyTaxRatePct' | 'insuranceYearly' | 'hoaMonthly' | 'pmiRatePct'
    | 'compoundingPerYear' | 'qualifyingRatePct' | 'heatingMonthly' | 'hoaSharePct' | 'insurance'>,
) {
  const base = Math.max(0, price - i.downPayment);
  const insurance = i.insurance ?? 'pmi';
  const premiumPct = insurance === 'cmhc' && base > price * 0.8 + EPS ? cmhcPremiumRatePct((base / price) * 100, i.termYears) : 0;
  const premium = Number.isFinite(premiumPct) ? (base * premiumPct) / 100 : Infinity;
  const loan = base + premium;
  const months = Math.round(i.termYears * 12);
  const k = i.compoundingPerYear ?? 12;
  const pi = monthlyPayment(loan, monthlyEquivalentRatePct(i.qualifyingRatePct ?? i.ratePct, k), months);
  const contractPi = monthlyPayment(loan, monthlyEquivalentRatePct(i.ratePct, k), months);
  const tax = (price * i.propertyTaxRatePct) / 100 / 12;
  const ins = i.insuranceYearly / 12;
  const pmi = insurance === 'pmi' && loan > price * 0.8 + EPS ? (loan * i.pmiRatePct) / 100 / 12 : 0;
  const hoa = (i.hoaMonthly * (i.hoaSharePct ?? 100)) / 100;
  const heat = Math.max(0, i.heatingMonthly ?? 0);
  return { loan, premium, pi, contractPi, tax, ins, pmi, hoa, heat, total: pi + tax + ins + pmi + hoa + heat };
}

export function calculateAffordability(i: AffordabilityInput): AffordabilityResult | null {
  if (!finite(i.annualIncome, i.monthlyDebts, i.downPayment, i.ratePct, i.termYears, i.propertyTaxRatePct, i.insuranceYearly, i.hoaMonthly, i.pmiRatePct, i.frontEndPct, i.backEndPct)) return null;
  const lti = i.maxLoanToIncome && i.maxLoanToIncome > 0 ? i.maxLoanToIncome : 0;
  if (i.annualIncome <= 0 || i.termYears <= 0 || i.ratePct < 0 || i.monthlyDebts < 0 || i.downPayment < 0 || i.backEndPct < 0 || (i.backEndPct === 0 && !lti)) return null;
  if (i.qualifyingRatePct !== undefined && !(Number.isFinite(i.qualifyingRatePct) && i.qualifyingRatePct >= 0)) return null;
  const income = i.annualIncome / 12;
  const frontEndBudget = i.frontEndPct > 0 ? (income * i.frontEndPct) / 100 : Infinity;
  const backEndBudget = i.backEndPct > 0 ? (income * i.backEndPct) / 100 - i.monthlyDebts : Infinity;
  const budget = Math.min(frontEndBudget, backEndBudget);
  // Price ceilings that do not depend on the payment: the income multiple and Canada's minimum down payment.
  const ltiCeiling = lti ? i.downPayment + lti * i.annualIncome : Infinity;
  const ltvCap = i.maxLtvPct && i.maxLtvPct > 0 && i.maxLtvPct < 100 ? i.maxLtvPct : 0;
  if (i.maxLtvPct !== undefined && !(Number.isFinite(i.maxLtvPct) && i.maxLtvPct >= 0 && i.maxLtvPct <= 100)) return null;
  const downCeiling = Math.min(
    i.canadaMinimumDown ? canadaMaxPriceForDown(i.downPayment) : Infinity,
    ltvCap ? i.downPayment / (1 - ltvCap / 100) : Infinity,
  );
  // Cost is non-decreasing in price, so bisection finds the largest affordable price.
  let lo = i.downPayment;
  const fixedCost = housingCostForPrice(lo, i).total;
  let binding: AffordabilityResult['binding'] = frontEndBudget <= backEndBudget ? msg('front-end') : 'back-end';
  let maxPrice: number;
  if (budget <= 0 || fixedCost > budget) {
    maxPrice = i.downPayment;
    binding = 'down-payment-only';
  } else if (budget === Infinity) {
    maxPrice = Math.min(ltiCeiling, downCeiling);
    binding = ltiCeiling <= downCeiling ? 'income-multiple' : 'minimum-down-payment';
  } else {
    let hi = Math.max(lo * 2, 1000);
    while (housingCostForPrice(hi, i).total <= budget && hi < 1e12) hi *= 2;
    for (let k = 0; k < 200; k++) {
      const mid = (lo + hi) / 2;
      if (housingCostForPrice(mid, i).total <= budget) lo = mid;
      else hi = mid;
    }
    maxPrice = lo;
    if (ltiCeiling < maxPrice) {
      maxPrice = ltiCeiling;
      binding = 'income-multiple';
    }
    if (downCeiling < maxPrice) {
      maxPrice = downCeiling;
      binding = 'minimum-down-payment';
    }
  }
  const c = housingCostForPrice(maxPrice, i);
  return {
    maxPrice,
    loanAmount: c.loan,
    maxHousingPayment: Math.max(0, budget === Infinity ? c.total : budget),
    frontEndBudget,
    backEndBudget,
    binding,
    principalAndInterest: c.pi,
    contractPayment: c.contractPi,
    qualifyingRatePct: i.qualifyingRatePct ?? i.ratePct,
    insurancePremium: c.premium,
    monthlyHeating: c.heat,
    loanToIncome: c.loan / i.annualIncome,
    monthlyTax: c.tax,
    monthlyInsurance: c.ins,
    monthlyPmi: c.pmi,
    monthlyHoa: c.hoa,
    housingPayment: c.total,
    frontEndRatio: (c.total / income) * 100,
    backEndRatio: ((c.total + i.monthlyDebts) / income) * 100,
    downPaymentPct: maxPrice > 0 ? (i.downPayment / maxPrice) * 100 : 0,
  };
}

// ---------------------------------------------------------------------------
// Refinance
// ---------------------------------------------------------------------------

export interface RefinanceInput {
  currentBalance: number;
  currentRatePct: number;
  remainingMonths: number;
  newRatePct: number;
  newTermMonths: number;
  /** Lender and third-party fees. */
  closingCosts: number;
  /** Discount points as a percent of the new base loan (balance + cash out). */
  pointsPct: number;
  rollCostsIntoLoan: boolean;
  cashOut: number;
  /** Times a year both quoted rates compound (12 default; 2 for Canadian fixed rates). */
  compoundingPerYear?: number;
}

export interface RefinanceResult {
  currentPayment: number;
  newLoanAmount: number;
  newPayment: number;
  monthlySavings: number;
  totalCosts: number;
  upfrontCash: number;
  /** Costs ÷ monthly savings, rounded up. 0 when savings are not positive. */
  simpleBreakEvenMonth: number;
  /** First month where payment savings plus the gap in loan balances repay the costs. 0 if never within the new term. */
  breakEvenMonth: number;
  currentRemainingInterest: number;
  newTotalInterest: number;
  /** Positive when the refinance pays less interest over its life. */
  interestDifference: number;
  currentTotalPayments: number;
  newTotalPayments: number;
  /** Net benefit per month: cumulative, for charting. */
  netByMonth: { month: number; net: number; currentBalance: number; newBalance: number }[];
}

export function calculateRefinance(i: RefinanceInput): RefinanceResult | null {
  if (!finite(i.currentBalance, i.currentRatePct, i.remainingMonths, i.newRatePct, i.newTermMonths, i.closingCosts, i.pointsPct, i.cashOut)) return null;
  if (i.currentBalance <= 0 || i.remainingMonths <= 0 || i.newTermMonths <= 0 || i.currentRatePct < 0 || i.newRatePct < 0) return null;
  if (i.closingCosts < 0 || i.pointsPct < 0 || i.cashOut < 0) return null;
  const remaining = Math.round(i.remainingMonths);
  const newTerm = Math.round(i.newTermMonths);
  if (remaining < 1 || newTerm < 1) return null;
  const base = i.currentBalance + i.cashOut;
  const totalCosts = i.closingCosts + (base * i.pointsPct) / 100;
  const newLoanAmount = base + (i.rollCostsIntoLoan ? totalCosts : 0);
  const upfrontCash = i.rollCostsIntoLoan ? 0 : totalCosts;
  const k = i.compoundingPerYear ?? 12;
  const cur = amortize(i.currentBalance, monthlyEquivalentRatePct(i.currentRatePct, k), remaining);
  const nw = amortize(newLoanAmount, monthlyEquivalentRatePct(i.newRatePct, k), newTerm);
  const monthlySavings = cur.payment - nw.payment;
  const simpleBreakEvenMonth = monthlySavings > 0 ? Math.ceil(totalCosts / monthlySavings - 1e-9) : 0;
  const horizon = Math.max(cur.months, nw.months);
  let net = i.cashOut - upfrontCash;
  let breakEvenMonth = 0;
  const netByMonth: RefinanceResult['netByMonth'] = [];
  for (let m = 1; m <= horizon; m++) {
    const oldPay = cur.rows[m - 1]?.payment ?? 0;
    const newPay = nw.rows[m - 1]?.payment ?? 0;
    net += oldPay - newPay;
    const ob = cur.rows[m - 1]?.balance ?? 0;
    const nb = nw.rows[m - 1]?.balance ?? 0;
    const position = net + ob - nb;
    netByMonth.push({ month: m, net: position, currentBalance: ob, newBalance: nb });
    if (!breakEvenMonth && position >= -1e-6) breakEvenMonth = m;
  }
  return {
    currentPayment: cur.payment,
    newLoanAmount,
    newPayment: nw.payment,
    monthlySavings,
    totalCosts,
    upfrontCash,
    simpleBreakEvenMonth,
    breakEvenMonth,
    currentRemainingInterest: cur.totalInterest,
    newTotalInterest: nw.totalInterest,
    interestDifference: cur.totalInterest - nw.totalInterest,
    currentTotalPayments: cur.totalPaid,
    newTotalPayments: nw.totalPaid + upfrontCash,
    netByMonth,
  };
}

// ---------------------------------------------------------------------------
// Auto loan
// ---------------------------------------------------------------------------

export interface AutoLoanInput {
  price: number;
  downPayment: number;
  tradeInValue: number;
  tradeInOwed: number;
  salesTaxPct: number;
  /** Most US states tax only the price minus the trade-in value. */
  taxAfterTradeIn: boolean;
  fees: number;
  /** Roll sales tax and fees into the loan rather than paying them up front. */
  financeTaxAndFees: boolean;
  ratePct: number;
  termMonths: number;
  /**
   * Final lump sum left owing after the last monthly payment: the balloon on
   * an Australian car loan or the optional final payment (guaranteed minimum
   * future value) on a UK personal contract purchase. 0 or omitted is a
   * normal fully amortizing loan, the US behaviour.
   */
  balloon?: number;
  /**
   * How the quoted rate compounds. 12 (default) is a nominal APR charged at
   * rate / 12 a month (US Regulation Z, Canada, Australia, India). 1 reads the
   * rate as a UK APR, an annual effective rate (FCA CONC App 1.1), so the
   * monthly rate is (1 + APR)^(1/12) - 1.
   */
  compoundingPerYear?: number;
}

export interface AutoLoanResult {
  salesTax: number;
  tradeEquity: number;
  loanAmount: number;
  payment: number;
  totalInterest: number;
  totalOfPayments: number;
  upfront: number;
  /** Price + sales tax + fees + loan interest (negative trade-in equity is old debt, shown separately). */
  totalCost: number;
  schedule: Amortization;
  /** Balloon or optional final payment due with or after the last monthly payment (0 when none). */
  balloon: number;
}

/**
 * Level monthly payment on `principal` over `months` that leaves `balloon`
 * owing at the end: M = (P - B / (1 + r)^n) × r / (1 - (1 + r)^-n).
 * With no balloon it equals monthlyPayment.
 */
export function balloonPayment(principal: number, annualRatePct: number, months: number, balloon = 0): number {
  if (!(balloon > 0)) return monthlyPayment(principal, annualRatePct, months);
  if (!finite(principal, annualRatePct, months) || months <= 0 || principal <= 0) return 0;
  const r = annualRatePct / 1200;
  if (r === 0) return (principal - balloon) / months;
  const v = Math.exp(-months * Math.log1p(r));
  return ((principal - balloon * v) * r) / -Math.expm1(-months * Math.log1p(r));
}

export function calculateAutoLoan(i: AutoLoanInput): AutoLoanResult | null {
  if (!finite(i.price, i.downPayment, i.tradeInValue, i.tradeInOwed, i.salesTaxPct, i.fees, i.ratePct, i.termMonths)) return null;
  if (i.price <= 0 || !(Math.round(i.termMonths) >= 1) || i.ratePct < 0 || i.downPayment < 0 || i.tradeInValue < 0 || i.tradeInOwed < 0 || i.salesTaxPct < 0 || i.fees < 0) return null;
  const balloon = i.balloon ?? 0;
  if (!Number.isFinite(balloon) || balloon < 0) return null;
  const taxable = Math.max(0, i.price - (i.taxAfterTradeIn ? i.tradeInValue : 0));
  const salesTax = (taxable * i.salesTaxPct) / 100;
  const tradeEquity = i.tradeInValue - i.tradeInOwed; // negative equity is rolled into the loan
  const financedExtras = i.financeTaxAndFees ? salesTax + i.fees : 0;
  const loanAmount = i.price - i.downPayment - tradeEquity + financedExtras;
  const upfront = i.downPayment + (i.financeTaxAndFees ? 0 : salesTax + i.fees);
  if (loanAmount <= 0) {
    const empty = { payment: 0, rows: [], totalInterest: 0, totalPaid: 0, months: 0 };
    return { salesTax, tradeEquity, loanAmount: 0, payment: 0, totalInterest: 0, totalOfPayments: 0, upfront, totalCost: i.price + salesTax + i.fees, schedule: empty, balloon: 0 };
  }
  const n = Math.round(i.termMonths);
  const rate = monthlyEquivalentRatePct(i.ratePct, i.compoundingPerYear ?? 12);
  if (balloon > 0) {
    // The balloon must be less than the amount financed, or the payment would not cover the interest.
    if (balloon >= loanAmount) return null;
    const payment = balloonPayment(loanAmount, rate, n, balloon);
    const schedule = amortize(loanAmount, rate, n, {}, { payment, maxMonths: n });
    return {
      salesTax,
      tradeEquity,
      loanAmount,
      payment,
      totalInterest: schedule.totalInterest,
      totalOfPayments: schedule.totalPaid + balloon,
      upfront,
      totalCost: i.price + salesTax + i.fees + schedule.totalInterest,
      schedule,
      balloon,
    };
  }
  const schedule = amortize(loanAmount, rate, n);
  return {
    salesTax,
    tradeEquity,
    loanAmount,
    payment: schedule.payment,
    totalInterest: schedule.totalInterest,
    totalOfPayments: schedule.totalPaid,
    upfront,
    totalCost: i.price + salesTax + i.fees + schedule.totalInterest,
    schedule,
    balloon: 0,
  };
}

// ---------------------------------------------------------------------------
// Auto lease
// ---------------------------------------------------------------------------

export interface LeaseInput {
  msrp: number;
  negotiatedPrice: number;
  /** Cash down, trade-in equity and rebates: anything that lowers the capitalized cost. */
  capCostReduction: number;
  acquisitionFee: number;
  /** Other fees rolled into the capitalized cost (doc fee etc.). */
  otherCapitalizedFees: number;
  residualPct: number;
  moneyFactor: number;
  termMonths: number;
  /** Sales tax applied to each monthly payment (most US states). */
  salesTaxPct: number;
}

export interface LeaseResult {
  grossCapCost: number;
  adjustedCapCost: number;
  residualValue: number;
  depreciation: number;
  rentCharge: number;
  basePayment: number;
  tax: number;
  payment: number;
  aprEquivalent: number;
  totalDepreciation: number;
  totalRentCharge: number;
  totalOfPayments: number;
  /** Payments plus cap cost reduction: what the lease costs you over the term. */
  totalLeaseCost: number;
}

export const moneyFactorToApr = (mf: number) => mf * 2400;
export const aprToMoneyFactor = (aprPct: number) => aprPct / 2400;

export function calculateLease(i: LeaseInput): LeaseResult | null {
  if (!finite(i.msrp, i.negotiatedPrice, i.capCostReduction, i.acquisitionFee, i.otherCapitalizedFees, i.residualPct, i.moneyFactor, i.termMonths, i.salesTaxPct)) return null;
  if (i.msrp <= 0 || i.negotiatedPrice <= 0 || i.termMonths <= 0 || i.residualPct < 0 || i.residualPct > 100 || i.moneyFactor < 0 || i.salesTaxPct < 0 || i.capCostReduction < 0) return null;
  const n = Math.round(i.termMonths);
  if (n < 1) return null;
  const grossCapCost = i.negotiatedPrice + Math.max(0, i.acquisitionFee) + Math.max(0, i.otherCapitalizedFees);
  const adjustedCapCost = grossCapCost - i.capCostReduction;
  const residualValue = (i.msrp * i.residualPct) / 100;
  if (adjustedCapCost <= 0) return null;
  const depreciation = (adjustedCapCost - residualValue) / n;
  const rentCharge = (adjustedCapCost + residualValue) * i.moneyFactor;
  const basePayment = depreciation + rentCharge;
  const tax = (basePayment * i.salesTaxPct) / 100;
  const payment = basePayment + tax;
  return {
    grossCapCost,
    adjustedCapCost,
    residualValue,
    depreciation,
    rentCharge,
    basePayment,
    tax,
    payment,
    aprEquivalent: moneyFactorToApr(i.moneyFactor),
    totalDepreciation: depreciation * n,
    totalRentCharge: rentCharge * n,
    totalOfPayments: payment * n,
    totalLeaseCost: payment * n + i.capCostReduction,
  };
}

// ---------------------------------------------------------------------------
// Debt payoff (avalanche / snowball / minimum only)
// ---------------------------------------------------------------------------

export interface Debt {
  name: string;
  balance: number;
  aprPct: number;
  minPayment: number;
}

export type PayoffStrategy = 'avalanche' | 'snowball' | 'minimum';

export interface PayoffResult {
  strategy: PayoffStrategy;
  /** Months until every debt is gone; null when some debt never pays off within the cap. */
  months: number | null;
  totalInterest: number;
  totalPaid: number;
  /** Debts in the order they were cleared, with the month each hit zero. */
  order: { name: string; month: number; interest: number }[];
  /** Total balance at the end of each month (index 0 = start). */
  balances: number[];
  /** Debts that never get paid off because the payment does not exceed their interest. */
  stuck: string[];
}

export const PAYOFF_MONTH_CAP = 600;

/**
 * How a debt's yearly rate becomes a monthly one.
 * - 'nominal': APR / 12, as US, Canadian and Australian card rates are quoted.
 * - 'effective': the rate is an annual equivalent that already includes
 *   monthly compounding, as a UK APR is, so the monthly rate is
 *   (1 + APR)^(1/12) - 1. On £3,000 at 19% APR paid at £74 a month this gives
 *   the FCA's own example: 62 months and about £1,576 of interest.
 */
export type RateBasis = 'nominal' | 'effective';

/** Monthly interest rate (a fraction) for a yearly rate in percent. */
export function monthlyRate(aprPct: number, basis: RateBasis = 'nominal'): number {
  return basis === 'effective' ? Math.pow(1 + aprPct / 100, 1 / 12) - 1 : aprPct / 1200;
}

export function simulatePayoff(debts: Debt[], monthlyBudget: number, strategy: PayoffStrategy, rateBasis: RateBasis = 'nominal'): PayoffResult {
  const ds = debts
    .map((d, idx) => ({ ...d, idx, balance: Math.max(0, d.balance), minPayment: Number.isFinite(d.minPayment) ? Math.max(0, d.minPayment) : 0, interestPaid: 0, paidOffMonth: 0 }))
    .filter((d) => d.balance > 0);
  const priority = [...ds].sort((a, b) =>
    strategy === 'snowball'
      ? a.balance - b.balance || b.aprPct - a.aprPct || a.idx - b.idx
      : b.aprPct - a.aprPct || a.balance - b.balance || a.idx - b.idx,
  );
  // A negative or non-numeric budget pays nothing rather than adding to the balances.
  const budget = Number.isFinite(monthlyBudget) ? Math.max(0, monthlyBudget) : 0;
  const balances = [ds.reduce((s, d) => s + d.balance, 0)];
  const order: PayoffResult['order'] = [];
  let totalInterest = 0;
  let totalPaid = 0;
  let month = 0;
  while (ds.some((d) => d.balance > EPS) && month < PAYOFF_MONTH_CAP) {
    month++;
    let pool = strategy === 'minimum' ? Infinity : budget;
    for (const d of ds) {
      if (d.balance <= EPS) continue;
      const interest = rateBasis === 'effective' ? d.balance * monthlyRate(d.aprPct, rateBasis) : (d.balance * d.aprPct) / 1200;
      d.balance += interest;
      d.interestPaid += interest;
      totalInterest += interest;
    }
    for (const d of ds) {
      if (d.balance <= EPS) continue;
      const pay = Math.min(d.minPayment, d.balance, pool);
      d.balance -= pay;
      pool -= pay;
      totalPaid += pay;
    }
    if (strategy !== 'minimum') {
      for (const d of priority) {
        if (pool <= EPS) break;
        if (d.balance <= EPS) continue;
        const pay = Math.min(pool, d.balance);
        d.balance -= pay;
        pool -= pay;
        totalPaid += pay;
      }
    }
    for (const d of ds) {
      if (d.balance <= EPS && !d.paidOffMonth) {
        d.balance = 0;
        d.paidOffMonth = month;
        order.push({ name: d.name, month, interest: d.interestPaid });
      }
    }
    balances.push(ds.reduce((s, d) => s + d.balance, 0));
  }
  const done = ds.every((d) => d.balance <= EPS);
  return {
    strategy,
    months: done ? month : null,
    totalInterest,
    totalPaid,
    order,
    balances,
    stuck: done ? [] : ds.filter((d) => d.balance > EPS).map((d) => d.name),
  };
}

// ---------------------------------------------------------------------------
// Debt-to-income
// ---------------------------------------------------------------------------

export interface DtiResult {
  frontEnd: number;
  backEnd: number;
  totalDebts: number;
}

export function calculateDti(grossMonthlyIncome: number, housing: number, otherDebts: number): DtiResult | null {
  if (!finite(grossMonthlyIncome, housing, otherDebts) || grossMonthlyIncome <= 0 || housing < 0 || otherDebts < 0) return null;
  const totalDebts = housing + otherDebts;
  return { frontEnd: (housing / grossMonthlyIncome) * 100, backEnd: (totalDebts / grossMonthlyIncome) * 100, totalDebts };
}

export interface DtiGuideline {
  id: string;
  label: string;
  /** Typical front-end limit in percent, or null if the program does not use one. */
  frontEnd: number | null;
  backEnd: number;
  note: string;
}

/** Typical published limits. Lenders overlay their own rules; these are not approval guarantees. */
export const DTI_GUIDELINES: DtiGuideline[] = [
  { id: 'rule', label: msg('28/36 rule of thumb'), frontEnd: 28, backEnd: 36, note: msg('Classic budgeting guideline, not a lender rule.') },
  { id: 'conventional', label: msg('Conventional (Fannie Mae)'), frontEnd: null, backEnd: 36, note: msg('36% for manual underwriting, up to 45% with strong credit and reserves, up to 50% through Desktop Underwriter.') },
  { id: 'fha', label: 'FHA', frontEnd: 31, backEnd: 43, note: msg('31/43 for manual underwriting; higher ratios with compensating factors or automated approval.') },
  { id: 'va', label: 'VA', frontEnd: null, backEnd: 41, note: msg('41% guideline; VA also checks residual income and can approve above 41%.') },
  { id: 'usda', label: 'USDA', frontEnd: 29, backEnd: 41, note: msg('29/41; higher with an automated approval and compensating factors.') },
];

export function dtiBand(backEnd: number): 'good' | 'ok' | 'stretched' | 'high' {
  if (backEnd <= 36) return 'good';
  if (backEnd <= 43) return 'ok';
  if (backEnd <= 50) return 'stretched';
  return 'high';
}

/**
 * Debt-service rules by market (localized versions). 'us' is the table and
 * bands above. 'ca' is Canada's gross debt service (GDS) and total debt
 * service (TDS) ratios: CMHC caps insured mortgages at GDS 39% and TDS 44%,
 * with GDS covering principal, interest, property taxes, heating and half of
 * any condo fees, and the ratios worked out at the qualifying rate.
 */
export type DtiRules = 'us' | 'ca';

export const CA_DTI_GUIDELINES: DtiGuideline[] = [
  { id: 'cmhc', label: msg('CMHC insured mortgage'), frontEnd: 39, backEnd: 44, note: msg('GDS up to 39% and TDS up to 44%, at the qualifying rate (the higher of the contract rate plus 2 points and 5.25%).') },
];

export function dtiGuidelines(rules: DtiRules = 'us'): DtiGuideline[] {
  return rules === 'ca' ? CA_DTI_GUIDELINES : DTI_GUIDELINES;
}

/** Band against a market's rules. For 'ca': within both CMHC limits, within one, or above both. */
export function dtiBandFor(rules: DtiRules, frontEnd: number, backEnd: number): 'good' | 'ok' | 'stretched' | 'high' {
  if (rules !== 'ca') return dtiBand(backEnd);
  const gdsOk = frontEnd <= 39 + 1e-9;
  const tdsOk = backEnd <= 44 + 1e-9;
  if (gdsOk && tdsOk) return 'good';
  if (gdsOk || tdsOk) return 'stretched';
  return 'high';
}

// ---------------------------------------------------------------------------
// Student loan
// ---------------------------------------------------------------------------

export interface StudentLoanInput {
  balance: number;
  ratePct: number;
  termYears: number;
  /** Months in school / grace / deferment before repayment starts. */
  deferMonths: number;
  /** Subsidized loans do not accrue interest while deferred. */
  subsidized: boolean;
  /** Pay the interest monthly while deferred so none accrues. */
  payInterestWhileDeferred: boolean;
  /** Add unpaid interest to principal when repayment starts. */
  capitalize: boolean;
  extraMonthly: number;
}

export interface StudentLoanResult {
  accruedInterest: number;
  interestPaidWhileDeferred: number;
  capitalizedInterest: number;
  /** Principal at the start of repayment (after any capitalization). */
  repaymentPrincipal: number;
  /** Unpaid, uncapitalized interest outstanding at the start of repayment. */
  outstandingInterest: number;
  payment: number;
  months: number;
  repaymentInterest: number;
  totalInterest: number;
  totalPaid: number;
  baselineMonths: number;
  baselineInterest: number;
  rows: AmortRow[];
}

/**
 * Simulates repayment where unpaid accrued interest (not capitalized) is
 * paid first and does not itself earn interest, as on federal loans.
 */
function simulateWithAccrued(principal: number, accrued: number, ratePct: number, payment: number, maxMonths: number) {
  const r = ratePct / 1200;
  let p = principal;
  let a = accrued;
  let interestTotal = 0;
  let paid = 0;
  const rows: AmortRow[] = [];
  for (let m = 1; (p > EPS || a > EPS) && m <= maxMonths; m++) {
    const interest = p * r;
    a += interest;
    interestTotal += interest;
    let pay = Math.min(payment, p + a);
    const toInterest = Math.min(pay, a);
    a -= toInterest;
    pay -= toInterest;
    const toPrincipal = Math.min(pay, p);
    p -= toPrincipal;
    paid += toInterest + toPrincipal;
    if (p < EPS) p = 0;
    rows.push({ month: m, payment: toInterest + toPrincipal, interest, principal: toPrincipal, extra: 0, balance: p + a });
  }
  return { rows, interestTotal, paid, months: rows.length, cleared: p <= EPS && a <= EPS };
}

export function calculateStudentLoan(i: StudentLoanInput): StudentLoanResult | null {
  if (!finite(i.balance, i.ratePct, i.termYears, i.deferMonths, i.extraMonthly)) return null;
  if (i.balance <= 0 || i.ratePct < 0 || i.termYears <= 0 || i.deferMonths < 0 || i.extraMonthly < 0) return null;
  const n = Math.round(i.termYears * 12);
  if (n < 1) return null;
  const defer = Math.round(i.deferMonths);
  // Federal loans use simple interest: deferment interest accrues on principal only.
  const deferInterest = i.subsidized ? 0 : (i.balance * i.ratePct * defer) / 1200;
  const interestPaidWhileDeferred = i.payInterestWhileDeferred ? deferInterest : 0;
  const accrued = deferInterest - interestPaidWhileDeferred;
  const capitalizedInterest = i.capitalize ? accrued : 0;
  const repaymentPrincipal = i.balance + capitalizedInterest;
  const outstandingInterest = accrued - capitalizedInterest;
  let payment: number;
  if (outstandingInterest <= EPS) {
    payment = monthlyPayment(repaymentPrincipal, i.ratePct, n);
  } else {
    // Level payment that clears principal and the uncapitalized interest in n months.
    let lo = monthlyPayment(repaymentPrincipal, i.ratePct, n);
    let hi = lo + outstandingInterest;
    for (let k = 0; k < 100; k++) {
      const mid = (lo + hi) / 2;
      const s = simulateWithAccrued(repaymentPrincipal, outstandingInterest, i.ratePct, mid, n);
      if (s.cleared) hi = mid;
      else lo = mid;
    }
    payment = hi;
  }
  const run = (pay: number) => simulateWithAccrued(repaymentPrincipal, outstandingInterest, i.ratePct, pay, n * 4 + 1200);
  const withExtra = run(payment + i.extraMonthly);
  const base = run(payment);
  return {
    accruedInterest: deferInterest,
    interestPaidWhileDeferred,
    capitalizedInterest,
    repaymentPrincipal,
    outstandingInterest,
    payment,
    months: withExtra.months,
    repaymentInterest: withExtra.interestTotal,
    totalInterest: deferInterest + withExtra.interestTotal,
    totalPaid: interestPaidWhileDeferred + withExtra.paid,
    baselineMonths: base.months,
    baselineInterest: deferInterest + base.interestTotal,
    rows: withExtra.rows,
  };
}

// ---------------------------------------------------------------------------
// APR
// ---------------------------------------------------------------------------

export interface AprInput {
  loanAmount: number;
  ratePct: number;
  termMonths: number;
  /** Prepaid finance charges: origination, broker and similar fees. */
  fees: number;
  /** Discount points as a percent of the loan amount. */
  pointsPct: number;
  /** true: fees are added to the loan balance; false: fees are paid from the loan proceeds / at closing. */
  financeFees: boolean;
}

export interface AprResult {
  financeCharges: number;
  /** Amount financed (what you effectively receive) in the Truth in Lending sense. */
  amountFinanced: number;
  /** The balance the payment is computed on. */
  noteAmount: number;
  payment: number;
  aprPct: number;
  effectiveAnnualPct: number;
  nominalEffectivePct: number;
  totalInterest: number;
  /** Interest plus fees: the TILA finance charge. */
  totalFinanceCharge: number;
}

/** Solves for the nominal annual rate (percent) whose monthly payments have present value `pv`. */
export function solveRate(pv: number, payment: number, months: number): number {
  if (pv <= 0 || payment <= 0 || months <= 0) return NaN;
  if (payment * months <= pv + 1e-9) return 0;
  let lo = 0;
  let hi = 1; // 100% per month upper bound
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (presentValue(payment, mid, months) > pv) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 1200;
}

export function calculateApr(i: AprInput): AprResult | null {
  if (!finite(i.loanAmount, i.ratePct, i.termMonths, i.fees, i.pointsPct)) return null;
  if (i.loanAmount <= 0 || i.ratePct < 0 || i.termMonths <= 0 || i.fees < 0 || i.pointsPct < 0) return null;
  const n = Math.round(i.termMonths);
  if (n < 1) return null;
  const financeCharges = i.fees + (i.loanAmount * i.pointsPct) / 100;
  const noteAmount = i.financeFees ? i.loanAmount + financeCharges : i.loanAmount;
  const amountFinanced = noteAmount - financeCharges;
  if (amountFinanced <= 0) return null;
  const payment = monthlyPayment(noteAmount, i.ratePct, n);
  const aprPct = financeCharges === 0 ? i.ratePct : solveRate(amountFinanced, payment, n);
  const totalInterest = payment * n - noteAmount;
  return {
    financeCharges,
    amountFinanced,
    noteAmount,
    payment,
    aprPct,
    effectiveAnnualPct: effectiveAnnualRate(aprPct),
    nominalEffectivePct: effectiveAnnualRate(i.ratePct),
    totalInterest,
    totalFinanceCharge: totalInterest + financeCharges,
  };
}

/**
 * APR as Canada's Financial Consumer Protection Framework Regulations
 * (SOR/2021-181, s. 47) prescribe it for a loan other than a credit card or
 * line of credit: APR = C / (T × P) × 100, where C is the cost of borrowing
 * over the term (interest plus the fees in s. 48), T the term in years and P
 * the average principal outstanding at the end of each interest period
 * before that period's payment is subtracted. Payments go to the cost of
 * borrowing first (s. 47(2)(b)), so P is the opening principal of each month
 * of the note's schedule. With no fees it equals the note rate.
 */
export function canadaApr(i: AprInput): number | null {
  const base = calculateApr(i);
  if (!base) return null;
  const n = Math.round(i.termMonths);
  const sched = amortize(base.noteAmount, i.ratePct, n);
  if (sched.rows.length === 0) return null;
  let opening = base.noteAmount;
  let sum = 0;
  for (const row of sched.rows) {
    sum += opening;
    opening = row.balance;
  }
  const averagePrincipal = sum / n;
  const cost = sched.totalInterest + base.financeCharges;
  return (cost / ((n / 12) * averagePrincipal)) * 100;
}

/**
 * Effective annual cost (nominal, monthly compounding) if the loan is repaid
 * in full after `holdMonths`: the rate that equates the amount financed with
 * the payments made plus the balance paid off at that point. Fees spread over
 * fewer years cost more per year, so this rises as holdMonths falls.
 */
export function aprIfRepaidAfter(i: AprInput, holdMonths: number): number | null {
  const base = calculateApr(i);
  if (!base) return null;
  const n = Math.round(i.termMonths);
  const k = Math.min(Math.round(holdMonths), n);
  if (k <= 0) return null;
  const r = i.ratePct / 1200;
  const balanceAt = (m: number) => (r === 0 ? base.noteAmount - base.payment * m : base.noteAmount * Math.exp(m * Math.log1p(r)) - (base.payment * Math.expm1(m * Math.log1p(r))) / r);
  const payoff = Math.max(0, balanceAt(k));
  const pvAt = (mr: number) => presentValue(base.payment, mr, k) + payoff / Math.pow(1 + mr, k);
  if (pvAt(0) <= base.amountFinanced) return 0;
  let lo = 0;
  let hi = 1;
  for (let t = 0; t < 200; t++) {
    const mid = (lo + hi) / 2;
    if (pvAt(mid) > base.amountFinanced) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 1200;
}
